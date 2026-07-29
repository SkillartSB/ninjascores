// Archivage permanent des matchs terminés dans Supabase — appelé par un cron
// GitHub Actions (même schéma que capture-mt : /api/capture-mt.js), toutes
// les 10 minutes.
//
// Déroulé à chaque appel :
//  1. UNE requête fixtures?date= par jour scanné (aujourd'hui + hier, pour
//     rattraper les matchs qui terminent après minuit UTC ou dont le statut
//     se stabilise avec retard) → tous les matchs du jour, tous championnats.
//  2. Filtre aux matchs TERMINÉS et aux championnats couverts par le site
//     (data/league-ids.json, résolu une fois via tools/resolve-league-ids.mjs).
//  3. Upsert "léger" immédiat (score, équipes, date...) pour que le lien/la
//     page existe tout de suite, même sans le détail.
//  4. Pour un lot borné de matchs pas encore détaillés (compos/stats/events/
//     joueurs), 4 requêtes API-Football chacune, upsert du détail complet.
//     Le lot est borné en NOMBRE (BATCH_LIMIT) ET en temps (TIME_BUDGET_MS)
//     pour ne jamais dépasser le quota ni le timeout de la fonction — le
//     rattrapage se fait sur les runs suivants (10 min plus tard).
//  5. S'arrête plus tôt si le quota API-Football restant devient bas.

const API_BASE = 'https://v3.football.api-sports.io';
const BATCH_LIMIT = Number(process.env.ARCHIVE_BATCH_LIMIT || 20);
const TIME_BUDGET_MS = 45000;      // fonction Vercel: maxDuration 60s, marge de sécurité
const QUOTA_FLOOR = 300;           // s'arrête si le quota restant descend sous ce seuil
const FINISHED = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);

import leagueIds from '../data/league-ids.json';
const LEAGUES_OK = new Set(Object.keys(leagueIds).map(Number));

let quotaRestant = Infinity;

async function apiFootball(chemin) {
  const cle = process.env.API_FOOTBALL_KEY;
  if (!cle) throw new Error('API_FOOTBALL_KEY absente');
  const r = await fetch(API_BASE + '/' + chemin, { headers: { 'x-apisports-key': cle } });
  const reste = r.headers.get('x-ratelimit-requests-remaining');
  if (reste != null) quotaRestant = Number(reste);
  if (!r.ok) throw new Error('API-Football HTTP ' + r.status);
  const j = await r.json();
  return j.response || [];
}

function supabaseUrl() {
  const u = process.env.SUPABASE_URL;
  if (!u) throw new Error('SUPABASE_URL absente');
  return u;
}

async function supabase(table, { method = 'GET', query = '', body, prefer } = {}) {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cle) throw new Error('SUPABASE_SERVICE_ROLE_KEY absente');
  const headers = { apikey: cle, Authorization: 'Bearer ' + cle, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(supabaseUrl() + '/rest/v1/' + table + query, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const texte = await r.text().catch(() => '');
    throw new Error('Supabase ' + method + ' ' + table + ' HTTP ' + r.status + ' ' + texte.slice(0, 300));
  }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : null;
}

function ymd(d) { return d.toISOString().slice(0, 10); }

function ligerFromFixture(f) {
  const fx = f.fixture || {}, lg = f.league || {}, tt = f.teams || {}, gg = f.goals || {};
  const home = tt.home || {}, away = tt.away || {};
  const venue = fx.venue || {};
  return {
    fixture_id: fx.id,
    league_id: lg.id,
    league_name: lg.name,
    season: lg.season,
    round: lg.round,
    match_date: fx.date,
    status: (fx.status || {}).short,
    home_team_id: home.id, home_team_name: home.name, home_team_logo: home.logo,
    away_team_id: away.id, away_team_name: away.name, away_team_logo: away.logo,
    home_score: gg.home, away_score: gg.away,
    venue_name: venue.name, venue_city: venue.city,
    referee: fx.referee,
    updated_at: new Date().toISOString(),
  };
}

