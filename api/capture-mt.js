// Capture serveur des stats de mi-temps — appele par Vercel Cron toutes les
// quelques minutes. Verifie les matchs en direct, et pour chacun A LA PAUSE
// (statut « HT ») qui n'a pas encore d'instantane, range ses stats dans Redis.
//
// Contrairement au declenchement par le navigateur (trop rare : il fallait un
// visiteur sur l'onglet Stats pendant la pause), ceci ne rate aucune mi-temps.
// Cout : 1 appel pour la liste live + 1 par nouveau match a la pause.

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

async function kv(cmd) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    if (!r.ok) return null;
    return (await r.json()).result;
  } catch (e) { return null; }
}

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
  const get = (arr, type) => { const x = arr.find((s) => s.type === type); return x ? x.value : null; };
  const out = [];
  MAP.forEach((m) => {
    const h = num(get(A, m[0])), a = num(get(B, m[0]));
    if (h == null && a == null) return;
    out.push({ label: m[1], home: h || 0, away: a || 0, unit: m[2], cumul: m[3] });
  });
  return out.length ? out : null;
}

export default async function handler(req, res) {
  // 60 s de cache CDN : borne les appels si l'endpoint (public) est sollicite
  // en boucle — une seule execution reelle par minute, quel que soit le volume.
  // Le cron GitHub (toutes les 5 min) tombe toujours sur un cache expire.
  res.setHeader('Cache-Control', 'public, s-maxage=60');
  try {
    const live = await api('fixtures?live=all');
    const aPause = live.filter((f) => f.fixture && f.fixture.status && f.fixture.status.short === 'HT');
    const captures = [];
    for (const f of aPause) {
      const id = f.fixture.id;
      const key = 'mt:' + id;
      const deja = await kv(['GET', key]);
      if (deja) continue;                                   // deja capture
      const arr = mapStats(await api('fixtures/statistics?fixture=' + id));
      if (arr && arr.length) {
        await kv(['SET', key, JSON.stringify(arr), 'EX', 864000]);   // 10 jours
        captures.push(id);
      }
    }
    return res.status(200).json({
      live: live.length, a_la_pause: aPause.length, captures: captures.length, ids: captures,
    });
  } catch (e) {
    return res.status(200).json({ error: String(e && e.message || e) });
  }
}
