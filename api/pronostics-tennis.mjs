// Pronostics tennis du jour, au format de l'écran /pronostics/ (même dashboard
// que le foot, seuls les pronostics changent — demande du 12/09/2026).
//
// Pour chaque match de simple ATP/WTA du jour (Grand Chelem, Masters 1000, 500,
// puis 250 s'il reste de la place, 16 matchs max) : cotes (get_odds) + forme des
// deux joueurs (get_H2H, 10 derniers matchs) → mêmes candidats et mêmes règles que
// la fiche match (s15.js) : cote ≥ 1,30 et fréquence ≥ 7/10, deux picks max par
// match. Résultat mis en cache Redis 30 min (tennis:pronos:<jour>) : une vingtaine
// d'appels API-Tennis par demi-heure, quel que soit le trafic.
//
// INLINE ET NON IMPORTE : un api/*.mjs qui importe depuis lib/*.mjs plante au
// chargement (incident seo.js/moteur.mjs, août 2026).
const API = 'https://api.api-tennis.com/tennis/';
const COTE_MIN = 1.3, FREQ_MIN = 0.7, MAX_MATCHS = 16, TTL = 1800;
// Plancher d'echantillon, repris du foot (NS_FORME) : sous 5 matchs joues on
// ne publie rien. Sans lui, un joueur revenu de blessure sortait « 3/3 = 100 % ».
const MIN_MATCHS = 5;
const SITE = 'https://ninjascores.com';
const TIER = { GS: 1, FINALS: 1, OLY: 1, M1000: 2, '500': 3, TEAM: 3, '250': 4, CH: 5 };
const CAT = { GS: 'Grand Chelem', FINALS: 'Finals', OLY: 'JO', M1000: 'Masters 1000', '500': '500', '250': '250', TEAM: 'Par équipes', CH: 'Challenger' };

// Logo d'un groupe de pronostics : logo officiel du tournoi, sinon badge de niveau.
const BADGE_CAT = { 'ATP|M1000': 'atp_masters-1000', 'ATP|500': 'atp_500', 'ATP|250': 'atp_250', 'ATP|CH': 'atp_challenger',
  'WTA|M1000': 'wta_1000', 'WTA|500': 'wta_500', 'WTA|250': 'wta_250', 'WTA|CH': 'wta_125', 'WTA|GS': 'wta', 'WTA|FINALS': 'wta', 'WTA|TEAM': 'wta' };
const RACINE_LOGOS = 'https://ninjascores.com/assets/logos/tennis/';
function logoGroupe(m) {
  if (m.t && m.t.logo) return RACINE_LOGOS + 'tournois/' + m.t.logo + '.png';
  const f = BADGE_CAT[(m.circuit === 'WTA' ? 'WTA' : 'ATP') + '|' + (m.t && m.t.cat)];
  return f ? RACINE_LOGOS + f + '.png' : null;
}
function drapeau(iso) {
  if (!iso || iso.length !== 2) return '🎾';
  return String.fromCodePoint(...iso.toUpperCase().split('').map((c) => 0x1F1E6 + c.charCodeAt(0) - 65));
}
async function redis(cmds) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(url + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
    return r.ok ? r.json() : null;
  } catch (e) { return null; }
}
async function api(cle, qs) {
  const r = await fetch(API + '?' + qs + '&timezone=UTC&APIkey=' + cle, { signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  return j && j.success === 1 ? j.result : null;
}
async function enFile(taches, n) {
  const out = new Array(taches.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < taches.length) { const k = i++; try { out[k] = await taches[k](); } catch (e) { out[k] = null; } } }));
  return out;
}
const meilleure = (obj) => {
  if (!obj) return null; let best = null;
  Object.keys(obj).forEach((b) => { const o = parseFloat(obj[b]); if (o > 1 && (!best || o > best.o)) best = { o, b }; });
  return best;
};
const meilleureOU = (mk, nom, ligne, sens) => { const v = mk && mk[nom + ' ' + sens]; return v ? meilleure(v[ligne]) : null; };

