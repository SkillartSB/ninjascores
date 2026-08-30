// Vercel serverless function — proxy API-Football (api-sports.io) v3.
//
// Deux raisons d'exister :
//  1. la clé reste côté serveur, jamais exposée au navigateur ;
//  2. le cache CDN découple le quota du trafic — 10 000 visiteurs sur la même
//     page de classement ne coûtent qu'UNE requête à l'API.
//
// Usage côté client :  /api/foot?path=standings&league=61&season=2025

import { gzipSync, gunzipSync } from 'node:zlib';

const BASE = 'https://v3.football.api-sports.io';

// Liste blanche : sans elle, n'importe qui peut brûler le quota avec des
// requêtes arbitraires. Chaque entrée porte sa durée de cache en secondes.
const ENDPOINTS = {
  'status':               60,          // suivi du quota restant
  'countries':            86400,
  'leagues':              86400,       // 24 h — bouge une fois par saison
  'teams':                86400,
  'teams/statistics':     3600,
  'standings':            3600,        // 1 h
  'fixtures':             300,         // 5 min — calendrier
  'fixtures/events':      60,
  'fixtures/lineups':     300,
  'fixtures/players':     3600,        // stats perso par match (fiche joueur)
  'fixtures/statistics':  60,
  'fixtures/headtohead':  86400,
  'players':              86400,
  'players/topscorers':   21600,       // 6 h — ne bouge qu'apres les matchs
  'players/topassists':   21600,
  'players/squads':       86400,
  'transfers':            3600,
  'injuries':             1800,
  'odds':                 900,
  'predictions':          3600,
};

// Le direct doit rester frais : on écrase la TTL quand ?live= est présent.
const TTL_LIVE = 20;

// ── Coupe-circuit quota ──────────────────────────────────────────────────────
// Quand API-Football signale le quota epuise, CHAQUE requete continuait de
// partir vers l'amont pour recevoir la meme erreur — et la reponse etait
// no-store, donc jamais absorbee par le CDN. Les robots qui crawlent les pages
// SSR transformaient la panne en tempete : des centaines d'appels/minute pour
// rien, et le quota du lendemain brule des minuit.
// La variable de module survit tant que l'instance serverless reste chaude :
// ce n'est pas un verrou global parfait, c'est un amortisseur — suffisant pour
// diviser la tempete par le nombre de requetes qu'une instance voit passer.
let quotaMortJusqua = 0;
const QUOTA_PAUSE_MS = 120000;   // 2 min sans appel amont apres un refus quota
const TTL_ERREUR = 60;           // le CDN absorbe les erreurs 60 s

function erreurQuota(erreurs) {
  const texte = JSON.stringify(erreurs || '');
  return /request limit|rate ?limit|too many/i.test(texte);
}

// API-Football a DEUX limites et la confusion coutait cher : la limite par
// minute (~450 req/min, depassee a chaque rafale de crawl) declenchait la
// meme pause de 2 minutes que le quota JOURNALIER — 2 minutes de pages vides
// pour un embouteillage de quelques secondes. Constate le 30/08 : « quota
// epuise » servi alors qu'il restait 109 000 appels.
function pauseQuota(erreurs) {
  const texte = JSON.stringify(erreurs || '');
  if (/per minute|rate ?limit/i.test(texte)) return 8000;
  return QUOTA_PAUSE_MS;
}

function repondreQuotaMort(res, details) {
  // s-maxage : c'est le CDN qui encaisse les robots, pas l'API.
  res.setHeader('Cache-Control', `public, s-maxage=${TTL_ERREUR}`);
  res.status(502).json({ error: 'Quota API-Football épuisé', retry: true, details: details || null });
}

