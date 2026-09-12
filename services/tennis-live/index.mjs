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
const journaux = new Map(); // event_key -> { sets:[{n, jeux:[{serveur, pts:[], gagnant, apres}]}], maj, ecrit }

// ── Journal des points NinjaScores ─────────────────────────────────────────
// Le point par point de l'API contient du bruit (points qui reculent, score de
// jeu faux). On tient notre propre journal a partir des changements d'etat
// successifs : un point n'est ajoute que s'il est un successeur valide du
// precedent ; un retour a un etat deja vu dans le jeu = correction (on tronque).
const ORDRE = ['0', '15', '30', '40', 'A'];
function successeurValide(avant, apres, tieBreak) {
  if (!avant) return true;
  const a = avant.split(':'), b = apres.split(':');
  if (a.length !== 2 || b.length !== 2) return true;
  if (tieBreak) {
    const da = (+b[0]) - (+a[0]), db = (+b[1]) - (+a[1]);
    return (da === 1 && db === 0) || (da === 0 && db === 1);
  }
  const ia = [ORDRE.indexOf(a[0]), ORDRE.indexOf(a[1])], ib = [ORDRE.indexOf(b[0]), ORDRE.indexOf(b[1])];
  if (ia.includes(-1) || ib.includes(-1)) return true;
  // deuce -> avantage, avantage -> deuce, sinon +1 d'un cote
  if (a[0] === 'A' && b[0] === '40' && b[1] === '40') return true;
  if (a[1] === 'A' && b[1] === '40' && b[0] === '40') return true;
  return (ib[0] === ia[0] + 1 && ib[1] === ia[1]) || (ib[1] === ia[1] + 1 && ib[0] === ia[0]);
}
function ajouterPoint(jeu, score, tieBreak) {
  const pts = jeu.pts;
  if (pts.length && pts[pts.length - 1] === score) return false;      // doublon
  const deja = pts.lastIndexOf(score);
  if (deja >= 0) { pts.length = deja + 1; return true; }               // correction : retour en arriere
  if (score === '0:0' && !pts.length) return false;                    // debut de jeu, rien a noter
  pts.push(score); return true;                                         // successeur valide ou saut : on garde
}
function etatDe(m) {
  const set = parseInt((/set\s*(\d)/i.exec(m.event_status || '') || [])[1], 10) || null;
  const sc = (m.scores || []);
  const cur = sc.length ? sc[sc.length - 1] : null;
  const jeux = cur ? [parseInt(cur.score_first, 10) || 0, parseInt(cur.score_second, 10) || 0] : [0, 0];
  const g = String(m.event_game_result || '').replace(/\s/g, '');
  const pts = /^[0-9A]+-[0-9A]+$/.test(g) ? g.replace('-', ':') : null;
  const serveur = m.event_serve === 'First Player' ? 'a' : m.event_serve === 'Second Player' ? 'b' : null;
  return { set, jeux, pts, serveur, tieBreak: jeux[0] >= 6 && jeux[1] >= 6 };
}
function amorcerJournal(k, m) {
  // Premiere vue d'un match : on part du point par point de l'API, nettoye avec les memes regles.
  const j = { sets: [], maj: Date.now(), ecrit: false };
  (m.pointbypoint || []).forEach((g) => {
    const n = parseInt((/(\d+)/.exec(g.set_number || '') || [])[1], 10) || 1;
    let st = j.sets.find((x) => x.n === n); if (!st) { st = { n, jeux: [] }; j.sets.push(st); }
    const jeu = { serveur: g.player_served === 'First Player' ? 'a' : 'b', pts: [], gagnant: g.serve_winner === 'First Player' ? 'a' : g.serve_winner === 'Second Player' ? 'b' : null, apres: null };
    (g.points || []).forEach((p) => ajouterPoint(jeu, String(p.score || '').replace(/\s/g, '').replace('-', ':'), false));
    st.jeux.push(jeu);
  });
  // score apres chaque jeu recalcule depuis les vainqueurs
  j.sets.forEach((st) => { let a = 0, b = 0; st.jeux.forEach((jeu) => { if (jeu.gagnant === 'a') a++; else if (jeu.gagnant === 'b') b++; jeu.apres = jeu.gagnant ? a + '-' + b : null; }); });
  journaux.set(k, j);
  return j;
}
function tenirJournal(k, m, precedent) {
  const e = etatDe(m);
  if (!e.set) return;
  let j = journaux.get(k) || amorcerJournal(k, m);
  let st = j.sets.find((x) => x.n === e.set); if (!st) { st = { n: e.set, jeux: [] }; j.sets.push(st); }
  let jeu = st.jeux.length ? st.jeux[st.jeux.length - 1] : null;
  const p = precedent ? etatDe(precedent) : null;
  // Changement du score en jeux : le jeu en cours est termine, vainqueur = celui qui a gagne un jeu.
  if (p && p.set === e.set && (e.jeux[0] !== p.jeux[0] || e.jeux[1] !== p.jeux[1])) {
    if (jeu && !jeu.gagnant) { jeu.gagnant = e.jeux[0] > p.jeux[0] ? 'a' : 'b'; jeu.apres = e.jeux[0] + '-' + e.jeux[1]; }
    jeu = null;
  }
  if (!jeu || jeu.gagnant) { if (e.pts && e.pts !== '0:0') { jeu = { serveur: e.serveur, pts: [], gagnant: null, apres: null }; st.jeux.push(jeu); } else return; }
  if (!jeu.serveur && e.serveur) jeu.serveur = e.serveur;
  if (e.pts && ajouterPoint(jeu, e.pts, e.tieBreak)) { j.maj = Date.now(); j.ecrit = false; }
}

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
  try { tenirJournal(k, m, e ? e.m : null); } catch (err) { log('journal KO', k, err.message); }
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
  // Journal propre : garde 6 h apres le dernier point (la fiche d'un match termine le relit).
  for (const [k, j] of journaux) {
    if (!j.ecrit) { cmds.push(['SET', 'tennis:pbp:' + k, JSON.stringify({ sets: j.sets, maj: j.maj }), 'EX', 6 * 3600]); j.ecrit = true; }
    if (!live.has(k) && maintenant - j.maj > 30 * 60 * 1000) journaux.delete(k);
  }
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