// Forme d'un joueur sur ses 10 derniers matchs (même lecture que la fiche match).
function analyser(liste, k) {
  return (liste || []).slice(0, 10).map((e) => {
    const aEstK = String(e.first_player_key) === String(k);
    const gagne = (aEstK && e.event_winner === 'First Player') || (!aEstK && e.event_winner === 'Second Player');
    const sets = (e.scores || []).map((q) => { const a = String(q.score_first || ''), b = String(q.score_second || ''); if (!a || !b || (a === '0' && b === '0')) return null; return { a: parseInt(a, 10) || 0, b: parseInt(b, 10) || 0 }; }).filter(Boolean);
    const moi = (s) => (aEstK ? s.a : s.b), lui = (s) => (aEstK ? s.b : s.a);
    return { gagne, nbSets: sets.length, jeux: sets.reduce((acc, s) => acc + s.a + s.b, 0), premierSet: sets.length ? moi(sets[0]) > lui(sets[0]) : null, lui };
  });
}
const freq = (L, f) => { const n = L.length; if (!n) return { x: 0, n: 0, r: 0 }; const x = L.filter(f).length; return { x, n, r: x / n }; };

// Forme d'un joueur (21/09/2026) : on passe par notre propre proxy plutot que
// par l'API — la reponse y est deja calculee et cachee 3 h (api/tennis.js,
// method=forme), donc un joueur aligne dans deux matchs ne coute qu'un appel.
async function formeDe(k) {
  try {
    const r = await fetch(SITE + '/api/tennis/?method=forme&player=' + k + '&n=10', { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    return (j && j.result) || null;
  } catch { return null; }
}

/**
 * Les matchs a retenir pour juger la forme. `surface` non nulle = on prend les
 * matchs joues sur cette surface quand le joueur en a assez.
 *
 * Backtest du 21/09/2026 (578 matchs ATP/WTA joues sur 45 jours, calcul limite
 * aux matchs anterieurs a chacun) : le filtre par surface aide sur le PROFIL du
 * match (plus de 21,5 jeux : 65,6 % -> 70,3 % de reussite ; match en 2 sets :
 * 58,6 % -> 59,7 %) mais dessert le VAINQUEUR (53,9 % -> 51,5 %). D'ou deux
 * listes : brute pour « qui gagne », par surface pour « comment ca se joue ».
 * Le meme test a ecarte 5 matchs au lieu de 10 (vainqueur : 48,9 %, sous le
 * hasard) et la ponderation des matchs recents (49,2 %).
 */
function listeForme(f, surface) {
  if (!f) return [];
  const parSurf = surface && f.surfaces && f.surfaces[surface];
  const src = (parSurf && parSurf.matchs && parSurf.matchs.length >= MIN_MATCHS) ? parSurf.matchs : f.matchs;
  return (src || []).map((m) => ({
    gagne: !!m.g, nbSets: (m.sets || []).length, jeux: m.jeux || 0,
    premierSet: m.set1, surface: m.surf || null,
  }));
}

export async function pronosTennis(cle, jour) {
  const [fix, tournois] = await Promise.all([
    api(cle, 'method=get_fixtures&date_start=' + jour + '&date_stop=' + jour),
    fetch('https://ninjascores.com/data/tennis-tournois.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  if (!fix) throw new Error('fixtures indisponibles');
  const T = tournois || {};
  // Matchs a venir ou en cours (pas les termines) : la liste ne se vide pas au fil de la soiree.
  const fini = (x) => /finished|retired|walkover|w\.?o\.?|cancel|abandon|postponed/i.test(String(x.event_status || ''));
  let matchs = fix.filter((x) => /^(Atp|Wta) Singles$/.test(x.event_type_type || '') && !fini(x) && !/\//.test(x.event_first_player || ''))
    .map((x) => { const t = T[String(x.tournament_key)] || {}; return { x, t, tier: TIER[t.cat] || 4, circuit: /^Wta/.test(x.event_type_type) ? 'WTA' : 'ATP' }; })
    .sort((a, b) => (a.tier - b.tier) || String(a.x.event_time).localeCompare(String(b.x.event_time)));
  matchs = matchs.filter((m) => m.tier <= 3).concat(matchs.filter((m) => m.tier === 4)).slice(0, MAX_MATCHS);

  // Surface de chaque tournoi du jour : la table locale ne connait que le
  // circuit principal, method=surfaces couvre tout le fournisseur.
  const tks = [...new Set(matchs.map((m) => String(m.x.tournament_key)))];
  const surfaces = tks.length
    ? await fetch(SITE + '/api/tennis/?method=surfaces&tk=' + tks.join(','), { signal: AbortSignal.timeout(20000) })
        .then((r) => r.json()).then((j) => (j && j.result) || {}).catch(() => ({}))
    : {};

  const donnees = await enFile(matchs.map((m) => async () => {
    const [odds, h2h, f1, f2] = await Promise.all([
      api(cle, 'method=get_odds&match_key=' + m.x.event_key),
      api(cle, 'method=get_H2H&first_player_key=' + m.x.first_player_key + '&second_player_key=' + m.x.second_player_key),
      formeDe(m.x.first_player_key),
      formeDe(m.x.second_player_key),
    ]);
    return { odds: odds && odds[String(m.x.event_key)], h2h, f1, f2 };
  }), 4);

  const par = new Map();
  matchs.forEach((m, i) => {
    const d = donnees[i]; if (!d || !d.odds) return;
    const x = m.x, mk = d.odds;
    const n1 = x.event_first_player, n2 = x.event_second_player;
    const surf = (surfaces[String(x.tournament_key)] || {}).surf || null;
    // Forme dediee (10 derniers matchs) ; repli sur les dix lignes de get_H2H
    // si l'appel n'a rien rendu.
    const brut1 = listeForme(d.f1, null), brut2 = listeForme(d.f2, null);
    const LA0 = brut1.length ? brut1 : analyser(d.h2h && d.h2h.firstPlayerResults, x.first_player_key);
    const LB0 = brut2.length ? brut2 : analyser(d.h2h && d.h2h.secondPlayerResults, x.second_player_key);
    // Symetrie, comme au foot : comparer 10 matchs a 4 fausse tout le tableau.
    const nf = Math.min(LA0.length, LB0.length, 10);
    if (nf < MIN_MATCHS) return;
    const LA = LA0.slice(0, nf), LB = LB0.slice(0, nf);
    // Sets et jeux : les memes joueurs, mais vus sur la surface du jour.
    const surfA0 = listeForme(d.f1, surf), surfB0 = listeForme(d.f2, surf);
    const ns = Math.min(surfA0.length || nf, surfB0.length || nf, 10);
    const LAs = (surfA0.length ? surfA0 : LA0).slice(0, ns), LBs = (surfB0.length ? surfB0 : LB0).slice(0, ns);
    const w1 = meilleure(mk['Home/Away'] && mk['Home/Away'].Home), w2 = meilleure(mk['Home/Away'] && mk['Home/Away'].Away);
    if (!w1 || !w2) return;
    const pCotes = (1 / w1.o) / (1 / w1.o + 1 / w2.o);
    const h = (d.h2h && d.h2h.H2H) || [];
    let wa = 0; h.forEach((e) => { const aEst = String(e.first_player_key) === String(x.first_player_key); const g1 = e.event_winner === 'First Player'; if ((aEst && g1) || (!aEst && !g1)) wa++; });
    const pH2H = h.length ? (wa + 1) / (h.length + 2) : 0.5;
    const fa = freq(LA, (r) => r.gagne), fb = freq(LB, (r) => r.gagne);
    const pForme = (fa.n && fb.n) ? (fa.r + 0.5) / ((fa.r + 0.5) + (fb.r + 0.5)) : 0.5;
    const p = 0.6 * pCotes + 0.2 * pH2H + 0.2 * pForme;
    const favA = p >= 0.5;
    const nomFav = favA ? n1 : n2, fav = favA ? fa : fb, coteFav = favA ? w1 : w2;
    const cand = [];
    const ajouter = (pick, cote, f) => { if (cote && f.n && cote.o >= COTE_MIN && f.r >= FREQ_MIN) cand.push({ pick, odds: cote.o, book: cote.b, x: f.x, n: f.n, r: f.r }); };
    ajouter(nomFav + ' gagne', coteFav, fav);
    const s1 = meilleure(mk['Home/Away (1st Set)'] && mk['Home/Away (1st Set)'][favA ? 'Home' : 'Away']);
    ajouter(nomFav + ' gagne le 1er set', s1, freq(favA ? LA : LB, (r) => r.premierSet === true));
    const fusion = (f) => { const a = freq(LAs, f), b = freq(LBs, f); return { x: a.x + b.x, n: a.n + b.n, r: (a.n + b.n) ? (a.x + b.x) / (a.n + b.n) : 0 }; };
    // Grand Chelem masculin : 3 sets gagnants. « Moins de 2,5 sets » y est
    // impossible, et la forme des joueurs vient de tournois en 2 sets gagnants
    // — la frequence n'a aucun sens sur ces marches.
    const bo5 = (m.t.cat === 'GS' && m.circuit === 'ATP');
    if (!bo5) ajouter('Plus de 2,5 sets', meilleureOU(mk['Over/Under'], 'Over/Under', '2.5', 'Over'), fusion((r) => r.nbSets >= 3));
    if (!bo5) ajouter('Moins de 2,5 sets', meilleureOU(mk['Over/Under'], 'Over/Under', '2.5', 'Under'), fusion((r) => r.nbSets === 2));
    const mkG = mk['Over/Under by Games in Match'];
    const lignes = Object.keys((mkG && mkG['Over/Under by Games in Match Over']) || {}).filter((l) => /\.5$/.test(l)).sort((a, b) => a - b);
    const ligne = lignes.find((l) => Math.abs(l - 21.5) < 1) || lignes[Math.floor(lignes.length / 2)];
    if (ligne && !bo5) {
      ajouter('Plus de ' + ligne.replace('.', ',') + ' jeux', meilleureOU(mkG, 'Over/Under by Games in Match', ligne, 'Over'), fusion((r) => r.jeux > parseFloat(ligne)));
      ajouter('Moins de ' + ligne.replace('.', ',') + ' jeux', meilleureOU(mkG, 'Over/Under by Games in Match', ligne, 'Under'), fusion((r) => r.nbSets && r.jeux < parseFloat(ligne)));
    }
    const retenus = cand.sort((a, b) => (b.r - a.r) || (b.odds - a.odds)).slice(0, 2);
    if (!retenus.length) return;
    const nomT = String(x.tournament_name || 'Tournoi').replace(/\s*\(.*?\)\s*/g, ' ').trim();
    const league = nomT + ' · ' + (m.t.cat === 'GS' ? 'Grand Chelem' : (m.circuit + ' ' + (m.t.cat === 'M1000' ? '1000' : (CAT[m.t.cat] || ''))).trim());
    if (!par.has(league)) par.set(league, { lid: 'tn-' + x.tournament_key + '-' + m.circuit.toLowerCase(), league, emoji: drapeau(m.t.pays), compLogo: logoGroupe(m), compLarge: !m.t.logo, rang: m.tier, sport: 'tennis', picks: [] });
    retenus.forEach((c, j) => {
      const prob = Math.round(c.r * 100);
      par.get(league).picks.push({
        id: 'tn-' + x.event_key + '-' + j, fixtureId: x.event_key, eventKey: x.event_key, sport: 'tennis',
        match: n1 + ' - ' + n2, pick: c.pick, odds: c.odds, prob, score: Math.max(0.5, Math.min(5, Math.round(prob / 10) / 2)),
        slug: null, heure: x.event_date + 'T' + (x.event_time || '00:00') + ':00Z', langue: 'fr',
        source: c.book === 'Pncl' ? 'Pinnacle' : c.book,
        echantillon: c.x + '/' + c.n, surface: surf,
        equipes: [{ id: x.first_player_key, nom: n1, logo: x.event_first_player_logo || null }, { id: x.second_player_key, nom: n2, logo: x.event_second_player_logo || null }],
      });
    });
  });
  return [...par.values()].sort((a, b) => a.rang - b.rang);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const cle = process.env.API_TENNIS_KEY;
  if (!cle) { res.status(200).json({ tennis: [] }); return; }
  const jour = new Date().toISOString().slice(0, 10);
  const cleRedis = 'tennis:pronos:' + jour;
  try {
    const lu = await redis([['GET', cleRedis]]);
    const stocke = lu && lu[0] && lu[0].result;
    if (stocke && !(req.query && req.query.frais === '1')) {
      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800');
      res.setHeader('X-Cache-Tennis', 'redis');
      res.status(200).send(stocke);
      return;
    }
    const tennis = await pronosTennis(cle, jour);
    const corps = JSON.stringify({ tennis, jour });
    await redis([['SETEX', cleRedis, TTL, corps]]);
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800');
    res.setHeader('X-Cache-Tennis', 'amont');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(corps);
  } catch (err) {
    console.error('[pronostics-tennis]', err.message);
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    res.status(200).json({ tennis: [], erreur: err.message });
  }
}
