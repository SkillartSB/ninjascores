/**
 * polymarket.service.js — NinjaScores × Polymarket Integration
 *
 * Fetches live prediction market data from Polymarket's public Gamma API.
 * No auth required. Read-only. No wallet, no trading.
 *
 * Uses /events?series_id={id} to get individual match-level markets:
 * Chinese Super League, EPL, La Liga, NBA, ATP, NHL, UFC, and 30+ more.
 *
 * Exposes: window.PolymarketService
 */
(function () {
  'use strict';

  const IS_LOCAL   = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';
  const GAMMA_BASE = IS_LOCAL ? 'http://localhost:9878/proxy' : 'https://gamma-api.polymarket.com';

  // ── Competition → series_id map ───────────────────────────────────────────
  // Verified against /sports endpoint (May 2026)
  const SPORT_SERIES = {
    soccer: {
      'Champions League':       10204,
      'Premier League':         10188,
      'La Liga':                10193,
      'Bundesliga':             10194,
      'Ligue 1':                10195,
      'Serie A':                10203,
      'Europa League':          10209,
      'MLS':                    10189,
      'Süper Lig':              10292,
      'Chinese Super League':   10439,
      'J. League':              10360,
      'Saudi Pro League':       10361,
      '2. Bundesliga':          10670,
      'Championship':           10355,
      'Eredivisie':             10286,
      'Liga Argentina':         10285,
      'Serie B':                10287,
      'Brasileirão':            10359,
      'Colombian Liga':         10437,
      'Liga MX':                10290,
      'Liga Portugal':          10330,
    },
    basketball: {
      'NBA':                    10345,
      'Euroleague':             10371,
      'NBA G League':           10470,
    },
    tennis: {
      'ATP':                    10365,
      'WTA':                    10366,
    },
    hockey: {
      'NHL':                    10346,
      'AHL':                    10699,
      'SHL':                    10695,
      'KHL':                    10700,
    },
    mma: {
      'UFC':                    10500,
    },
  };

  // Flat map: seriesId → competition name (for reverse lookup)
  const SERIES_NAMES = {};
  Object.values(SPORT_SERIES).forEach(competitions => {
    Object.entries(competitions).forEach(([name, id]) => {
      SERIES_NAMES[id] = name;
    });
  });

  // ── Volume formatting ─────────────────────────────────────────────────────
  function formatVolume(amount) {
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000)     return `$${(amount / 1_000).toFixed(0)}K`;
    return `$${Math.round(amount)}`;
  }

  // ── Match status detection ────────────────────────────────────────────────
  const TERMINAL_PERIODS = new Set(['FT','POST','VFT','AET','CAN','AB']);

  function getMatchStatus(event, startDate) {
    // Trust the API first
    if (event.closed)  return 'ended';
    if (event.ended)   return 'ended';
    if (TERMINAL_PERIODS.has(event.period)) return 'ended';

    const now        = Date.now();
    const start      = startDate.getTime();
    const sinceStart = now - start;

    if (start > now) return 'upcoming';
    // Live window: 2h from kick-off covers 90min match + stoppages + half-time.
    // Extra time (max 30min) means worst-case ~2h15 — we use 2h25 as safe ceiling.
    if (sinceStart < 145 * 60 * 1000) return 'live';
    return 'ended';
  }

  // ── Parse a Polymarket event → clean match object ─────────────────────────
  // Handles two market structures:
  // 1. Soccer-style: separate market per team, groupItemTitle = team name, prices[0] = win prob
  // 2. NBA/NHL-style: single main market, groupItemTitle = null, prices = [home_prob, away_prob]
  function parseMatchEvent(event, competitionName, seriesId) {
    const allMarkets = (event.markets || []);

    // Skip "More Markets" events (handicap, scorer, corners, etc.)
    const isSubEvent = (event.title || '').includes(' - ') &&
      allMarkets.every(m => !m.groupItemTitle || m.groupItemTitle !== event.title?.split(' vs. ')[0]?.trim());

    // Title: "FC Bayern München vs. Paris Saint-Germain FC"
    const titleParts = (event.title || '').split(' vs. ');
    const homeTeam = titleParts[0]?.trim() || '';
    const awayTeam = (titleParts[1] || '').split(' - ')[0].trim();

    // Skip sub-events (prop bets, handicaps) — only keep main matchup events
    const mainTitleMarket = allMarkets.find(m =>
      (!m.groupItemTitle || m.groupItemTitle.trim() === '' || m.groupItemTitle === '?') &&
      (m.question || '').includes(' vs. ')
    );

    // Soccer-style: team-named markets
    const SKIP_TITLES = ['spread', 'o/u', '1h ', 'half', 'points o/u', 'assists o/u',
                         'rebounds', 'goalscorer', 'scorer', 'corner', 'cards', 'handicap',
                         'exact score', 'total goals', 'anytime'];
    const teamMarkets = allMarkets.filter(m =>
      m.groupItemTitle && m.groupItemTitle.trim() !== '' && m.groupItemTitle !== '?' &&
      !SKIP_TITLES.some(s => m.groupItemTitle.toLowerCase().includes(s)) &&
      !SKIP_TITLES.some(s => (m.question || '').toLowerCase().includes(s))
    );

    function parsePrices(m) {
      try {
        const p = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices || []);
        return p.map(v => parseFloat(v) || 0);
      } catch (e) { return []; }
    }

    let homePct = 0, awayPct = 0, drawPct = null;

    if (teamMarkets.some(m => m.groupItemTitle === homeTeam || m.groupItemTitle === awayTeam)) {
      // Soccer-style
      const probs = {};
      teamMarkets.forEach(m => {
        const p = parsePrices(m);
        if (p.length > 0) probs[m.groupItemTitle] = p[0];
      });
      homePct = Math.round((probs[homeTeam] || 0) * 100);
      awayPct = Math.round((probs[awayTeam] || 0) * 100);
      const drawKey = Object.keys(probs).find(k => k.toLowerCase().startsWith('draw'));
      drawPct = drawKey ? Math.round(probs[drawKey] * 100) : null;
    } else if (mainTitleMarket) {
      // NBA/NHL-style: prices = [home_prob, away_prob]
      const p = parsePrices(mainTitleMarket);
      homePct = Math.round((p[0] || 0) * 100);
      awayPct = Math.round((p[1] || 0) * 100);
    }

    // Implied odds: 1 / probability
    function calcOdds(pct) {
      return pct > 0 ? Math.round(10000 / pct) / 100 : null;
    }

    // Game start time from first market with gameStartTime
    const gstRaw = allMarkets.find(m => m.gameStartTime)?.gameStartTime;
    const startDate = gstRaw
      ? new Date(gstRaw.replace(' ', 'T').replace('+00', 'Z'))
      : new Date(event.endDate);

    const status   = getMatchStatus(event, startDate);
    const vol24h   = parseFloat(event.volume24hr) || 0;
    const volTotal = parseFloat(event.volume)     || 0;

    return {
      eventId:    event.id,
      slug:       event.slug,
      seriesId: seriesId || null,
      competition: competitionName || '',
      homeTeam,
      awayTeam,
      homePct,
      awayPct,
      drawPct,
      homeOdds: calcOdds(homePct),
      awayOdds: calcOdds(awayPct),
      drawOdds: calcOdds(drawPct),
      volume24h:          vol24h,
      totalVolume:        volTotal,
      formattedVolume24h: formatVolume(vol24h),
      formattedTotal:     formatVolume(volTotal),
      startDate,
      status,
      image: event.image || null,
      // Live score data from Gamma API (updated in real-time by Polymarket)
      apiScore:   event.score  || null,
      apiPeriod:  event.period || null,
      apiElapsed: event.elapsed|| null,
      apiLive:    event.live   || false,
      apiEnded:   event.ended  || false,
    };
  }

  // ── HTTP helper ───────────────────────────────────────────────────────────
  async function gammaFetch(path, params = {}) {
    const url = new URL(`${GAMMA_BASE}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Gamma API ${res.status}: ${res.statusText}`);
    return res.json();
  }

  // ── In-memory cache ───────────────────────────────────────────────────────
  const _cache = new Map();
  async function cached(key, ttlMs, fn) {
    const hit = _cache.get(key);
    if (hit && Date.now() - hit.ts < ttlMs) return hit.data;
    const data = await fn();
    _cache.set(key, { data, ts: Date.now() });
    return data;
  }

  // ── Core: fetch match events for a series ─────────────────────────────────
  // Fetches both open AND recently-closed events so we can show final scores.
  async function getMatchEvents(seriesId, competitionName, limit = 50) {
    return cached(`series:${seriesId}`, 60_000, async () => {
      const SUB_PATTERNS = [' - More', ' - Player', ' - Exact', ' - Total', ' - Half', ' - Corner', ' - Card'];

      function filterAndParse(events) {
        return events
          .filter(e => {
            if (!e.markets?.some(m => m.gameStartTime)) return false;
            const t = e.title || '';
            if (SUB_PATTERNS.some(p => t.includes(p))) return false;
            if (!t.includes(' vs. ') && !t.includes(' vs ')) return false;
            return true;
          })
          .map(e => parseMatchEvent(e, competitionName, seriesId));
      }

      // Fetch open/upcoming/live matches
      const [rawOpen, rawClosed] = await Promise.all([
        gammaFetch('/events', {
          active: 'true', closed: 'false',
          series_id: seriesId, limit,
          _sortBy: 'startDate', _sortDirection: 'DESC',
        }),
        // Also fetch recently-closed events (last ~10) for their final scores
        gammaFetch('/events', {
          closed: 'true',
          series_id: seriesId, limit: 15,
          _sortBy: 'startDate', _sortDirection: 'DESC',
        }),
      ]);

      const openEvents   = Array.isArray(rawOpen)   ? rawOpen   : (rawOpen.events   || []);
      const closedEvents = Array.isArray(rawClosed)  ? rawClosed : (rawClosed.events || []);

      // Build a score lookup from closed events (slug → {score, period, ended})
      const closedScores = {};
      closedEvents.forEach(e => {
        if (e.slug && e.score) closedScores[e.slug] = {
          score: e.score, period: e.period || 'FT', ended: true,
        };
      });

      // Parse open events, enriching with closed-event scores where available
      const openMatches = filterAndParse(openEvents).map(m => {
        const cs = closedScores[m.slug];
        if (cs && !m.apiScore) {
          return { ...m, apiScore: cs.score, apiPeriod: cs.period, apiEnded: true };
        }
        return m;
      });

      // Also include closed events that are within the recent window (not in open list)
      const openSlugs = new Set(openMatches.map(m => m.slug));
      const closedMatches = filterAndParse(closedEvents).filter(m => !openSlugs.has(m.slug));

      return [...openMatches, ...closedMatches];
    });
  }

  // ── Fetch all competitions for a sport ────────────────────────────────────
  // Returns: [{ competition, matches: [...] }, ...]
  async function getLivescoreForSport(sport) {
    const series = SPORT_SERIES[sport];
    if (!series) return [];

    const now = Date.now();
    const windowMs = 7 * 24 * 60 * 60 * 1000; // show up to 7 days ahead, 24h past

    const results = await Promise.all(
      Object.entries(series).map(async ([competition, seriesId]) => {
        try {
          const matches = await getMatchEvents(seriesId, competition, 50);
          // Filter to matches within the time window
          const filtered = matches.filter(m => {
            const diff = m.startDate.getTime() - now;
            return diff > -24 * 3600 * 1000 && diff < windowMs;
          });
          console.log(`[PolymarketService] ${competition}: ${filtered.length}/${matches.length} matches in window`);
          return { competition, seriesId, matches: filtered };
        } catch (e) {
          console.warn(`[PolymarketService] ${competition}:`, e.message);
          return { competition, seriesId, matches: [] };
        }
      })
    );

    // Remove empty competitions, sort: live first, then upcoming by date, then ended
    return results
      .filter(r => r.matches.length > 0)
      .sort((a, b) => {
        const scoreA = a.matches.some(m => m.status === 'live') ? 0
                     : a.matches.some(m => m.status === 'upcoming') ? 1 : 2;
        const scoreB = b.matches.some(m => m.status === 'live') ? 0
                     : b.matches.some(m => m.status === 'upcoming') ? 1 : 2;
        return scoreA - scoreB;
      });
  }

  // ── Single market by ID ───────────────────────────────────────────────────
  async function getMarket(marketId) {
    return cached(`market:${marketId}`, 30_000, async () => {
      return gammaFetch(`/markets/${marketId}`);
    });
  }

  // ── Single event by slug ──────────────────────────────────────────────────
  async function getEventBySlug(slug) {
    return cached(`event:${slug}`, 30_000, async () => {
      const raw = await gammaFetch('/events', { slug });
      const events = Array.isArray(raw) ? raw : (raw.events || [raw]);
      return events[0] ? parseMatchEvent(events[0], '') : null;
    });
  }

  // ── Legacy: tournament-level markets (old PolymarketWidget) ──────────────
  const SPORT_PATTERNS = {
    soccer:     ['fifa', 'world cup', 'champions league', 'premier league', 'laliga', 'la liga',
                 'bundesliga', 'serie a', 'ligue 1', 'europa league', 'ucl', 'mls', 'copa',
                 'euro 2024', 'euro 2025', 'euro 2026', 'ballon d\'or', 'golden boot'],
    tennis:     ['wimbledon', 'roland garros', 'us open tennis', 'australian open',
                 'atp', 'wta', 'grand slam', 'djokovic', 'alcaraz', 'sinner', 'swiatek'],
    basketball: ['nba', 'euroleague', 'fiba', 'lakers', 'celtics', 'warriors', 'nba finals',
                 'nba championship', 'mvp'],
    nfl:        ['nfl', 'super bowl', 'touchdown', 'quarterback', 'patriots', 'chiefs'],
    hockey:     ['nhl', 'stanley cup', 'hockey'],
    baseball:   ['mlb', 'world series', 'baseball'],
    mma:        ['ufc', 'mma', 'fight', 'knockout', 'championship bout'],
    golf:       ['masters', 'pga', 'us open golf', 'ryder cup', 'tiger woods'],
  };

  function detectSport(question) {
    const q = question.toLowerCase();
    for (const [sport, keywords] of Object.entries(SPORT_PATTERNS)) {
      if (keywords.some(kw => q.includes(kw))) return sport;
    }
    return 'other';
  }

  // ── Sub-events for a specific match (More Markets, Exact Score, etc.) ────
  async function getSubEvents(seriesId, homeTeam, awayTeam) {
    return cached(`sub:${seriesId}:${homeTeam}:${awayTeam}`, 60_000, async () => {
      const raw = await gammaFetch('/events', {
        active: 'true', closed: 'false', series_id: seriesId, limit: 100,
      });
      const events = Array.isArray(raw) ? raw : (raw.events || []);
      const SHOW = ['More Markets', 'Exact Score', 'Halftime'];
      // Correspondance tolerante : les libelles affiches ("Man. City", accents)
      // ne correspondent pas toujours au titre Polymarket ("Manchester City").
      // Un startsWith strict renvoyait [] et vidait la liste des marches.
      const norm = x => (x || '').toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ').trim();
      const tok = n => norm(n).split(' ').filter(w => w.length > 3)
        .sort((x, y) => y.length - x.length)[0] || norm(n);
      const hT = tok(homeTeam), aT = tok(awayTeam);
      const hasMarket = e => SHOW.some(p => norm(e.title || '').includes(norm(p)));
      const byTeam = events.filter(e => {
        if (!hasMarket(e)) return false;
        const t = norm(e.title || '');
        return (hT && t.includes(hT)) || (aT && t.includes(aT));
      });
      // series_id scope deja la requete a ce match : si aucun titre ne matche
      // les noms d'equipe, on garde les evenements du bon type plutot que rien.
      const picked = byTeam.length ? byTeam : events.filter(hasMarket);
      return picked
        .map(e => ({
          title: e.title,
          markets: (e.markets || []).map(m => {
            let prices = [];
            try {
              prices = (typeof m.outcomePrices === 'string'
                ? JSON.parse(m.outcomePrices)
                : (m.outcomePrices || [])
              ).map(Number);
            } catch(_) {}
            return {
              question:       m.question,
              groupItemTitle: m.groupItemTitle,
              prices,
              volume: parseFloat(m.volume) || 0,
            };
          }).filter(m => m.prices.length > 0)
        }))
        .filter(e => e.markets.length > 0);
    });
  }

  // ── Polling ───────────────────────────────────────────────────────────────
  let _pollTimer = null;

  function startPolling(onUpdate, sport = 'soccer') {
    stopPolling();
    let hasLive = false;
    const tick = async () => {
      try {
        const feed = await getLivescoreForSport(sport);
        hasLive = feed.some(c => c.matches.some(m => m.status === 'live'));
        onUpdate(feed);
      } catch (err) {
        console.warn('[PolymarketService] Poll error:', err);
      }
      _pollTimer = setTimeout(tick, hasLive ? 30_000 : 60_000);
    };
    tick();
  }

  function stopPolling() {
    if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null; }
  }

  // ── Sports WebSocket — live scores ───────────────────────────────────────────
  // wss://sports-api.polymarket.com/ws
  // Broadcasts: { slug, live, ended, score, period, elapsed, last_update }
  // Server pings every 5s → client must pong within 10s
  const _wsScores    = new Map();   // slug → scoreData
  const _wsListeners = new Set();
  let   _ws               = null;
  let   _wsReconnectTimer = null;

  function _wsConnect() {
    if (_ws && (_ws.readyState === 0 || _ws.readyState === 1)) return; // CONNECTING or OPEN
    try {
      _ws = new WebSocket('wss://sports-api.polymarket.com/ws');

      _ws.onopen = () => {
        console.log('[PolymarketService] WS connected — live scores active');
        if (_wsReconnectTimer) { clearTimeout(_wsReconnectTimer); _wsReconnectTimer = null; }
      };

      _ws.onmessage = (e) => {
        // Handle plain-text ping (case-insensitive — docs show "Ping" with capital P)
        if (typeof e.data === 'string' && e.data.toLowerCase() === 'ping') {
          _ws.send('pong');
          return;
        }
        let data;
        try { data = JSON.parse(e.data); } catch (_) { return; }
        // Handle JSON ping  { type: 'ping' } or just "ping"
        if (!data || typeof data === 'string' && data.toLowerCase() === 'ping') { _ws.send('pong'); return; }
        if (data.type && data.type.toLowerCase() === 'ping') { _ws.send('pong'); return; }
        // Score update — { slug, live, ended, score, period, elapsed, last_update, ... }
        if (data.slug) {
          _wsScores.set(data.slug, data);
          _wsListeners.forEach(fn => { try { fn(data.slug, data); } catch (_) {} });
        }
      };

      _ws.onclose = () => {
        console.log('[PolymarketService] WS closed — reconnecting in 5s');
        _ws = null;
        _wsReconnectTimer = setTimeout(_wsConnect, 5000);
      };

      _ws.onerror = (err) => {
        console.warn('[PolymarketService] WS error:', err.message || err);
      };

    } catch (err) {
      console.warn('[PolymarketService] WS init failed:', err);
      _wsReconnectTimer = setTimeout(_wsConnect, 5000);
    }
  }

  function _wsDisconnect() {
    if (_wsReconnectTimer) { clearTimeout(_wsReconnectTimer); _wsReconnectTimer = null; }
    if (_ws) { _ws.close(); _ws = null; }
  }

  const SportsWS = {
    connect:      _wsConnect,
    disconnect:   _wsDisconnect,
    getScore:     (slug) => _wsScores.get(slug) || null,
    getAllScores:  ()     => Object.fromEntries(_wsScores),
    /** fn(slug, scoreData) — returns unsubscribe fn */
    subscribe:    (fn)   => { _wsListeners.add(fn); return () => _wsListeners.delete(fn); },
  };

  // ── Soccer period labels (French) ─────────────────────────────────────────
  // All official period codes from Polymarket Sports WebSocket docs
  const PERIOD_LABELS = {
    // Soccer
    '1H': '1ère mi-temps', '2H': '2ème mi-temps', 'HT': 'Mi-temps',
    'ET': 'Prolongations', 'PEN': 'Tirs au but',
    // Soccer end states
    'FT': 'Terminé', 'POST': 'Terminé', 'VFT': 'Terminé', 'AET': 'Terminé (AP)',
    // NFL / NBA / CBB — quarters
    'Q1': '1er quart', 'Q2': '2e quart', 'Q3': '3e quart', 'Q4': '4e quart',
    // Ice hockey — periods
    'P1': '1ère période', 'P2': '2e période', 'P3': '3e période',
    // Shared
    'OT': 'Prolongation', 'AP': 'Tirs au but',
    // Cricket innings
    '1H': '1ère manche (dom.)', '1A': '1ère manche (ext.)',
    '2H': '2ème manche (dom.)', '2A': '2ème manche (ext.)', 'SO': 'Super Over',
    // Tennis sets
    'S1': '1er set', 'S2': '2e set', 'S3': '3e set', 'S4': '4e set', 'S5': '5e set',
    // Other / generic
    'NS': 'À venir', 'INT': 'Interrompu', 'CAN': 'Annulé', 'AB': 'Abandonné',
  };

  // ── Expose globally ───────────────────────────────────────────────────────
  window.PolymarketService = {
    SPORT_SERIES,
    SERIES_NAMES,
    getLivescoreForSport,
    getMatchEvents,
    getEventBySlug,
    getMarket,
    formatVolume,
    detectSport,
    startPolling,
    stopPolling,
    getSubEvents,
    SportsWS,
    PERIOD_LABELS,
  };

  console.log('[PolymarketService] Ready — match-level livescore via series_id + WS live scores');
})();
