// Vercel serverless function — proxy API-Football (api-sports.io) v3.
//
// Deux raisons d'exister :
//  1. la clé reste côté serveur, jamais exposée au navigateur ;
//  2. le cache CDN découple le quota du trafic — 10 000 visiteurs sur la même
//     page de classement ne coûtent qu'UNE requête à l'API.
//
// Usage côté client :  /api/foot?path=standings&league=61&season=2025

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
  'fixtures/statistics':  60,
  'fixtures/headtohead':  86400,
  'players':              86400,
  'players/squads':       86400,
  'transfers':            3600,
  'injuries':             1800,
  'odds':                 900,
  'predictions':          3600,
};

// Le direct doit rester frais : on écrase la TTL quand ?live= est présent.
const TTL_LIVE = 20;

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

  const ttl = ('live' in params) ? TTL_LIVE : ENDPOINTS[path];

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
      res.setHeader('Cache-Control', 'no-store');
      res.status(502).json({ error: 'Erreur API-Football', details: erreurs });
      return;
    }

    res.setHeader('Cache-Control',
      `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}`);
    res.status(200).json(json);
  } catch (e) {
    console.error('[foot]', path, e.message);
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'Appel API-Football échoué' });
  }
}