// ── Cache Redis (second etage, derriere le CDN) ─────────────────────────────
// Le CDN Vercel suffirait si nos URLs etaient peu nombreuses ; or les pages
// SSR en produisent des milliers (une par fixture, par equipe, par joueur) et
// le CDN evicte la longue traine en quelques minutes. Resultat mesure les
// 27-28/08 : quota 150 000 brule chaque jour depuis le 15/08, essentiellement
// par les crawlers. Redis, lui, garde TOUT pendant la TTL : un meme appel
// amont n'est refait qu'a l'expiration, quel que soit le nombre d'instances
// ou l'etat du CDN.
// Au passage on compte, par jour UTC et par endpoint : les requetes recues
// (footcnt) et les appels amont reellement partis (footamont). La difference
// entre les deux, c'est ce que le cache economise — et footamont dit ENFIN
// qui brule le quota.
const REDIS_TIMEOUT_MS = 1500;   // Redis en panne ne doit jamais bloquer le proxy
const REDIS_VAL_MAX = 900000;    // au-dela on ne stocke pas (limite Upstash ~1 Mo)

// Compression systematique au-dela de quelques Ko. Les reponses odds/fixtures
// pesent 100 a 800 Ko : les stocker brutes a fait throttler Upstash pendant le
// prechauffage du 30/08 — timeouts en cascade, cache aveugle au pire moment.
// Gzip les ramene a ~10 % ; le prefixe marque les valeurs compressees pour
// relire les deux formats pendant la transition.
const GZ_PREFIXE = 'gz1:';
const GZ_SEUIL = 4096;

function compresser(texte) {
  if (texte.length < GZ_SEUIL) return texte;
  try { return GZ_PREFIXE + gzipSync(texte).toString('base64'); }
  catch (e) { return texte; }
}

function decompresser(stocke) {
  if (typeof stocke !== 'string' || !stocke.startsWith(GZ_PREFIXE)) return stocke;
  try { return gunzipSync(Buffer.from(stocke.slice(GZ_PREFIXE.length), 'base64')).toString('utf8'); }
  catch (e) { return null; }
}

