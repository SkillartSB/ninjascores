// ── NinjaScores · consommateur du WebSocket API-Tennis ──────────────────────
// Tourne en permanence (Railway). Recoit un message par point joue, garde l'etat
// des matchs en direct en memoire et l'ecrit dans Upstash Redis :
//   tennis:live            liste allegee (sans point par point ni stats)   EX 90 s
//   tennis:live:<event>    match complet (scores, jeu, service, pbp, stats) EX 180 s
//   tennis:live:meta       { ts, n, source, connexions }                    EX 90 s
// Vercel (/api/tennis/?method=live) lit ces cles ; si elles manquent ou sont
// perimees il retombe sur get_livescore (REST, 20 s).
//
// Variables : API_TENNIS_KEY, KV_REST_API_URL, KV_REST_API_TOKEN, PORT (Railway).
import http from 'node:http';

const CLE = process.env.API_TENNIS_KEY;
const REDIS_URL = process.env.KV_REST_API_URL, REDIS_TOKEN = process.env.KV_REST_API_TOKEN;
if (!CLE || !REDIS_URL || !REDIS_TOKEN) { console.error('Variables manquantes : API_TENNIS_KEY, KV_REST_API_URL, KV_REST_API_TOKEN'); process.exit(1); }

const WS_URL = 'wss://wss.api-tennis.com/live?APIkey=' + CLE + '&timezone=UTC';
const REST = 'https://api.api-tennis.com/tennis/?method=get_livescore&timezone=UTC&APIkey=' + CLE;
const TTL_LISTE = 90, TTL_MATCH = 180;
const PURGE_FINI_MS = 3 * 60 * 1000;      // un match termine reste 3 min (le temps d'afficher le score final)
const PURGE_SILENCE_MS = 20 * 60 * 1000;  // sans nouvelle depuis 20 min : on l'oublie (interruption, pluie…)

const live = new Map();     // event_key -> { m, maj, ecrit }
let sale = false, connexions = 0, dernierMsg = 0, messages = 0, ecritures = 0, erreursRedis = 0;

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

async function redis(cmds) {
  const r = await fetch(REDIS_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error('Redis ' + r.status);
  return r.json();
}

function estFini(m) { return /finished|retired|walkover|w\.?o\.?|cancel|abandon/i.test(String(m.event_status || '')); }
function alleger(m) {
  const { pointbypoint, statistics, ...reste } = m;
  return reste;
}

function integrer(m) {
  if (!m || !m.event_key) return;
  const k = String(m.event_key);
  const e = live.get(k);
  // On garde le point par point s'il manque dans un message plus recent.
  if (e && !m.pointbypoint && e.m.pointbypoint) m.pointbypoint = e.m.pointbypoint;
  if (e && !m.statistics && e.m.statistics) m.statistics = e.m.statistics;
  live.set(k, { m, maj: Date.now(), ecrit: false });
  sale = true;
}

// Amorce au demarrage et filet de securite : la liste REST toutes les 2 min.
async function amorcer() {
  try {
    const r = await fetch(REST, { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    if (j && j.success === 1 && Array.isArray(j.result)) {
      const vus = new Set();
      j.result.forEach((m) => { vus.add(String(m.event_key)); if (!live.has(String(m.event_key))) integrer(m); });
      // Un match que le REST ne liste plus est termine ou reporte : on le marque.
      for (const [k, e] of live) if (!vus.has(k) && !estFini(e.m) && Date.now() - e.maj > 5 * 60 * 1000) { e.m.event_status = e.m.event_status || 'Finished'; e.maj = Date.now() - PURGE_FINI_MS + 30000; sale = true; }
      log('amorce REST :', j.result.length, 'matchs en direct');
    }
  } catch (e) { log('amorce REST echouee :', e.message); }
}

async function ecrire() {
  if (!sale) return;
  sale = false;
  const maintenant = Date.now();
  for (const [k, e] of live) {
    if ((estFini(e.m) && maintenant - e.maj > PURGE_FINI_MS) || maintenant - e.maj > PURGE_SILENCE_MS) live.delete(k);
  }
  const liste = [...live.values()].map((e) => alleger(e.m));
  const cmds = [
    ['SET', 'tennis:live', JSON.stringify(liste), 'EX', TTL_LISTE],
    ['SET', 'tennis:live:meta', JSON.stringify({ ts: maintenant, n: liste.length, source: 'ws', connexions, messages }), 'EX', TTL_LISTE]
  ];
  for (const [k, e] of live) if (!e.ecrit) { cmds.push(['SET', 'tennis:live:' + k, JSON.stringify(e.m), 'EX', TTL_MATCH]); e.ecrit = true; }
  try { await redis(cmds); ecritures++; }
  catch (err) { erreursRedis++; sale = true; log('Redis KO :', err.message); }
}

let ws = null, tempo = 2000, timerPing = null;
function connecter() {
  connexions++;
  log('connexion WebSocket #' + connexions);
  try { ws = new WebSocket(WS_URL); } catch (e) { log('WebSocket impossible :', e.message); return planifier(); }
  ws.onopen = () => { tempo = 2000; dernierMsg = Date.now(); log('WebSocket ouvert'); };
  ws.onmessage = (ev) => {
    dernierMsg = Date.now();
    let j; try { j = JSON.parse(ev.data); } catch (e) { log('message non JSON :', String(ev.data).slice(0, 120)); return; }
    if (j && j.error) { log('erreur API :', j.error); return; }
    messages++;
    (Array.isArray(j) ? j : [j]).forEach(integrer);
  };
  ws.onerror = (e) => log('WebSocket erreur :', (e && e.message) || 'inconnue');
  ws.onclose = (e) => { log('WebSocket ferme', e.code); ws = null; planifier(); };
}
function planifier() {
  setTimeout(connecter, tempo);
  tempo = Math.min(tempo * 2, 30000);
}

// Ecriture 1 s (coalesce les points), amorce REST 2 min, chien de garde : sans
// message depuis 5 min on reconnecte (le socket peut rester ouvert mais muet).
setInterval(ecrire, 1000);
setInterval(amorcer, 120000);
setInterval(() => { if (ws && Date.now() - dernierMsg > 5 * 60 * 1000) { log('silence de 5 min : reconnexion'); try { ws.close(); } catch (e) {} } }, 30000);

// Petit serveur HTTP pour Railway (healthcheck) et pour voir l'etat.
http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, ws: !!ws, matchs: live.size, messages, ecritures, erreursRedis, connexions, dernierMsg: dernierMsg ? new Date(dernierMsg).toISOString() : null }));
}).listen(process.env.PORT || 8080, () => log('HTTP pret sur', process.env.PORT || 8080));

amorcer().then(connecter);
