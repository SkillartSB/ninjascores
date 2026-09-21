// Proxy API-Tennis (api-tennis.com) — pendant de api/foot.js pour le tennis.
//
// Meme doctrine : la cle ne quitte jamais le serveur, chaque reponse est mise
// en cache Redis (TTL par methode) puis au CDN, et chaque appel amont est
// compte (footcnt:{jour}:tennis:{methode}, lisible via ?method=compteurs).
// INLINE ET NON IMPORTE : un api/*.js qui importe lib/*.mjs plante au
// chargement sur ce projet (voir memoire) — on recopie les helpers Redis.
const API_BASE = 'https://api.api-tennis.com/tennis/';

// Methodes autorisees et duree de cache. Le direct n'est PAS servi d'ici (etape
// 2 : WebSocket -> Redis), get_livescore ne sert qu'a la sonde/au calendrier.
const METHODES = {
  get_fixtures:   { ttl: 300,   params: ['date_start', 'date_stop', 'tournament_key', 'event_type_key', 'match_key', 'player_key'] },
  get_livescore:  { ttl: 20,    params: ['match_key'] },
  get_standings:  { ttl: 21600, params: ['event_type'] },
  get_players:    { ttl: 86400, params: ['player_key'] },
  get_H2H:        { ttl: 21600, params: ['first_player_key', 'second_player_key'] },
  get_odds:       { ttl: 2700,  params: ['match_key'] },
  get_draw:       { ttl: 1800,  params: ['tournament_key'] },
  get_tournaments:{ ttl: 86400, params: [] },
  get_events:     { ttl: 86400, params: [] },
};
const REDIS_TIMEOUT_MS = 1500;
const REDIS_VAL_MAX = 900000;

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

// ── Point par point : remise en ordre du flux (21/09/2026) ─────────────────
// Le flux d'API-Tennis arrive sale, de trois facons :
//   1. le jeu decisif sort sous un set a lui (« Set 2 TieBreak ») -> l'app
//      affichait un onglet « 2. SET » en double ;
//   2. il est decoupe en un pseudo-jeu PAR POINT (points vide, `score` = le
//      score du tie-break), double d'un jeu-enveloppe sans aucun point ;
//   3. les points sont repetes et reviennent en arriere (« 40-0, 40-15, 40-0,
//      40-15… » pour un seul jeu), et un point de tie-break fuit parfois dans
//      le jeu precedent.
// On nettoie ICI, une fois pour toutes : la fiche web, l'app iOS et l'app
// Android lisent le meme flux, et le cache Redis garde la version propre.
const POINTS_JEU = { '0': 1, '15': 1, '30': 1, '40': 1, A: 1 };
const ECHELLE = ['0', '15', '30', '40'];

/**
 * Un point peut-il succeder au precedent ? On tolere les SAUTS (le flux ne
 * publie pas toujours tous les etats, notamment le retour a egalite apres un
 * avantage perdu : « 40-A » puis « A-40 ») mais jamais les RETOURS EN ARRIERE,
 * qui trahissent un jeu rejoue depuis le debut par le fournisseur
 * (« 40-0 » puis « 0-40 », « 0-40 » puis « 15-15 »).
 */
function progresse(prec, suiv, tb) {
  const val = (v) => (v === 'A' ? 4 : (tb ? parseInt(v, 10) : ECHELLE.indexOf(v)));
  const [a0, b0] = prec.split('-').map(val);
  const [a1, b1] = suiv.split('-').map(val);
  if ([a0, b0, a1, b1].some((v) => v == null || isNaN(v) || v < 0)) return false;
  // Avantage perdu : un camp recule d'un cran pour revenir a egalite.
  if (!tb && (a0 === 4 || b0 === 4)) {
    if (a1 === 3 && b1 === 3) return true;               // retour a 40-40
    if ((a0 === 3 && b0 === 4 && a1 === 4 && b1 === 3) || (a0 === 4 && b0 === 3 && a1 === 3 && b1 === 4)) return true;  // l'egalite n'a pas ete publiee
  }
  return a1 >= a0 && b1 >= b0 && (a1 + b1) > (a0 + b0);
}

