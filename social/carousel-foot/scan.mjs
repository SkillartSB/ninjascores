/**
 * Scan complet du slate : tous les matchs de « ce soir » (>= 15h00 Paris le 26/09)
 * + « demain matin » (< 13h00 Paris le 27/09), toutes competitions confondues.
 *
 * Methode identique a celle des pronos precedents, mais appliquee a TOUT :
 *   freq observee sur les 8 derniers matchs de chaque equipe (16 au total)
 *   vs probabilite implicite de la cote Bet365 (1/cote).
 *   edge = freq - 1/cote.
 *
 * Deux pieges, tous deux payes une fois :
 *  1. l'endpoint odds d'API-Football ne renvoie rien d'exploitable avec un
 *     simple ?date= — il faut league + season + date. On lit donc league.id
 *     et league.season dans les fixtures et on boucle dessus.
 *  2. toLocaleString('fr-FR', { hour: '2-digit' }) renvoie « 20 h », donc
 *     Number() donnait NaN et le filtre horaire ne filtrait RIEN : le
 *     classement portait sur les 2 journees entieres. D'ou 'en-GB'.
 *
 * A relancer : changer DATES, puis `node scan.mjs`. Attention, il faut un
 * acces reseau sortant vers ninjascores.com (sandbox Vercel en allow-all,
 * l'agent proxy de la session le bloque). Le cache Redis du proxy rend le
 * 2e passage quasi instantane.
 *
 * Lire le classement : les plus gros edges tombent presque toujours dans des
 * U20, des equipes reserve ou des D2 exotiques — donnee fragile et invendable
 * sur Telegram. Filtrer lignes.json par competition avant de choisir.
 */
const BASE = 'https://ninjascores.com/api/foot';
const DATES = ['2026-09-26', '2026-09-27'];
const BOOK = 8;                 // Bet365
const MIN_COTE = 1.45, MAX_COTE = 3.30;
const MIN_N = 10;               // matchs de forme minimum (sur 16 possibles)

const dort = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params, essais = 3) {
  const url = BASE + '?' + new URLSearchParams(params);
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(url);
      const j = await r.json();
      if (j && j.response) return j;
      if (j && j.retry) { await dort(3000 * (i + 1)); continue; }   // quota/minute
      return null;
    } catch (e) { await dort(1000 * (i + 1)); }
  }
  return null;
}

