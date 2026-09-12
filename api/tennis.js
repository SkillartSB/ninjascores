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