/**
 * Sequence de points reconstruite. Le fournisseur rejoue parfois un jeu depuis
 * le debut au milieu du meme tableau (« 40-0, 40-15 » puis « 15-0, 15-15… ») :
 * on decoupe donc la liste en series coherentes et on garde la plus complete,
 * plutot que de melanger deux prises du meme jeu — c'est ce melange qui
 * produisait les « retours en arriere » vus a l'ecran.
 */
function pointsCoherents(points, tb) {
  const lus = (points || []).map((p) => ({ p, k: String(p.score || '').replace(/\s/g, '') }))
    .filter(({ k }) => {
      const c = k.split('-');
      if (c.length !== 2) return false;
      return tb ? (/^\d+$/.test(c[0]) && /^\d+$/.test(c[1])) : (!!POINTS_JEU[c[0]] && !!POINTS_JEU[c[1]]);
    });
  if (!lus.length) return [];

  const series = [];
  let serie = [lus[0]], etat = lus[0].k;
  for (let i = 1; i < lus.length; i++) {
    const { k } = lus[i];
    if (k === etat) continue;                                  // doublon immediat
    if (progresse(etat, k, tb)) { serie.push(lus[i]); etat = k; continue; }
    series.push(serie); serie = [lus[i]]; etat = k;            // le jeu repart : nouvelle prise
  }
  series.push(serie);

  const avancement = (s) => s[s.length - 1].k.split('-')
    .reduce((acc, v) => acc + (v === 'A' ? 4 : (tb ? (parseInt(v, 10) || 0) : ECHELLE.indexOf(v))), 0);
  let meilleure = series[0];
  series.forEach((x) => {
    if (x.length > meilleure.length || (x.length === meilleure.length && avancement(x) > avancement(meilleure))) meilleure = x;
  });
  return meilleure.map((x) => x.p);
}

function nettoyerPbp(pbp) {
  if (!Array.isArray(pbp) || !pbp.length) return pbp;
  const numJeu = (g) => parseInt(g.number_game, 10) || 0;
  const estTb = (g) => /tiebreak/i.test(String(g.set_number || ''));
  const setDe = (g) => {
    const n = (/(\d+)/.exec(String(g.set_number || 'Set 1')) || [])[1];
    return n ? 'Set ' + n : String(g.set_number || 'Set 1');
  };
  const aDesPoints = (g) => (g.points || []).some((p) => /\d/.test(String(p.score || '')));

  const parSet = new Map();
  pbp.forEach((g) => { const k = setDe(g); if (!parSet.has(k)) parSet.set(k, []); parSet.get(k).push(g); });

  const sortie = [];
  for (const [k, liste] of parSet) {
    let jeux = liste.filter((g) => !estTb(g)).sort((a, b) => numJeu(a) - numJeu(b));
    const tbs = liste.filter(estTb).sort((a, b) => numJeu(a) - numJeu(b));
    if (tbs.length) {
      // L'enveloppe vide du decisif (13e jeu, un point « - ») s'en va, les
      // pseudo-jeux deviennent les points d'un seul jeu decisif.
      jeux = jeux.filter((g) => aDesPoints(g) || numJeu(g) <= 12);
      const dern = String(tbs[tbs.length - 1].score || '').replace(/\s/g, '').split('-');
      const a1 = parseInt(dern[0], 10) || 0, b1 = parseInt(dern[1], 10) || 0;
      jeux.push({
        set_number: k, number_game: String(jeux.length + 1), tie_break: true,
        player_served: tbs[0].player_served,
        serve_winner: a1 > b1 ? 'First Player' : 'Second Player', serve_lost: null,
        score: tbs[tbs.length - 1].score,
        points: tbs.map((g) => ({ score: String(g.score || '').replace(/\s/g, '').replace('-', ' - '), break_point: null, set_point: null, match_point: null })),
      });
    }
    jeux.forEach((g, i) => {
      g.points = pointsCoherents(g.points, !!g.tie_break);
      g.set_number = k;
      g.number_game = String(i + 1);
      sortie.push(g);
    });
  }
  return sortie;
}