// Pool de N taches en parallele — l'amont plafonne vers 450 req/min.
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let k = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (k < items.length) {
      const i = k++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

const parisH = (iso) => Number(new Date(iso).toLocaleString('en-GB',
  { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }));

/* ── 1. les fixtures du creneau ─────────────────────────────────────────── */
const fixtures = [];
for (const d of DATES) {
  const j = await api({ path: 'fixtures', date: d, timezone: 'Europe/Paris' });
  if (!j) { console.log('fixtures KO', d); continue; }
  for (const f of j.response) {
    if (f.fixture.status.short !== 'NS') continue;
    const h = parisH(f.fixture.date);
    if (d === DATES[0] && h < 15) continue;
    if (d === DATES[1] && h >= 13) continue;
    fixtures.push(f);
  }
}
console.log('matchs du creneau :', fixtures.length);

/* ── 2. les cotes, league par league ────────────────────────────────────── */
const groupes = new Map();      // "league|season|date" -> true
for (const f of fixtures) {
  const d = new Date(f.fixture.date).toISOString().slice(0, 10);
  groupes.set(`${f.league.id}|${f.league.season}|${d}`, true);
}
console.log('couples ligue/date a interroger :', groupes.size);

const cotes = new Map();        // fixtureId -> { 'Over 2.5': 1.85, ... }
const VOULUS = { 'Goals Over/Under': 1, 'Both Teams Score': 1 };

await pool([...groupes.keys()], 5, async (cle) => {
  const [league, season, date] = cle.split('|');
  for (let page = 1; page <= 3; page++) {
    const j = await api({ path: 'odds', league, season, date, bookmaker: BOOK, page });
    if (!j || !j.response || !j.response.length) return;
    for (const e of j.response) {
      const m = cotes.get(e.fixture.id) || {};
      for (const bm of e.bookmakers || []) {
        for (const bet of bm.bets || []) {
          if (!VOULUS[bet.name]) continue;
          for (const v of bet.values) {
            if (['Over 2.5', 'Under 2.5'].includes(v.value)) m[v.value] = Number(v.odd);
            if (bet.name === 'Both Teams Score') m['BTTS ' + v.value] = Number(v.odd);
          }
        }
      }
      cotes.set(e.fixture.id, m);
    }
    const tp = j.paging && j.paging.total || 1;
    if (page >= tp) return;
  }
});
console.log('matchs avec cotes Bet365 :', cotes.size);

/* ── 3. candidats : au moins un marche dans la fourchette de cote ────────── */
const MARCHES = [
  { cle: 'Over 2.5',  nom: 'Plus de 2.5 buts',        test: (g) => g.t >= 3 },
  { cle: 'Under 2.5', nom: 'Moins de 2.5 buts',       test: (g) => g.t <= 2 },
  { cle: 'BTTS Yes',  nom: 'Les 2 equipes marquent',  test: (g) => g.a > 0 && g.b > 0 },
  { cle: 'BTTS No',   nom: 'Une equipe finit a 0',    test: (g) => g.a === 0 || g.b === 0 },
];

const candidats = fixtures.filter((f) => {
  const m = cotes.get(f.fixture.id);
  if (!m) return false;
  return MARCHES.some((x) => m[x.cle] >= MIN_COTE && m[x.cle] <= MAX_COTE);
});
console.log('candidats (cote dans la fourchette) :', candidats.length);

/* ── 4. forme : 8 derniers matchs de chaque equipe ──────────────────────── */
const equipes = new Set();
for (const f of candidats) { equipes.add(f.teams.home.id); equipes.add(f.teams.away.id); }
console.log('equipes a charger :', equipes.size);

const forme = new Map();
await pool([...equipes], 5, async (id) => {
  const j = await api({ path: 'fixtures', team: id, last: 8 });
  if (!j) return;
  const g = j.response
    .filter((x) => x.fixture.status.short === 'FT'
                && x.goals.home !== null && x.goals.away !== null)
    .map((x) => ({ a: x.goals.home, b: x.goals.away, t: x.goals.home + x.goals.away }));
  forme.set(id, g);
});
console.log('formes chargees :', forme.size);

/* ── 5. classement par edge ─────────────────────────────────────────────── */
const lignes = [];
for (const f of candidats) {
  const m = cotes.get(f.fixture.id);
  const gh = forme.get(f.teams.home.id) || [];
  const ga = forme.get(f.teams.away.id) || [];
  const tous = gh.concat(ga);
  if (tous.length < MIN_N) continue;
  for (const x of MARCHES) {
    const c = m[x.cle];
    if (!(c >= MIN_COTE && c <= MAX_COTE)) continue;
    const ok = tous.filter(x.test).length;
    const freq = ok / tous.length;
    const okH = gh.filter(x.test).length, okA = ga.filter(x.test).length;
    lignes.push({
      edge: freq - 1 / c,
      freq, c, n: tous.length,
      detail: `${okH}/${gh.length} + ${okA}/${ga.length}`,
      h: new Date(f.fixture.date).toLocaleTimeString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }),
      match: `${f.teams.home.name} - ${f.teams.away.name}`,
      ligue: `${f.league.country} / ${f.league.name}`,
      marche: x.nom,
    });
  }
}
lignes.sort((a, b) => b.edge - a.edge);
console.log('\nlignes evaluees :', lignes.length, '\n');
console.log('EDGE   FREQ  COTE  N   DETAIL        HEURE  MARCHE                  MATCH / LIGUE');
for (const l of lignes.slice(0, 60)) {
  console.log(
    ('+' + (l.edge * 100).toFixed(0)).padStart(4),
    (l.freq * 100).toFixed(0).padStart(4) + '%',
    l.c.toFixed(2).padStart(5),
    String(l.n).padStart(3),
    l.detail.padEnd(13),
    l.h.padStart(6),
    l.marche.padEnd(23),
    l.match, '|', l.ligue);
}

// Le detail complet, pour filtrer ensuite par competition sans tout relancer.
(await import('node:fs')).writeFileSync('lignes.json', JSON.stringify(lignes));
