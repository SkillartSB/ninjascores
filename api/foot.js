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

// ── Coupe-circuit quota (partage entre toutes les instances via Redis) ─────
// Quand API-Football signale le quota epuise, CHAQUE requete continuait de
// partir vers l'amont pour recevoir la meme erreur — et la reponse etait
// no-store, donc jamais absorbee par le CDN. Une variable de module ne survit
// qu'a l'instance serverless qui la porte : avec 50 instances concurrentes,
// chaque instance dilapide un appel pour decouvrir que le quota est mort. Le
// 03/09 on a mesure 200 000+ appels amont sur un quota de 150 000 — la moitie
// du sur-tir venait de ce trou.
// La version Redis partage l'etat : une seule instance decouvre le quota
// mort, ecrit la cle, et toutes les autres la lisent en meme temps que le
// cache principal (pipeline unique, zero aller-retour supplementaire dans le
// chemin chaud). La cle expire d'elle-meme au bout de la pause.
const CLE_QUOTA_MORT = 'foot:quota-mort';
const QUOTA_PAUSE_MS = 120000;   // 2 min pour un refus JOUR
const QUOTA_MINUTE_MS = 8000;    // 8 s pour un refus MINUTE
const TTL_ERREUR = 60;           // le CDN absorbe les erreurs 60 s
// Refresh-ahead pour la chauffe. Le prechauffage passe par ce proxy et est
// idempotent : une cle encore en cache n'est PAS reecrite, donc sa TTL n'est
// jamais prolongee. Constate le 05/09 : cotes ecrites a 09:16 (TTL 45 min,
// expiration 10:01), cron de 09:30 -> en cache, rien ; cron de 10:00 -> encore
// en cache une minute, rien ; 10:01 tout expire ; prochain cron 10:30. Trou de
// 30 min STRUCTUREL, meme avec un cron parfait. Quand la requete vient de la
// chauffe (?_prechauffe=1) et qu'il reste moins que ceci a la cle, on va la
// rechercher en amont et on la reecrit avec sa TTL pleine.
const REFRESH_AHEAD_S = 1800;
// Filet de securite local : si Redis est indisponible, l'instance retient
// quand meme sa derniere connaissance du quota mort pour son propre trafic.
let quotaMortLocal = 0;

function erreurQuota(erreurs) {
  const texte = JSON.stringify(erreurs || '');
  return /request limit|rate ?limit|too many/i.test(texte);
}

