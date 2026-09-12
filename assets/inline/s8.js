
(function() {
  var TENNIS_API = '';  // Vercel serverless — même domaine

  // SportsWS score store: slug → wsScore object used by MatchDetailScreen
  var _scoreStore = {};

  // Returns only completed sets (excludes in-progress set for live matches)
  function completedSets(m) {
    var scores = m.scores || [];
    var done   = ['Finished','Retired','Walkover'].indexOf(m.event_status) >= 0;
    if (done) return scores;
    var mm = (m.event_status || '').match(/Set (\d)/);
    if (!mm) return [];
    var currentSetNum = parseInt(mm[1]);
    return scores.filter(function(s) { return parseInt(s.score_set) < currentSetNum; });
  }

  // "1-0" — no comma → list shows "1" / "0" via sc.split('-')
  function buildSetsWon(m) {
    var isLive = m.event_live === '1';
    var done   = ['Finished','Retired','Walkover'].indexOf(m.event_status) >= 0;
    if (!isLive && !done) return null;
    var p1SW = 0, p2SW = 0;
    completedSets(m).forEach(function(s) {
      var f = parseInt(s.score_first) || 0, sec = parseInt(s.score_second) || 0;
      if (f > sec) p1SW++; else if (sec > f) p2SW++;
    });
    return p1SW + '-' + p2SW;
  }

  // "6-3, 3-2" — ALL sets (incl. in-progress) → comma → _tsets → set grid in Stats tab
  function buildAllSetsStr(m) {
    var scores = m.scores || [];
    if (!scores.length) return null;
    return scores.map(function(s) {
      return (parseInt(s.score_first) || 0) + '-' + (parseInt(s.score_second) || 0);
    }).join(', ');
  }

  // "3:2" — game score in the CURRENT set (Flashscore subtitle: "Set 2 · 3:2")
  function buildCurrentSetGameScore(m) {
    if (m.event_live !== '1') return null;
    var mm = (m.event_status || '').match(/Set (\d)/);
    if (!mm) return null;
    var currentSetNum = parseInt(mm[1]);
    var scores = m.scores || [];
    for (var i = 0; i < scores.length; i++) {
      if (parseInt(scores[i].score_set) === currentSetNum) {
        return (parseInt(scores[i].score_first) || 0) + ':' + (parseInt(scores[i].score_second) || 0);
      }
    }
    return '0:0';
  }

  function toPeriodCode(eventStatus) {
    if (!eventStatus) return null;
    var m = eventStatus.match(/Set (\d)/);
    if (m) return 'S' + m[1];
    if (['Finished','Retired','Walkover'].indexOf(eventStatus) >= 0) return 'FT';
    return null;
  }

  function transformMatch(m) {
    var isLive = m.event_live === '1';
    var done   = ['Finished','Retired','Walkover'].indexOf(m.event_status) >= 0;
    var slug   = 'tennis_' + m.event_key;
    var apiScore, wsEntry;

    if (isLive) {
      var setsWon   = buildSetsWon(m);              // "1-0" → header + list
      var gameScore = buildCurrentSetGameScore(m);  // "3:2" → subtitle "Set 2 · 3:2"
      var setMatch  = (m.event_status || '').match(/Set (\d)/);
      var period    = setMatch ? 'Set ' + setMatch[1] : (m.event_status || 'En cours');
      // setsStr = ONLY completed sets → set grid shows no in-progress column
      var compSets  = completedSets(m);
      var setsStr   = compSets.length > 0 ? compSets.map(function(s) {
        return (parseInt(s.score_first) || 0) + '-' + (parseInt(s.score_second) || 0);
      }).join(', ') : null;
      apiScore = setsWon;
      wsEntry  = {
        score:   setsWon,                                // header split('-') → "1" "0"
        setsStr: setsStr,                                // _tsc → _tsets → per-set grid (completed only)
        pbp:     m.pointbypoint || [],                   // point-by-point data for Stats tab
        live:    true,
        period:  period,                                 // "Set 2"
        elapsed: gameScore ? '· ' + gameScore : null,   // "· 3:2"
      };
    } else if (done) {
      // Ended: comma format → _tsc → set grid in Stats/Aperçu tab
      var doneSets = m.scores || [];
      apiScore = doneSets.length > 0 ? doneSets.map(function(s) {
        return (parseInt(s.score_first) || 0) + '-' + (parseInt(s.score_second) || 0);
      }).join(', ') : null;
      // setsStr → _tsc in detail view; score = sets won e.g. "2-0" → header
      var p1W = doneSets.filter(function(s){ return parseInt(s.score_first) > parseInt(s.score_second); }).length;
      var p2W = doneSets.filter(function(s){ return parseInt(s.score_second) > parseInt(s.score_first); }).length;
      wsEntry  = { ended: true, period: 'FT', pbp: m.pointbypoint || [], setsStr: apiScore, score: p1W + '-' + p2W };
    } else {
      apiScore = null;
      wsEntry  = null;
    }

    if (wsEntry) _scoreStore[slug] = wsEntry;

    return {
      homeTeam:  m.tournament_name + ': ' + m.event_first_player + ' vs ' + m.event_second_player,
      awayTeam:  '',
      status:    isLive ? 'live' : (done ? 'ended' : 'upcoming'),
      startDate: new Date(m.event_date + 'T' + (m.event_time||'00:00') + ':00Z'),
      slug:      slug,
      eventId:   m.event_key,
      apiScore:  apiScore,
      apiLive:   isLive,
      apiEnded:  done,
      apiPeriod: toPeriodCode(m.event_status),
      apiPbp:    m.pointbypoint || [],                   // point-by-point passé au match detail
      apiTier:   tournamentPriority(m),                  // 1=GS, 2=M1000, 3=500, 4=250, 5=Challenger, 6=ITF
    };
  }

  // Augment SportsWS.getScore() — never broadcast → list uses m.apiScore directly
  function setupSportsWS() {
    var sws = window.PolymarketService.SportsWS;
    if (sws) {
      var _orig = sws.getScore.bind(sws);
      sws.getScore = function(slug) { return _scoreStore[slug] || _orig(slug); };
    } else {
      var _subs = [];
      window.PolymarketService.SportsWS = {
        connect:    function() {},
        disconnect: function() {},
        subscribe:  function(cb) {
          _subs.push(cb);
          return function() { var i = _subs.indexOf(cb); if (i >= 0) _subs.splice(i, 1); };
        },
        getScore:   function(slug) { return _scoreStore[slug] || null; },
      };
    }
  }

  function tournamentPriority(m) {
    var name = ((m.tournament_name || '') + ' ' + (m.event_type_type || '')).toLowerCase();
    // Grand Slams
    if (/roland|french open|wimbledon|us open|australian open/.test(name)) return 1;
    // Masters 1000 / WTA 1000
    if (/1000|masters(?! cup)|indian wells|miami|monte.carlo|madrid|rome|canada|cincinnati|shanghai|paris|beijing/.test(name)) return 2;
    // ATP/WTA 500
    if (/500|dubai|acapulco|rotterdam|hamburg|washington|tokyo|vienna|basle|basel/.test(name)) return 3;
    // ATP/WTA 250
    if (/250/.test(name)) return 4;
    // Challenger
    if (/challenger/.test(name)) return 5;
    // ITF
    if (/itf/.test(name)) return 6;
    return 4; // default: treat unknown as ATP/WTA 250
  }

  function fetchTennisForPolymarket() {
    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    var tomorrowStr = tomorrow.toISOString().slice(0, 10);
    return Promise.all([
      fetch('/api/tennis-livescore').then(function(r) { return r.json(); }),
      fetch('/api/tennis-fixtures').then(function(r) { return r.json(); }),
      fetch('/api/tennis-fixtures?date=' + tomorrowStr).then(function(r) { return r.json(); }).catch(function() { return []; })
    ]).then(function(res) {
      var live        = Array.isArray(res[0]) ? res[0] : [];
      var fixtures    = Array.isArray(res[1]) ? res[1] : [];
      var fixturesTom = Array.isArray(res[2]) ? res[2] : [];
      var liveKeys = {};
      live.forEach(function(m) { liveKeys[m.event_key] = true; });
      var allFixtures = fixtures.concat(fixturesTom);
      var all = live.concat(allFixtures.filter(function(m) { return !liveKeys[m.event_key]; }));
      // Remove ITF Men & Women (M15, M25, W15, W35, W75…) — trop de bruit
      all = all.filter(function(m) {
        var tt = (m.event_type_type || '').toLowerCase();
        return tt.indexOf('itf') !== 0;
      });

      // Sort by importance: Grand Slams first, then Masters 1000, 500, 250, Challenger, ITF
      // Live matches always before non-live within the same priority tier
      all.sort(function(a, b) {
        var pa = tournamentPriority(a), pb = tournamentPriority(b);
        if (pa !== pb) return pa - pb;
        var aLive = a.event_live === '1' ? 0 : 1;
        var bLive = b.event_live === '1' ? 0 : 1;
        return aLive - bLive;
      });

      var atp = [], wta = [];
      all.forEach(function(m) {
        var t = (m.event_type_type || '').toLowerCase();
        if (t.indexOf('wta') !== -1 || t.indexOf('women') !== -1) wta.push(m);
        else atp.push(m);
      });

      var result = [];
      if (atp.length) result.push({ competition: 'ATP', seriesId: null, matches: atp.map(transformMatch) });
      if (wta.length) result.push({ competition: 'WTA', seriesId: null, matches: wta.map(transformMatch) });
      return result;
    });
  }

  // Expose pour ScheduleScreen — accès direct sans passer par PolymarketService
  // 12/09/2026 : le calendrier tennis est desormais fourni par s13.js (API-Tennis via /api/tennis/, cache Redis).
  // L'ancien fournisseur (3 appels amont non caches par chargement) n'est plus expose.
  // window.NinjaTennisAPI = { fetchComps: fetchTennisForPolymarket };

  function patchWhenReady() {
    if (!window.PolymarketService) { setTimeout(patchWhenReady, 100); return; }
    setupSportsWS();
    var _orig = window.PolymarketService.getLivescoreForSport.bind(window.PolymarketService);
    window.PolymarketService.getLivescoreForSport = function(sport) {
      if (sport === 'tennis') return fetchTennisForPolymarket();
      return _orig(sport);
    };
  }

  patchWhenReady();
})();
