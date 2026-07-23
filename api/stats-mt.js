// Statistiques par mi-temps.
//
// Le fournisseur ne donne QUE le total du match (verifie). Pour reconstituer
// les mi-temps, on capture les stats a l'instant de la pause (statut « HT ») :
// a ce moment, le cumul du match EST la 1re mi-temps. On le range dans Redis
// (Upstash). Ensuite : 2e MT = total final − 1re MT (pour les stats cumulables).
//
// Declenche par le navigateur d'un visiteur qui regarde le match en direct :
// pas de cron, pas de quota gaspille. Capture une seule fois par match.

const BASE = 'https://v3.football.api-sports.io';
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function api(chemin) {
  const cle = process.env.API_FOOTBALL_KEY;
  if (!cle) return [];
  const r = await fetch(BASE + '/' + chemin, { headers: { 'x-apisports-key': cle } });
  if (!r.ok) return [];
  const j = await r.json();
  return j.response || [];
}

// Upstash Redis via son API REST : une commande = un tableau JSON.
async function kv(cmd) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.result;
  } catch (e) { return null; }
}

// meme correspondance que NS_STATS cote client. `cumul` : la stat s'additionne
// dans le temps (donc soustractible pour la 2e MT). La possession et la
// precision de passes sont des pourcentages : non soustractibles.
const MAP = [
  ['expected_goals', 'Expected Goals (xG)', '', true],
  ['Ball Possession', 'Possession de balle', '%', false],
  ['Total Shots', 'Tirs totaux', '', true],
  ['Shots on Goal', 'Tirs cadrés', '', true],
  ['Corner Kicks', 'Corners', '', true],
  ['Total passes', 'Passes', '', true],
  ['Passes %', 'Précision passes', '%', false],
  ['Fouls', 'Fautes', '', true],
  ['Offsides', 'Hors-jeu', '', true],
  ['Yellow Cards', 'Cartons jaunes', '', true],
  ['Goalkeeper Saves', 'Arrêts du gardien', '', true],
];

function mapStats(rep) {
  if (!rep || rep.length < 2) return null;
  const A = rep[0].statistics || [], B = rep[1].statistics || [];
  const num = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') v = v.replace('%', '');
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };
  const get = (arr, type) => {
    const x = arr.find((s) => s.type === type);
    return x ? x.value : null;
  };
  const out = [];
  MAP.forEach((m) => {
    const h = num(get(A, m[0])), a = num(get(B, m[0]));
    if (h == null && a == null) return;
    out.push({ label: m[1], home: h || 0, away: a || 0, unit: m[2], cumul: m[3] });
  });
  return out.length ? out : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const fixture = String((req.query && req.query.fixture) || '');
  if (!/^\d+$/.test(fixture)) return res.status(400).json({ error: 'fixture invalide' });

  const key = 'mt:' + fixture;
  try {
    // deja capture ? on le sert, aucun appel fournisseur.
    const dejaVu = await kv(['GET', key]);
    if (dejaVu) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json({ ht: JSON.parse(dejaVu) });
    }

    // capture uniquement si demande ET si le match est a la pause maintenant
    if (req.query && req.query.capture) {
      const fx = await api('fixtures?id=' + fixture);
      const st = fx[0] && fx[0].fixture && fx[0].fixture.status && fx[0].fixture.status.short;
      if (st === 'HT') {
        const arr = mapStats(await api('fixtures/statistics?fixture=' + fixture));
        if (arr && arr.length) {
          await kv(['SET', key, JSON.stringify(arr), 'EX', 864000]);   // 10 jours
          res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
          return res.status(200).json({ ht: arr });
        }
      }
    }

    // pas encore de 1re MT : cache court, on reessaiera pendant la pause
    res.setHeader('Cache-Control', 'public, s-maxage=45');
    return res.status(200).json({ ht: null });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ht: null });
  }
}