async function redisPipeline(commandes) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(url + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(commandes),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

function jourUTC() { return new Date().toISOString().slice(0, 10); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    res.status(500).json({ error: 'API_FOOTBALL_KEY absente des variables d\'environnement' });
    return;
  }

  const { path, ...params } = req.query;

  // Tableau de bord du quota : /api/foot/?path=compteurs
  // Par jour et par endpoint — `recues` (requetes arrivees au proxy) et
  // `amont` (appels reellement partis vers API-Football). Rien de sensible.
  if (path === 'compteurs') {
    const jours = [0, 1, 2].map((n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10));
    const eps = Object.keys(ENDPOINTS).concat([
      'direct-push-goals', 'direct-capture-mt', 'direct-archive-matches',
      'direct-stats-mt', 'direct-transferts',
    ]);
    const cmds = [];
    for (const j of jours) {
      cmds.push(['MGET', ...eps.map((e) => `footcnt:${j}:${e}`)]);
      cmds.push(['MGET', ...eps.map((e) => `footamont:${j}:${e}`)]);
    }
    const rep = await redisPipeline(cmds);
    if (!rep) { res.status(503).json({ error: 'Redis indisponible' }); return; }
    const sortie = {};
    jours.forEach((j, i) => {
      const recues = rep[i * 2] && rep[i * 2].result;
      const amont = rep[i * 2 + 1] && rep[i * 2 + 1].result;
      sortie[j] = {};
      eps.forEach((e, k) => {
        const r = recues && Number(recues[k] || 0), a = amont && Number(amont[k] || 0);
        if (r || a) sortie[j][e] = { recues: r || 0, amont: a || 0 };
      });
    });
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    res.status(200).json(sortie);
    return;
  }

  if (!path || !Object.prototype.hasOwnProperty.call(ENDPOINTS, path)) {
    res.status(400).json({
      error: 'Endpoint non autorisé',
      autorises: Object.keys(ENDPOINTS),
    });
    return;
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.append(k, Array.isArray(v) ? v[0] : v);
  }

  let ttl = ('live' in params) ? TTL_LIVE : ENDPOINTS[path];
  // TTL differenciees mesurees sur les compteurs du 29-30/08 : `fixtures`
  // pesait 34 000 appels amont/jour a lui seul, parce que sa TTL de 300 s
  // fait repayer chaque page a chaque passage de robot. Or la fraicheur ne
  // se joue que sur le calendrier du jour et le direct : la liste des matchs
  // d'une equipe ou la fiche d'un match a venir ne bougent pas en 5 minutes.
  if (!('live' in params)) {
    if (path === 'fixtures' && ('team' in params || 'id' in params || 'h2h' in params)) ttl = 3600;
    if (path === 'fixtures/lineups') ttl = 1800;   // compos probables : quasi figees avant l'heure d'avant-match
    if (path === 'odds') ttl = 1800;
  }

  // `status` reste exempte : c'est le thermometre du quota (1 appel/min au
  // pire, TTL 60 s) — le couper rendrait la panne invisible au moment precis
  // ou on a besoin de la voir.
  if (path !== 'status' && Date.now() < quotaMortJusqua) return repondreQuotaMort(res);

  // Cle stable : les parametres sont tries pour que ?team=1&last=8 et
  // ?last=8&team=1 partagent la meme entree.
  qs.sort();
  const cleRedis = 'foot:' + path + '?' + qs.toString();
  const jour = jourUTC();

  if (path !== 'status') {
    const lu = await redisPipeline([
      ['GET', cleRedis],
      ['INCR', `footcnt:${jour}:${path}`],
      ['EXPIRE', `footcnt:${jour}:${path}`, 604800],
    ]);
    const stocke = decompresser(lu && lu[0] && lu[0].result);
    if (stocke) {
      res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}`);
      res.setHeader('X-Cache-Foot', 'redis');
      res.status(200).send(stocke);
      return;
    }
  }

  try {
    const r = await fetch(`${BASE}/${path}?${qs.toString()}`, {
      headers: { 'x-apisports-key': key },
    });

    // On remonte le quota restant : utile pour surveiller sans appeler /status.
    const reste = r.headers.get('x-ratelimit-requests-remaining');
    const total = r.headers.get('x-ratelimit-requests-limit');
    if (reste) res.setHeader('X-Quota-Restant', reste);
    if (total) res.setHeader('X-Quota-Total', total);

    if (!r.ok) throw new Error(`API HTTP ${r.status}`);
    const json = await r.json();

    // API-Football répond 200 même en cas d'erreur métier : on ne met pas en
    // cache une réponse fautive, sinon elle reste servie pendant des heures.
    const erreurs = json && json.errors;
    const enErreur = erreurs && (Array.isArray(erreurs) ? erreurs.length : Object.keys(erreurs).length);

    if (enErreur) {
      if (erreurQuota(erreurs)) {
        quotaMortJusqua = Date.now() + pauseQuota(erreurs);
        return repondreQuotaMort(res, erreurs);
      }
      // Erreur metier ponctuelle (mauvais parametre…) : courte absorption CDN
      // plutot que no-store — un robot qui boucle sur une URL cassee ne doit
      // pas se traduire en appels amont en boucle.
      res.setHeader('Cache-Control', `public, s-maxage=${TTL_ERREUR}`);
      res.status(502).json({ error: 'Erreur API-Football', details: erreurs });
      return;
    }

    // Reponse valide : on la range dans Redis pour la duree de la TTL, et on
    // compte l'appel amont. Une reponse en erreur n'arrive jamais ici (voir
    // plus haut) — on ne fige donc jamais une panne dans le cache.
    if (path !== 'status') {
      const serialise = compresser(JSON.stringify(json));
      const cmds = [
        ['INCR', `footamont:${jour}:${path}`],
        ['EXPIRE', `footamont:${jour}:${path}`, 604800],
      ];
      if (serialise.length < REDIS_VAL_MAX) cmds.push(['SETEX', cleRedis, ttl, serialise]);
      await redisPipeline(cmds);
    }

    res.setHeader('Cache-Control',
      `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}`);
    res.status(200).json(json);
  } catch (e) {
    console.error('[foot]', path, e.message);
    if (/HTTP 429/.test(e.message)) quotaMortJusqua = Date.now() + 8000;   // 429 = limite minute, pas le quota du jour
    res.setHeader('Cache-Control', `public, s-maxage=${TTL_ERREUR}`);
    res.status(502).json({ error: 'Appel API-Football échoué' });
  }
}