// Surface d'un tournoi : get_tournaments porte `tournament_sourface` (sic) pour
// les 10 000+ tournois du fournisseur. On la code sur une lettre — minuscule en
// exterieur, majuscule en salle — pour tenir dans une seule valeur Redis.
function codeSurface(s) {
  const x = String(s || '').toLowerCase();
  const base = /clay/.test(x) ? 'c' : /grass/.test(x) ? 'g' : /carpet/.test(x) ? 'k' : /hard/.test(x) ? 'h' : '';
  if (!base) return '';           // « - Play Offs » et autres libelles parasites du flux
  return /indoor/.test(x) ? base.toUpperCase() : base;
}
const SURF_NOM = { h: 'hard', H: 'hard', c: 'clay', C: 'clay', g: 'grass', G: 'grass', k: 'carpet', K: 'carpet' };

/** Table { tournament_key: code surface }, un appel amont par semaine. */
async function tableSurfaces(cleApi, jour) {
  const lu = await redisPipeline([['GET', 'tennis:surfaces']]);
  if (lu && lu[0] && lu[0].result) { try { return JSON.parse(lu[0].result); } catch (e) {} }
  const r = await fetch(API_BASE + '?method=get_tournaments&APIkey=' + cleApi, { signal: AbortSignal.timeout(25000) });
  const j = await r.json();
  const out = {};
  if (j && j.success === 1 && Array.isArray(j.result)) {
    j.result.forEach((t) => { const c = codeSurface(t.tournament_sourface); if (c) out[String(t.tournament_key)] = c; });
  }
  const compteur = 'footcnt:' + jour + ':tennis:get_tournaments';
  const corps = JSON.stringify(out);
  const ops = [['INCR', compteur], ['EXPIRE', compteur, 604800]];
  if (corps.length < REDIS_VAL_MAX) ops.push(['SETEX', 'tennis:surfaces', 604800, corps]);
  await redisPipeline(ops);
  return out;
}