// API-Football a DEUX limites et la confusion coutait cher : la limite par
// minute (~450 req/min, depassee a chaque rafale de crawl) declenchait la
// meme pause de 2 minutes que le quota JOURNALIER — 2 minutes de pages vides
// pour un embouteillage de quelques secondes. Constate le 30/08 : « quota
// epuise » servi alors qu'il restait 109 000 appels.
function pauseQuota(erreurs, resteJour) {
  // Source de verite : le header x-ratelimit-requests-remaining donne le
  // quota JOUR restant. S'il en reste, le refus vient forcement de la limite
  // PAR MINUTE, quelle que soit la formulation du message.
  const n = Number(resteJour);
  if (Number.isFinite(n) && n > 0) return QUOTA_MINUTE_MS;
  const texte = JSON.stringify(erreurs || '');
  if (/per minute|rate ?limit/i.test(texte)) return QUOTA_MINUTE_MS;
  return QUOTA_PAUSE_MS;
}
// Duree de vie de la cle Redis foot:quota-mort en SECONDES. Pour un refus
// JOUR on tient jusqu'au reset UTC : la limite est fixe, la relever avant
// minuit ne servira qu'a redepiler les memes 502.
function ttlQuotaMortSec(erreurs, resteJour) {
  // Meme logique que pauseQuota : le header prime sur le texte du message.
  // Bug constate DEUX FOIS le 04/09 : un refus « Too Many Requests » (limite
  // MINUTE) ne matchait ni « per minute » ni « rate limit », tombait dans le
  // cas par defaut, et posait le drapeau jusqu'a minuit UTC alors qu'il
  // restait 88 % du quota jour. Resultat : toute l'app en 502 pendant des
  // heures, avec des matchs a moitie remplis selon ce qui etait deja en cache.
  const n = Number(resteJour);
  if (Number.isFinite(n) && n > 0) return Math.ceil(QUOTA_MINUTE_MS / 1000);
  const texte = JSON.stringify(erreurs || '');
  if (/per minute|rate ?limit/i.test(texte)) return Math.ceil(QUOTA_MINUTE_MS / 1000);
  // Quota jour reellement epuise (ou header absent) : on tient jusqu'au reset
  // UTC, PLAFONNE A 1 H. Ceinture de securite : si on se trompe encore de
  // diagnostic, le drapeau se leve au bout d'une heure au lieu de geler la
  // journee. Si le quota est vraiment mort, le premier appel apres expiration
  // le repose — un appel gaspille par heure, contre une journee perdue.
  const maintenant = new Date();
  const minuit = new Date(maintenant);
  minuit.setUTCHours(24, 0, 0, 0);
  return Math.min(3600, Math.max(60, Math.ceil((minuit - maintenant) / 1000)));
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

  // Reset manuel du verrou quota partage : /api/foot/?path=quota-reset
  // Utile quand le drapeau reste colle apres un incident (constate le 04/09 :
  // le breaker retenait le drapeau alors qu'API-Football avait reset).
  // Effet secondaire : on relance UN appel status pour verifier le vrai etat
  // et le renvoyer dans la reponse.
  if (path === 'quota-reset') {
    await redisPipeline([['DEL', CLE_QUOTA_MORT]]);
    quotaMortLocal = 0;
    let statut = null;
    try {
      const r = await fetch(`${BASE}/status`, { headers: { 'x-apisports-key': key } });
      statut = r.ok ? await r.json() : null;
    } catch (e) {}
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, drapeauSupprime: true, statutAmont: statut });
    return;
  }

  // Auto-recuperation : si le breaker a plus de 5 minutes ET que status amont
  // dit que le quota est OK, on efface silencieusement. Evite un incident
  // permanent quand une instance a mis le drapeau puis meurt sans que
  // personne ne le retire (ex: reset UTC entre-temps).
  // Le check status ne compte QUE 1 appel amont, on peut se le permettre
  // rarement.

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
      // Sous-compteurs `fixtures` (voir bloc `sousCompteur` plus bas) : le
      // meme endpoint sert quatre usages tres differents et il faut savoir
      // lequel bruit le quota (constate le 03/09 : fixtures = 63 % sans
      // savoir lequel).
      'fixtures:date', 'fixtures:id', 'fixtures:team', 'fixtures:live',
      'fixtures:league', 'fixtures:autre',
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

  // Les parametres prefixes « _ » sont a nous (cache-buster, mode chauffe) :
  // ils ne partent JAMAIS en amont. API-Football rejette tout champ inconnu
  // (« The S field do not exist ») — un ?&s=1 ajoute pour contourner le CDN
  // faisait tomber la requete en 502, constate le 05/09.
  const modeChauffe = '_prechauffe' in params;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k.startsWith('_')) continue;
    if (v !== undefined && v !== '') qs.append(k, Array.isArray(v) ? v[0] : v);
  }

  let ttl = ('live' in params) ? TTL_LIVE : ENDPOINTS[path];
  // TTL differenciees mesurees sur les compteurs du 29-30/08 : `fixtures`
  // pesait 34 000 appels amont/jour a lui seul, parce que sa TTL de 300 s
  // fait repayer chaque page a chaque passage de robot. Or la fraicheur ne
  // se joue que sur le calendrier du jour et le direct : la liste des matchs
  // d'une equipe ou la fiche d'un match a venir ne bougent pas en 5 minutes.
  if (!('live' in params)) {
    if (path === 'fixtures' && ('id' in params || 'h2h' in params)) ttl = 3600;
    // La forme d'une equipe (fixtures?team=X&last=N) ne change que quand elle
    // joue, environ une fois par semaine. Elle etait pourtant cachee 1 h : le
    // 05/09 c'etait 14 % du quota (9 493 appels amont a 10:17), essentiellement
    // le crawl SEO des pages equipe et des blocs forme des pages match. 3 h
    // divise ce poste par trois sans effet visible pour l'utilisateur.
    if (path === 'fixtures' && 'team' in params) ttl = 10800;
    // TTL calees sur la periode du cron de chauffe (30 min, Vercel Cron) AVEC
    // une marge : a TTL = periode exactement, la donnee expire a l'instant ou
    // le cron suivant demarre et il y a un trou de quelques secondes a chaque
    // cycle. Constate le 05/09 avec GitHub Actions en retard de 2 a 5 h : tout
    // expirait entre deux passages, 10 % de completude au reveil.
    if (path === 'fixtures/lineups') ttl = 2100;   // 35 min — les compos officielles tombent ~1 h avant, la fraicheur compte
    if (path === 'odds') ttl = 2700;               // 45 min — les cotes bougent lentement
  }

  // `status` reste exempte : c'est le thermometre du quota (1 appel/min au
  // pire, TTL 60 s) — le couper rendrait la panne invisible au moment precis
  // ou on a besoin de la voir. Le check Redis vient plus bas, dans le
  // pipeline principal, pour n'ajouter aucun aller-retour au chemin chaud.
  if (path !== 'status' && Date.now() < quotaMortLocal) return repondreQuotaMort(res);

  // Cle stable : les parametres sont tries pour que ?team=1&last=8 et
  // ?last=8&team=1 partagent la meme entree.
  qs.sort();
  const cleRedis = 'foot:' + path + '?' + qs.toString();
  const jour = jourUTC();

  // Sous-compteur pour `fixtures` : cet endpoint sert TROIS usages tres
  // differents (calendrier, page match, page equipe, direct) qui n'ont ni
  // les memes TTL ni les memes volumes. Les agreger ensemble masquait
  // lequel bruit le quota (constate le 03/09 : 63 % du quota sur fixtures
  // sans savoir lequel). On ecrit UN compteur en plus du principal.
  let sousCompteur = null;
  if (path === 'fixtures') {
    if ('live' in params)      sousCompteur = 'fixtures:live';
    else if ('id' in params)   sousCompteur = 'fixtures:id';
    else if ('team' in params) sousCompteur = 'fixtures:team';
    else if ('date' in params) sousCompteur = 'fixtures:date';
    else if ('league' in params) sousCompteur = 'fixtures:league';
    else                       sousCompteur = 'fixtures:autre';
  }

  if (path !== 'status') {
    // Ordre du pipeline : (0) verrou quota partage, (1) cache principal, puis
    // les compteurs. Un seul aller-retour Redis pour l'ensemble — le verrou
    // ne coute rien de plus.
    const cmdsGet = [
      ['GET', CLE_QUOTA_MORT],
      ['GET', cleRedis],
      ['INCR', `footcnt:${jour}:${path}`],
      ['EXPIRE', `footcnt:${jour}:${path}`, 604800],
      ['TTL', cleRedis],          // secondes restantes (-2 absente, -1 sans TTL)
    ];
    if (sousCompteur) {
      cmdsGet.push(['INCR', `footcnt:${jour}:${sousCompteur}`]);
      cmdsGet.push(['EXPIRE', `footcnt:${jour}:${sousCompteur}`, 604800]);
    }
    const lu = await redisPipeline(cmdsGet);
    const stocke = decompresser(lu && lu[1] && lu[1].result);
    // Index 4 = TTL (apres GET, GET, INCR, EXPIRE ; le sous-compteur, s'il
    // existe, est ajoute APRES et ne decale rien).
    const ttlRestante = lu && lu[4] && typeof lu[4].result === 'number' ? lu[4].result : -2;
    const bientotExpire = modeChauffe && ttlRestante >= 0 && ttlRestante < REFRESH_AHEAD_S;
    if (stocke && !bientotExpire) {
      // Mode chauffe : no-store ICI AUSSI. Constate le 05/09 : un hit Redis
      // en mode chauffe repondait public+s-maxage, le CDN gardait l'URL
      // ?_prechauffe=1, et le passage suivant de la chauffe etait servi par
      // le CDN sans atteindre la fonction — donc sans evaluer le
      // refresh-ahead. Le trou de 30 min revenait par la porte du CDN.
      res.setHeader('Cache-Control', modeChauffe ? 'no-store'
        : `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}`);
      res.setHeader('X-Cache-Foot', 'redis');
      res.status(200).send(stocke);
      return;
    }
    if (bientotExpire) res.setHeader('X-Cache-Foot', 'refresh-ahead');
    // Quota mort partage : si une autre instance a decouvert la panne, on
    // s'arrete ici sans depenser un aller-retour amont pour re-decouvrir.
    // La cle expire d'elle-meme au reset UTC (ou apres 8 s pour un refus
    // minute).
    if (lu && lu[0] && lu[0].result) {
      quotaMortLocal = Date.now() + 60000;   // filet local si Redis retombe
      return repondreQuotaMort(res);
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
        // Verrou partage via Redis : toutes les instances savent que le
        // quota est mort a partir du prochain pipeline (donc quasi-immediat).
        // La cle s'auto-detruit apres la duree calculee (jusqu'au reset UTC
        // pour un refus JOUR, 8 s pour un refus MINUTE).
        quotaMortLocal = Date.now() + pauseQuota(erreurs, reste);
        await redisPipeline([['SETEX', CLE_QUOTA_MORT, ttlQuotaMortSec(erreurs, reste), '1']]);
        return repondreQuotaMort(res, erreurs);
      }
      // Erreur metier ponctuelle (mauvais parametre…) : courte absorption CDN
      // plutot que no-store — un robot qui boucle sur une URL cassee ne doit
      // pas se traduire en appels amont en boucle.
      res.setHeader('Cache-Control', `public, s-maxage=${TTL_ERREUR}`);
      res.status(502).json({ error: 'Erreur API-Football', details: erreurs });
      return;
    }

    // TTL adaptative sur `fixtures?id=` : un match TERMINE ne changera plus
    // jamais, on peut le cacher tres longtemps (30 jours). Un match LIVE
    // change chaque minute, on baisse la TTL. Un match a venir garde 1 h.
    // Mesure du 03/09 : fixtures:id = 85 % du quota fixtures, cache hit 4 %
    // — les bots crawlent en boucle les fiches match, chaque URL n'etant
    // touchee qu'une fois par cycle > TTL. Constate : ~90 000 appels/jour
    // rien que la-dessus. Avec 30j de TTL sur les matchs finis, la memoire
    // Redis absorbe la longue traine des historiques (ancien 1 h → 24 fetch/
    // URL/jour vs nouveau 30j → 1 fetch/URL/mois).
    const FINIS_LIVE = new Set(['FT', 'AET', 'PEN', 'CANC', 'ABD', 'PST', 'WO']);
    const EN_JEU = new Set(['1H', 'HT', '2H', 'ET', 'P', 'BT', 'LIVE']);
    if (path === 'fixtures' && 'id' in params) {
      const f = json && json.response && json.response[0];
      const st = f && f.fixture && f.fixture.status && f.fixture.status.short;
      if (FINIS_LIVE.has(st)) ttl = 30 * 86400;      // 30 jours — donnee figee
      else if (EN_JEU.has(st)) ttl = 60;             // 1 min pendant le match
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
      if (sousCompteur) {
        cmds.push(['INCR', `footamont:${jour}:${sousCompteur}`]);
        cmds.push(['EXPIRE', `footamont:${jour}:${sousCompteur}`, 604800]);
      }
      const avecSetex = serialise.length < REDIS_VAL_MAX;
      if (avecSetex) cmds.push(['SETEX', cleRedis, ttl, serialise]);
      const ecrit = await redisPipeline(cmds);
      // La SETEX est la DERNIERE commande. Null = pipeline entier perdu
      // (timeout 1,5 s, Upstash injoignable) ; {error} = commande refusee.
      const setexKo = avecSetex && (!ecrit || (ecrit[ecrit.length - 1] && ecrit[ecrit.length - 1].error));
      if (setexKo || !avecSetex) res.setHeader('X-Cache-Write', setexKo ? 'failed' : 'skipped-too-large');
    }

    // En mode chauffe : no-store. Si le CDN gardait cette reponse, le prochain
    // passage de la chauffe serait servi par le CDN sans atteindre la fonction,
    // et le refresh-ahead ne se declencherait jamais. Le trafic normal (sans
    // _prechauffe) garde son s-maxage.
    res.setHeader('Cache-Control', modeChauffe ? 'no-store'
      : `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}`);
    res.status(200).json(json);
  } catch (e) {
    console.error('[foot]', path, e.message);
    if (/HTTP 429/.test(e.message)) {
      // 429 = limite minute, pas le quota du jour. Verrou partage 8 s pour
      // qu'aucune instance ne repique sur le meme mur.
      quotaMortLocal = Date.now() + QUOTA_MINUTE_MS;
      await redisPipeline([['SETEX', CLE_QUOTA_MORT, Math.ceil(QUOTA_MINUTE_MS / 1000), '1']]);
    }
    res.setHeader('Cache-Control', `public, s-maxage=${TTL_ERREUR}`);
    res.status(502).json({ error: 'Appel API-Football échoué' });
  }
}