async function detailPourMatch(fixtureId) {
  const [lineups, statistics, events, players] = await Promise.all([
    apiFootball('fixtures/lineups?fixture=' + fixtureId).catch(() => []),
    apiFootball('fixtures/statistics?fixture=' + fixtureId).catch(() => []),
    apiFootball('fixtures/events?fixture=' + fixtureId).catch(() => []),
    apiFootball('fixtures/players?fixture=' + fixtureId).catch(() => []),
  ]);
  const matchPlayers = [];
  (players || []).forEach((teamBlock) => {
    const teamId = (teamBlock.team || {}).id;
    (teamBlock.players || []).forEach((p) => {
      const pl = p.player || {};
      if (!pl.id) return;
      matchPlayers.push({
        fixture_id: fixtureId, player_id: pl.id, player_name: pl.name,
        team_id: teamId, stats: (p.statistics || [])[0] || null,
      });
    });
  });
  return { lineups, statistics, events, matchPlayers };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const t0 = Date.now();
  const resume = { scanne: 0, legerUpserte: 0, detailTraite: 0, enAttente: 0, quotaRestant: null, erreurs: [] };

  try {
    const aujourdhui = new Date();
    const hier = new Date(aujourdhui.getTime() - 86400000);
    const dates = [ymd(aujourdhui), ymd(hier)];

    const finisParDate = [];
    for (const d of dates) {
      const fixtures = await apiFootball('fixtures?date=' + d);
      finisParDate.push(...fixtures);
    }
    resume.scanne = finisParDate.length;

    const finis = finisParDate.filter((f) => {
      const st = (f.fixture && f.fixture.status && f.fixture.status.short) || '';
      const lg = f.league && f.league.id;
      return FINISHED.has(st) && LEAGUES_OK.has(lg);
    });

    if (finis.length) {
      const legers = finis.map(ligerFromFixture);
      // upsert par lots de 200 (limite raisonnable pour une requête REST)
      for (let i = 0; i < legers.length; i += 200) {
        await supabase('matches', {
          method: 'POST', query: '?on_conflict=fixture_id', body: legers.slice(i, i + 200),
          prefer: 'resolution=merge-duplicates,return=minimal',
        });
      }
      resume.legerUpserte = legers.length;
    }

    // quels matchs (parmi ceux du jour) n'ont pas encore leur détail ?
    const finisParId = new Map(finis.map((f) => [f.fixture.id, f]));
    const idsFinis = finis.map((f) => f.fixture.id);
    let dejaDetailles = new Set();
    if (idsFinis.length) {
      const rows = await supabase('matches', {
        query: '?select=fixture_id&detail_captured=eq.true&fixture_id=in.(' + idsFinis.join(',') + ')',
      });
      dejaDetailles = new Set((rows || []).map((r) => r.fixture_id));
    }
    const enAttente = idsFinis.filter((id) => !dejaDetailles.has(id));
    resume.enAttente = enAttente.length;

    let traites = 0;
    for (const fixtureId of enAttente) {
      if (traites >= BATCH_LIMIT) break;
      if (Date.now() - t0 > TIME_BUDGET_MS) break;
      if (quotaRestant < QUOTA_FLOOR) break;

      try {
        const { lineups, statistics, events, matchPlayers } = await detailPourMatch(fixtureId);
        // Postgres verifie les contraintes NOT NULL AVANT de resoudre le
        // conflit : un upsert partiel (sans match_date/status) echoue meme
        // si la ligne existe deja. On renvoie donc TOUTES les colonnes de
        // base + le detail en un seul upsert complet.
        const base = ligerFromFixture(finisParId.get(fixtureId));
        await supabase('matches', {
          method: 'POST', query: '?on_conflict=fixture_id',
          body: [{ ...base, lineups, statistics, events, detail_captured: true, updated_at: new Date().toISOString() }],
          prefer: 'resolution=merge-duplicates,return=minimal',
        });
        if (matchPlayers.length) {
          await supabase('match_players', {
            method: 'POST', query: '?on_conflict=fixture_id,player_id', body: matchPlayers,
            prefer: 'resolution=merge-duplicates,return=minimal',
          });
        }
        traites++;
      } catch (e) {
        resume.erreurs.push('fixture ' + fixtureId + ': ' + e.message);
      }
    }
    resume.detailTraite = traites;
    resume.quotaRestant = quotaRestant === Infinity ? null : quotaRestant;

    res.status(200).json(resume);
  } catch (e) {
    resume.erreurs.push(e.message);
    res.status(500).json(resume);
  }
}
