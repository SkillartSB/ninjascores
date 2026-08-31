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

// Quota de commandes Upstash epuise (limite mensuelle du plan gratuit) : on
// coupe Redis 15 min pour ne pas payer deux allers-retours inutiles par
// requete. Le proxy fonctionne alors comme avant Redis : CDN + amont.
let redisMortJusqua = 0;

async function redisPipeline(commandes) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  if (Date.now() < redisMortJusqua) return null;
  try {
    const r = await fetch(url + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(commandes),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const rep = await r.json();
    if (Array.isArray(rep) && rep.some((x) => x && typeof x.error === 'string' && x.error.includes('max requests limit'))) {
      redisMortJusqua = Date.now() + 900000;
      return null;
    }
    return rep;
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
  // Auto-test Redis : /api/foot/?path=compteurs&test=1 — ecrit une grosse et
  // une petite valeur puis les relit, en remontant les erreurs PAR COMMANDE
  // qu'Upstash renvoie (le pipeline repond 200 meme quand une commande echoue,
  // et on les ignorait silencieusement).
  if (path === 'compteurs' && 'test' in params) {
    const grosse = 'x'.repeat(30000);
    const rep = await redisPipeline([
      ['SETEX', 'foottest:grosse', 120, grosse],
      ['GET', 'foottest:grosse'],
      ['SETEX', 'foottest:petite', 120, 'ok'],
      ['GET', 'foottest:petite'],
    ]);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      pipelineOk: !!rep,
      resultats: (rep || []).map((r) => r && r.error ? { error: r.error } :
        { result: typeof (r && r.result) === 'string' && r.result.length > 40 ? r.result.slice(0, 20) + '…(' + r.result.length + ')' : (r && r.result) }),
    });
    return;
  }

  if (path === 'compteurs') {
    const jours = [0, 1, 2].map((n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10));
    const eps = Object.keys(ENDPOINTS).concat([
      'cotes-jour',
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

  // ── Agrégat des cotes 1/N/2 d'une journée : ?path=cotes-jour&date=AAAA-MM-JJ
  // Le calendrier faisait ce travail DANS LE NAVIGATEUR : 1 appel odds&date
  // paginé par 10 (jusqu'à 24 pages) + un rattrapage par championnat (jusqu'à
  // 40 appels, moitié en 502) — 60 à 90 allers-retours à ~400 ms depuis
  // l'Asie = les 5-8 s de chargement constatées le 31/08. Ici le même
  // assemblage se fait une fois, à côté de Redis, et le client ne paie plus
  // qu'UNE requête. On ne garde que le marché Match Winner des bookmakers que
  // les préférences GEO du client connaissent (s6.js) : le choix final par
  // pays reste côté client, la donnée voyage compacte.
  if (path === 'cotes-jour') {
    const date = String(params.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: 'date invalide (AAAA-MM-JJ)' }); return; }
    const TTL_AGREGAT = 900;                     // aligné sur la TTL odds
    const cle = 'foot:cotes-jour?' + date;
    const jour = jourUTC();
    const lu = await redisPipeline([
      ['GET', cle],
      ['INCR', `footcnt:${jour}:cotes-jour`],
      ['EXPIRE', `footcnt:${jour}:cotes-jour`, 604800],
    ]);
    const stocke = decompresser(lu && lu[0] && lu[0].result);
    if (stocke) {
      res.setHeader('Cache-Control', `public, s-maxage=${TTL_AGREGAT}, stale-while-revalidate=3600`);
      res.setHeader('X-Cache-Foot', 'redis');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send(stocke);
      return;
    }

    // Appels internes via le proxy lui-même (recursion HTTP profondeur 1,
    // même mécanique que api/prechauffe.js) : chaque page profite du cache
    // Redis/CDN existant et des compteurs.
    const interne = async (chemin) => {
      try {
        const r = await fetch('https://ninjascores.com/api/foot/?path=' + chemin, { signal: AbortSignal.timeout(20000) });
        if (!r.ok) return null;
        return await r.json();
      } catch (e) { return null; }
    };
    const enFile = async (taches, largeur) => {
      const sortie = new Array(taches.length); let i = 0;
      const fil = async () => { while (i < taches.length) { const k = i++; sortie[k] = await taches[k](); } };
      await Promise.all(Array.from({ length: Math.min(largeur, taches.length) || 1 }, fil));
      return sortie;
    };
    const GARDES = new Set([8, 11, 7, 2, 32, 1]);   // union des préférences GEO de s6.js
    const matchs = {};
    const absorber = (rep) => (rep && rep.response || []).forEach((o) => {
      if (!o || !o.fixture || matchs[o.fixture.id]) return;
      const bks = (o.bookmakers || []).filter((b) => GARDES.has(b.id));
      const lots = (bks.length ? bks : (o.bookmakers || []).slice(0, 1)).map((b) => {
        const mw = (b.bets || []).find((x) => x.name === 'Match Winner');
        if (!mw) return null;
        const v = {};
        (mw.values || []).forEach((x) => { v[x.value] = x.odd; });
        return v.Home && v.Away ? { id: b.id, nom: b.name, c1: v.Home, cN: v.Draw || null, c2: v.Away } : null;
      }).filter(Boolean);
      if (lots.length) matchs[o.fixture.id] = lots;
    });

    const FINIS_AGG = new Set(['FT', 'AET', 'PEN', 'CANC', 'ABD', 'PST', 'WO']);
    const [premiere, jourCal] = await Promise.all([
      interne('odds&date=' + date),
      interne('fixtures&date=' + date),
    ]);
    absorber(premiere);
    const totalPages = (premiere && premiere.paging && premiere.paging.total) || 1;
    const suite = [];
    for (let p = 2; p <= Math.min(totalPages, 25); p++) suite.push(() => interne('odds&date=' + date + '&page=' + p));
    (await enFile(suite, 8)).forEach(absorber);

    // Rattrapage par championnat : l'appel par date est incomplet (constat du
    // 22/07 côté client). Seulement pour les championnats dont il reste un
    // match NON JOUÉ sans cote — les matchs finis n'ont plus de cotes chez le
    // fournisseur, les redemander ne produisait que des 502.
    const parLigue = new Map();
    ((jourCal && jourCal.response) || []).forEach((f) => {
      if (matchs[f.fixture.id]) return;
      if (FINIS_AGG.has(f.fixture.status.short)) return;
      const k = f.league.id + ':' + f.league.season;
      if (!parLigue.has(k)) parLigue.set(k, { id: f.league.id, season: f.league.season });
    });
    const rattrapage = [...parLigue.values()].map((l) => () => interne('odds&date=' + date + '&league=' + l.id + '&season=' + l.season));
    (await enFile(rattrapage, 8)).forEach(absorber);

    const corps = JSON.stringify({ date, matchs });
    const serialise = compresser(corps);
    if (serialise.length < REDIS_VAL_MAX) {
      await redisPipeline([['SETEX', cle, TTL_AGREGAT, serialise]]);
    }
    res.setHeader('Cache-Control', `public, s-maxage=${TTL_AGREGAT}, stale-while-revalidate=3600`);
    res.setHeader('X-Cache-Foot', 'agrege');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(corps);
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