export default async function handler(req, res) {
  const q = req.query || {};
  const methode = String(q.method || '');
  const jour = new Date().toISOString().slice(0, 10);

  if (methode === 'compteurs') {
    const cles = Object.keys(METHODES).map((m) => 'footcnt:' + jour + ':tennis:' + m);
    const lu = await redisPipeline(cles.map((c) => ['GET', c]));
    const out = {};
    cles.forEach((c, i) => { out[c.split(':').pop()] = Number(lu && lu[i] && lu[i].result) || 0; });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ jour, appels: out });
    return;
  }
  // ── Direct (etape 2) : tennis:live est alimente par services/tennis-live (WebSocket
  // API-Tennis -> Redis, 1 ecriture/s). Ici : une lecture Redis, 3 s de cache CDN, donc
  // tous les visiteurs partagent le meme appel. Sans cle (service arrete, perime > 90 s) on
  // retombe sur get_livescore REST (20 s), ce qui reste correct mais moins reactif.
  // Photos des joueurs (13/09/2026) : le classement n'en a pas (get_standings), les
  // fixtures oui (event_*_player_logo). On accumule un hash Redis tennis:photos a
  // chaque passage de fixtures/livescore, et l'ecran Classement demande les siennes ici.
  if (methode === 'photos') {
    const cles = String(q.keys || '').split(',').map((k) => k.replace(/[^0-9]/g, '')).filter(Boolean).slice(0, 300);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    if (!cles.length) { res.status(200).json({ success: 1, result: {} }); return; }
    const lu = await redisPipeline([['HMGET', 'tennis:photos'].concat(cles)]);
    const vals = (lu && lu[0] && lu[0].result) || [];
    const out = {};
    cles.forEach((k, i) => { if (vals[i]) out[k] = vals[i]; });
    res.status(200).json({ success: 1, result: out });
    return;
  }

  // Cotes du jour (13/09/2026) pour la colonne du calendrier : UNE requete get_odds par jour
  // (259 Ko amont) reduite a { event_key: { c1, c2 } } (meilleure cote vainqueur), Redis 30 min.
  if (methode === 'cotes-jour') {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(q.date || '')) ? String(q.date) : jour;
    const cleC = 'tennis:cotes:' + d;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800');
    const luC = await redisPipeline([['GET', cleC]]);
    if (luC && luC[0] && luC[0].result) { res.setHeader('X-Cache-Tennis', 'redis'); res.status(200).send(luC[0].result); return; }
    const cleApi = process.env.API_TENNIS_KEY;
    if (!cleApi) { res.status(500).json({ error: 'API_TENNIS_KEY absente' }); return; }
    try {
      const r = await fetch(API_BASE + '?method=get_odds&date_start=' + d + '&date_stop=' + d + '&timezone=UTC&APIkey=' + cleApi, { signal: AbortSignal.timeout(25000) });
      const j = await r.json();
      const out = {};
      if (j && j.success === 1 && j.result && typeof j.result === 'object') {
        Object.keys(j.result).forEach((k) => {
          const ha = j.result[k] && j.result[k]['Home/Away']; if (!ha) return;
          const best = (o) => { let b = 0; Object.keys(o || {}).forEach((bk) => { const v = parseFloat(o[bk]); if (v > 1 && v > b) b = v; }); return b || null; };
          const c1 = best(ha.Home), c2 = best(ha.Away);
          if (c1 && c2) out[k] = { c1, c2 };
        });
      }
      const corps = JSON.stringify({ success: 1, jour: d, result: out });
      const compteur = 'footcnt:' + jour + ':tennis:get_odds';
      await redisPipeline([['INCR', compteur], ['EXPIRE', compteur, 604800], ['SETEX', cleC, 1800, corps]]);
      res.setHeader('X-Cache-Tennis', 'amont');
      res.status(200).send(corps);
    } catch (e) {
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      res.status(200).json({ success: 1, jour: d, result: {}, erreur: e.message });
    }
    return;
  }

  // Journal des points NinjaScores (ecrit par services/tennis-live), plus propre que le
  // point par point de l'API. Absent si le service ne tourne pas : la fiche garde l'API.
  if (methode === 'journal') {
    const mk = String(q.match_key || '').replace(/[^0-9]/g, '');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3, stale-while-revalidate=5');
    if (!mk) { res.status(200).json({ success: 1, result: null }); return; }
    const luJ = await redisPipeline([['GET', 'tennis:pbp:' + mk]]);
    const corpsJ = luJ && luJ[0] && luJ[0].result;
    res.status(200).send('{"success":1,"result":' + (corpsJ || 'null') + '}');
    return;
  }

  if (methode === 'live') {
    const mk = q.match_key ? String(q.match_key).replace(/[^0-9]/g, '') : '';
    const lu = await redisPipeline([['GET', 'tennis:live:meta'], ['GET', mk ? 'tennis:live:' + mk : 'tennis:live']]);
    let meta = null, corps = null;
    try { meta = lu && lu[0] && lu[0].result ? JSON.parse(lu[0].result) : null; } catch (e) {}
    corps = lu && lu[1] && lu[1].result ? lu[1].result : null;
    const frais = meta && meta.ts && Date.now() - meta.ts < 90000;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (frais && corps) {
      res.setHeader('Cache-Control', 'public, s-maxage=3, stale-while-revalidate=5');
      res.setHeader('X-Tennis-Live', 'ws');
      res.status(200).send(mk ? '{"success":1,"source":"ws","result":[' + corps + ']}' : '{"success":1,"source":"ws","result":' + corps + '}');
      return;
    }
    if (frais && mk) { // le service tourne mais ce match n'est pas (ou plus) en direct
      res.setHeader('Cache-Control', 'public, s-maxage=3');
      res.setHeader('X-Tennis-Live', 'ws-absent');
      res.status(200).json({ success: 1, source: 'ws', result: [] });
      return;
    }
    // Repli REST : on reutilise le chemin get_livescore (cache Redis 20 s, detail garde).
    req.query = { method: 'get_livescore', match_key: mk || undefined, detail: mk ? '1' : undefined }; // liste allegee, detail seulement par match
    res.setHeader('X-Tennis-Live', 'rest');
    return handler(req, res);
  }


  // Surface d'un ou plusieurs tournois (21/09/2026). data/tennis-tournois.json
  // ne connait que les 48 tournois du circuit principal : des qu'un match vient
  // d'un Challenger ou d'un ITF, la surface manquait partout (calendrier, fiche,
  // filtres). get_tournaments la donne pour les 10 000+ tournois du fournisseur.
  //   ?method=surfaces            -> toute la table { tk: code }
  //   ?method=surfaces&tk=1,2,3   -> { tk: { surf, indoor } }
  if (methode === 'surfaces') {
    const cleApi0 = process.env.API_TENNIS_KEY;
    if (!cleApi0) { res.status(500).json({ error: 'API_TENNIS_KEY absente' }); return; }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    try {
      const table = await tableSurfaces(cleApi0, jour);
      const tks = String(q.tk || '').split(',').map((k) => k.replace(/[^0-9]/g, '')).filter(Boolean).slice(0, 300);
      if (!tks.length) { res.status(200).json({ success: 1, result: table }); return; }
      const out = {};
      tks.forEach((k) => { const c = table[k]; if (c) out[k] = { surf: SURF_NOM[c], indoor: /[A-Z]/.test(c) }; });
      res.status(200).json({ success: 1, result: out });
    } catch (e) {
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      res.status(200).json({ success: 1, result: {}, erreur: e.message });
    }
    return;
  }

  // ── Forme d'un joueur (21/09/2026) ─────────────────────────────────────────
  // Les « 10 derniers matchs » de la fiche venaient de get_H2H : dix lignes par
  // joueur, dont la surface n'etait resolue que par data/tennis-tournois.json
  // (48 tournois) — des qu'un joueur sortait du circuit principal, le filtre
  // par surface tombait a plat.
  //
  // Ici : get_fixtures&player_key sur 13 mois (1 appel par joueur, cache 3 h)
  // croise avec la table des surfaces de get_tournaments (10 000+ tournois,
  // cache 7 jours). On rend les n derniers matchs, les n derniers PAR SURFACE
  // et le bilan de la periode — de quoi calculer un pronostic comme au foot.
  //
  //   /api/tennis/?method=forme&player=2072[&n=10]
  if (methode === 'forme') {
    const pk = String(q.player || q.player_key || '').replace(/[^0-9]/g, '');
    const n = Math.min(Math.max(parseInt(q.n, 10) || 10, 1), 20);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!pk) { res.status(400).json({ error: 'parametre player manquant' }); return; }
    const cleF = 'tennis:forme:' + pk + ':' + n;
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=21600');
    const luF = await redisPipeline([['GET', cleF]]);
    if (luF && luF[0] && luF[0].result) { res.setHeader('X-Cache-Tennis', 'redis'); res.status(200).send(luF[0].result); return; }
    const cleApi = process.env.API_TENNIS_KEY;
    if (!cleApi) { res.status(500).json({ error: 'API_TENNIS_KEY absente' }); return; }
    try {
      const debut = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
      const [surfaces, brut] = await Promise.all([
        tableSurfaces(cleApi, jour),
        fetch(API_BASE + '?method=get_fixtures&player_key=' + pk + '&date_start=' + debut
          + '&date_stop=' + jour + '&timezone=UTC&APIkey=' + cleApi, { signal: AbortSignal.timeout(25000) })
          .then((r) => r.json()),
      ]);
      const compteur = 'footcnt:' + jour + ':tennis:get_fixtures';
      redisPipeline([['INCR', compteur], ['EXPIRE', compteur, 604800]]).catch(() => {});

      // Simples termines uniquement : les doubles et les exhibitions ne disent
      // rien de la forme en simple, et un match sans vainqueur est en cours.
      const joues = (((brut && brut.result) || []))
        .filter((m) => /Singles/i.test(String(m.event_type_type || '')) && m.event_winner)
        .sort((a, b) => String(b.event_date + ' ' + (b.event_time || '')).localeCompare(String(a.event_date + ' ' + (a.event_time || ''))));

      const ligne = (m) => {
        const moiEst1 = String(m.first_player_key) === pk;
        const sets = (m.scores || []).map((s) => {
          // Un jeu decisif arrive en « 7.5 » (jeux.points) : le point apres la
          // virgule n'est pas un jeu, on garde la partie entiere.
          const a = parseInt(String(s.score_first), 10), b = parseInt(String(s.score_second), 10);
          if (isNaN(a) || isNaN(b) || (a === 0 && b === 0)) return null;
          return moiEst1 ? { a: a, b: b } : { a: b, b: a };
        }).filter(Boolean);
        const code = surfaces[String(m.tournament_key)] || '';
        const type = String(m.event_type_type || '');
        const gagne = (moiEst1 && m.event_winner === 'First Player') || (!moiEst1 && m.event_winner === 'Second Player');
        const setsG = sets.filter((s) => s.a > s.b).length;
        const setsP = sets.filter((s) => s.b > s.a).length;
        return {
          d: m.event_date,
          cle: m.event_key,
          t: String(m.tournament_name || '').replace(/\s*\(.*?\)\s*/g, ' ').trim(),
          tk: m.tournament_key,
          surf: SURF_NOM[code] || null,
          indoor: /[A-Z]/.test(code) || undefined,
          circuit: /wta|women/i.test(type) ? 'WTA' : 'ATP',
          niveau: /challenger/i.test(type) ? 'CH' : (/itf/i.test(type) ? 'ITF' : 'TOUR'),
          tour: m.tournament_round || null,
          adv: moiEst1 ? m.event_second_player : m.event_first_player,
          advCle: moiEst1 ? m.second_player_key : m.first_player_key,
          g: gagne,
          sets: sets.map((s) => [s.a, s.b]),
          setsG: setsG,
          setsP: setsP,
          jeux: sets.reduce((acc, s) => acc + s.a + s.b, 0),
          // Tie-break : les deux joueurs a 6 jeux ou plus dans le meme set.
          tb: sets.some((s) => s.a >= 6 && s.b >= 6),
          set1: sets.length ? sets[0].a > sets[0].b : null,
        };
      };

      const tous = joues.map(ligne);
      const bilanDe = (L) => ({ j: L.length, g: L.filter((m) => m.g).length });
      const parSurface = {};
      ['hard', 'clay', 'grass', 'carpet'].forEach((s) => {
        const L = tous.filter((m) => m.surf === s);
        if (L.length) parSurface[s] = { bilan: bilanDe(L), matchs: L.slice(0, n) };
      });

      const corps = JSON.stringify({
        success: 1,
        result: {
          cle: Number(pk),
          nom: (joues[0] && (String(joues[0].first_player_key) === pk ? joues[0].event_first_player : joues[0].event_second_player)) || null,
          matchs: tous.slice(0, n),
          surfaces: parSurface,
          bilan: bilanDe(tous),
          depuis: debut,
          maj: new Date().toISOString(),
        },
      });
      if (corps.length < REDIS_VAL_MAX) await redisPipeline([['SETEX', cleF, 10800, corps]]);
      res.setHeader('X-Cache-Tennis', 'amont');
      res.status(200).send(corps);
    } catch (e) {
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      res.status(200).json({ success: 1, result: null, erreur: e.message });
    }
    return;
  }

  const spec = METHODES[methode];
  if (!spec) { res.status(400).json({ error: 'Methode non autorisee', autorisees: Object.keys(METHODES) }); return; }
  const cle = process.env.API_TENNIS_KEY;
  if (!cle) { res.status(500).json({ error: 'API_TENNIS_KEY absente' }); return; }

  // Parametres : uniquement ceux declares, tries -> cle de cache stable.
  const qs = new URLSearchParams();
  spec.params.slice().sort().forEach((p) => { if (q[p] != null && q[p] !== '') qs.set(p, String(q[p])); });
  // Le fuseau : on demande UTC et on convertit cote client, comme au foot.
  const resume = methode === 'get_fixtures' && q.resume === '1';
  const cleRedis = 'tennis:' + methode + '?' + qs.toString() + (q.detail === '1' ? '&detail=1' : '') + (resume ? '&resume=1' : '');
  // Le resume (tournois d'une periode, pour l'accueil) change peu : 30 min.
  const ttl = resume ? 1800 : spec.ttl;

  const lu = await redisPipeline([['GET', cleRedis]]);
  const stocke = lu && lu[0] && lu[0].result;
  if (stocke) {
    res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`);
    res.setHeader('X-Cache-Tennis', 'redis');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(stocke);
    return;
  }

  try {
    const url = API_BASE + '?method=' + methode + '&timezone=UTC&APIkey=' + cle + (qs.toString() ? '&' + qs.toString() : '');
    const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
    let corps = await r.text();
    let json = null;
    try { json = JSON.parse(corps); } catch (e) {}
    // Les listes (calendrier, live) embarquent le point par point et les stats de chaque
    // match : 1,4 Mo par jour, 82 % de poids inutile pour une liste et au-dela de la limite
    // Redis (900 Ko) -> on les retire ici. Le detail d'un match les redemande avec ?detail=1.
    if (json && json.success === 1 && Array.isArray(json.result) && (methode === 'get_fixtures' || methode === 'get_livescore')) {
      const photos = [];
      json.result.forEach((m) => {
        if (m.first_player_key && m.event_first_player_logo) photos.push(String(m.first_player_key), m.event_first_player_logo);
        if (m.second_player_key && m.event_second_player_logo) photos.push(String(m.second_player_key), m.event_second_player_logo);
      });
      if (photos.length) redisPipeline([['HSET', 'tennis:photos'].concat(photos.slice(0, 1000))]).catch(() => {});
    }
    // Detail d'un match : c'est la seule reponse qui porte le point par point,
    // et c'est donc la seule a nettoyer.
    if (json && json.success === 1 && Array.isArray(json.result) && q.detail === '1') {
      let touche = false;
      json.result.forEach((m) => {
        if (Array.isArray(m.pointbypoint) && m.pointbypoint.length) { m.pointbypoint = nettoyerPbp(m.pointbypoint); touche = true; }
      });
      if (touche) corps = JSON.stringify(json);
    }
    if (json && json.success === 1 && Array.isArray(json.result) && (methode === 'get_fixtures' || methode === 'get_livescore') && q.detail !== '1') {
      json.result.forEach((m) => { delete m.pointbypoint; delete m.statistics; });
      corps = JSON.stringify(json);
    }
    // ?resume=1 : un objet par tournoi (cle, nom, type, premiere/derniere date, nombre
    // de matchs, matchs en direct). Sert « Tournois cette semaine » sur l'accueil
    // sans transporter 7 jours de matchs.
    if (resume && json && json.success === 1 && Array.isArray(json.result)) {
      const agg = {};
      json.result.forEach((m) => {
        const k = String(m.tournament_key);
        const a = agg[k] || (agg[k] = { cle: m.tournament_key, nom: m.tournament_name, type: m.event_type_type, debut: m.event_date, fin: m.event_date, n: 0, live: 0 });
        a.n++;
        if (String(m.event_live) === '1') a.live++;
        if (m.event_date < a.debut) a.debut = m.event_date;
        if (m.event_date > a.fin) a.fin = m.event_date;
      });
      corps = JSON.stringify({ success: 1, resume: true, result: Object.values(agg) });
    }
    // API-Tennis repond 200 avec success:0 en cas d'erreur (cle, methode).
    if (!r.ok || !json || json.success !== 1) {
      res.setHeader('Cache-Control', 'public, s-maxage=30');
      res.status(502).json({ error: 'API-Tennis en erreur', statut: r.status, detail: json && (json.error || json.message) || null });
      return;
    }
    const compteur = 'footcnt:' + jour + ':tennis:' + methode;
    const ops = [['INCR', compteur], ['EXPIRE', compteur, 604800]];
    if (corps.length < REDIS_VAL_MAX) ops.push(['SETEX', cleRedis, ttl, corps]);
    await redisPipeline(ops);
    res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`);
    res.setHeader('X-Cache-Tennis', 'amont');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(corps);
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=30');
    res.status(502).json({ error: 'Appel API-Tennis echoue', detail: e.message });
  }
}
