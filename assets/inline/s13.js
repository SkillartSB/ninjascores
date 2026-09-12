// Tennis — alimentation du calendrier (etape 1 du chantier tennis, 12/09/2026).
//
// Le bundle a deja un mode tennis dans le calendrier (activeSport === 'tennis')
// qui attend window.NinjaTennisAPI.fetchComps(dateSel) -> [{competition:'ATP'|'WTA',
// matches:[{homeTeam:'<Tournoi>: <Joueur 1>', awayTeam, apiScore:
// '6-3,3-6', status:'upcoming'|'live'|'ended', apiPeriod, apiTier, startDate, slug}]}].
// C'est un prototype de juillet : on le nourrit tel quel ici, on le remplacera par
// un rendu propre (drapeaux, photos, point par point) a l'etape 3.
//
// Donnees : /api/tennis/ (proxy + cache Redis, cle serveur) et
// /data/tennis-tournois.json (categorie, rang, surface, pays — API-Tennis ne
// donne pas le pays des tournois).
(function () {
  var CIRCUITS = { 'Atp Singles': 'ATP', 'Wta Singles': 'WTA', 'Challenger Men Singles': 'ATP', 'Challenger Women Singles': 'WTA' };
  var TIER = { GS: 1, FINALS: 1, OLY: 1, M1000: 2, '500': 3, TEAM: 3, '250': 4, CH: 5 };
  var SURFACE = { 'Hard': 'dur', 'Hard (Indoor)': 'dur indoor', 'Clay': 'terre battue', 'Grass': 'gazon', 'Carpet': 'moquette', 'Carpet (Indoor)': 'moquette' };
  var PAYS = { FR: 'France', ES: 'Espagne', IT: 'Italie', DE: 'Allemagne', GB: 'Royaume-Uni', US: 'États-Unis', AU: 'Australie', CA: 'Canada', CN: 'Chine', JP: 'Japon', MC: 'Monaco', CH: 'Suisse', AT: 'Autriche', NL: 'Pays-Bas', BE: 'Belgique', SE: 'Suède', NO: 'Norvège', DK: 'Danemark', FI: 'Finlande', PT: 'Portugal', MX: 'Mexique', BR: 'Brésil', AR: 'Argentine', CL: 'Chili', CO: 'Colombie', UY: 'Uruguay', EC: 'Équateur', QA: 'Qatar', AE: 'Émirats', SA: 'Arabie saoudite', KZ: 'Kazakhstan', UZ: 'Ouzbékistan', RU: 'Russie', TR: 'Turquie', GR: 'Grèce', RO: 'Roumanie', HU: 'Hongrie', PL: 'Pologne', CZ: 'Tchéquie', SK: 'Slovaquie', SI: 'Slovénie', HR: 'Croatie', RS: 'Serbie', BA: 'Bosnie', BG: 'Bulgarie', EE: 'Estonie', LV: 'Lettonie', LU: 'Luxembourg', MA: 'Maroc', TN: 'Tunisie', EG: 'Égypte', ZA: 'Afrique du Sud', IL: 'Israël', IN: 'Inde', TH: 'Thaïlande', VN: 'Viêt Nam', ID: 'Indonésie', MY: 'Malaisie', SG: 'Singapour', KR: 'Corée du Sud', TW: 'Taïwan', HK: 'Hong Kong', NZ: 'Nouvelle-Zélande', PR: 'Porto Rico', BM: 'Bermudes', AZ: 'Azerbaïdjan', SM: 'Saint-Marin' };

  var tournoisP = null;
  function tournois() {
    if (tournoisP) return tournoisP;
    tournoisP = fetch('/data/tennis-tournois.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
    return tournoisP;
  }

  // 'today' | 'live' | 'YYYY-MM-DD' | offset numerique -> [date UTC, live?]
  function dateDe(sel) {
    var tz = window._NS_TZ || 'Europe/Paris';
    var auj = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    if (sel === 'live') return [auj, true];
    if (typeof sel === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sel)) return [sel, false];
    // Le bandeau du calendrier emet 'today', 'live' ou 'd<offset>' ('d-1', 'd2').
    var n = (typeof sel === 'number') ? sel : (sel && /^d?-?\d+$/.test(String(sel)) ? parseInt(String(sel).replace(/^d/, ''), 10) : 0);
    if (!n) return [auj, false];
    var d = new Date(auj + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return [d.toISOString().slice(0, 10), false];
  }

  function api(qs) {
    return fetch('/api/tennis/?' + qs).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.result) || []; }).catch(function () { return []; });
  }

  function scoreDe(x) {
    var sets = (x.scores || []).map(function (s) {
      var a = s.score_first, b = s.score_second;
      if (a == null || b == null || a === '' || b === '') return null;
      return a + '-' + b;
    }).filter(Boolean);
    return sets.join(',');
  }

  function statutDe(x) {
    var st = String(x.event_status || '');
    if (!st) return 'upcoming';
    if (/finished|retired|walkover|w\.?o\.?|cancel|abandon|postponed/i.test(st)) return 'ended';
    if (String(x.event_live) === '1' || /set|live|break|delay|interrupt/i.test(st)) return 'live';
    return 'upcoming';
  }

  function convertir(x, T) {
    var circuit = CIRCUITS[x.event_type_type];
    if (!circuit) return null;
    var t = T[String(x.tournament_key)] || {};
    var cat = t.cat || (/Challenger/.test(x.event_type_type) ? 'CH' : '250');
    var nom = String(x.tournament_name || 'Tournoi').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+-\s+Qualification.*$/i, '').trim();
    var paysNom = t.pays && PAYS[t.pays];
    var surf = SURFACE[t.surface] || null;
    // L'en-tete de groupe (renderTennisTournaments) est le nom seul ; pays et surface
    // sont affiches en sous-titre a partir de tennis{}.
    var entete = nom;
    var statut = statutDe(x);
    var heure = (x.event_time || '00:00');
    return {
      id: 'tn' + x.event_key, eventId: x.event_key, slug: 'tn' + x.event_key, sport: 'tennis',
      homeTeam: entete + ': ' + (x.event_first_player || '?'),
      awayTeam: x.event_second_player || '?',
      apiScore: scoreDe(x),
      apiPeriod: statut === 'live' ? (x.event_status + (x.event_game_result && x.event_game_result !== '-' ? ' · ' + x.event_game_result : '')) : undefined,
      apiTier: TIER[cat] || 4,
      startDate: x.event_date + 'T' + heure + ':00Z',
      status: statut,
      homePct: 0, awayPct: 0,
      competition: circuit,
      // Champs a nous, pour la fiche match (etape 3) : cles joueurs, photos, tour.
      tennis: {
        cle: x.event_key, tournoiCle: x.tournament_key, tournoi: nom, cat: cat, rang: t.rang || 5,
        surface: t.surface || null, surfaceFr: surf, pays: t.pays || null, paysNom: paysNom || null, tour: x.tournament_round || null,
        j1: { cle: x.first_player_key, nom: x.event_first_player, photo: x.event_first_player_logo || null },
        j2: { cle: x.second_player_key, nom: x.event_second_player, photo: x.event_second_player_logo || null },
        serveur: x.event_serve || null, jeu: x.event_game_result || null, statutBrut: x.event_status || ''
      }
    };
  }

  // ── Sport courant, global a l'app (12/09/2026) ──────────────────────────
  // Choisi dans le header de l'accueil (NS_SelecteurSport) ou dans le calendrier.
  // Memorise (localStorage ns_sport), lien profond ?sport=tennis, et expose via
  // window._ninjaScheduleSport que ScheduleScreen lit a l'initialisation.
  var SPORTS = [
    { id: 'football', emoji: '\u26bd', nom: 'Foot' },
    { id: 'tennis', emoji: '\ud83c\udfbe', nom: 'Tennis' }
  ];
  window.NS_SPORT = (function () {
    var abonnes = [];
    var courant = 'football';
    try {
      var m = /[?&]sport=(football|tennis)\b/.exec(location.search);
      if (m) courant = m[1];
      else { var mem = localStorage.getItem('ns_sport'); if (mem === 'tennis' || mem === 'football') courant = mem; }
    } catch (e) {}
    window._ninjaScheduleSport = courant;
    return {
      liste: SPORTS,
      get: function () { return courant; },
      info: function (id) { return SPORTS.filter(function (x) { return x.id === (id || courant); })[0] || SPORTS[0]; },
      set: function (id) {
        if (!SPORTS.some(function (x) { return x.id === id; }) || id === courant) return;
        courant = id; window._ninjaScheduleSport = id;
        try { localStorage.setItem('ns_sport', id); } catch (e) {}
        abonnes.slice().forEach(function (f) { try { f(id); } catch (e) {} });
      },
      abonner: function (f) { abonnes.push(f); return function () { abonnes = abonnes.filter(function (x) { return x !== f; }); }; }
    };
  })();

  // Pilule « ⚽ Foot ▾ » + liste deroulante (Foot / Tennis). Props : t, accent, compact.
  // Choisir Tennis ouvre le calendrier (l'accueil n'a pas encore de contenu tennis).
  window.NS_SelecteurSport = function (props) {
    var R = window.React; if (!R) return null;
    var t = props.t || {}, accent = props.accent || '#6D28D9';
    var st = R.useState(false), ouvert = st[0], setOuvert = st[1];
    var sv = R.useState(window.NS_SPORT.get()), sport = sv[0], setSport = sv[1];
    R.useEffect(function () { return window.NS_SPORT.abonner(setSport); }, []);
    R.useEffect(function () {
      if (!ouvert) return;
      var f = function () { setOuvert(false); };
      setTimeout(function () { document.addEventListener('click', f); }, 0);
      return function () { document.removeEventListener('click', f); };
    }, [ouvert]);
    var info = window.NS_SPORT.info(sport);
    var choisir = function (id) {
      setOuvert(false);
      window.NS_SPORT.set(id);
      if (id === 'tennis') {
        try { window.__nsNav && window.__nsNav('schedule'); } catch (e) {}
        try { window.NS_ROUTE && window.NS_ROUTE.ecran && window.NS_ROUTE.ecran('schedule'); } catch (e) {}
      }
    };
    return R.createElement('div', { style: { position: 'relative', flexShrink: 0 } },
      R.createElement('button', {
        type: 'button', 'aria-label': 'Choisir le sport', 'aria-expanded': ouvert,
        onClick: function (e) { e.stopPropagation(); setOuvert(!ouvert); },
        style: { height: 36, padding: props.compact ? '0 10px' : '0 12px 0 10px', borderRadius: 18, border: '1px solid ' + (t.border || '#e5e7eb'),
          background: t.card || '#fff', color: t.text || '#111', boxShadow: t.shadowCard, display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }
      },
        R.createElement('span', { style: { fontSize: 16, lineHeight: 1 } }, info.emoji),
        !props.compact && R.createElement('span', null, info.nom),
        R.createElement('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round',
          style: { transform: ouvert ? 'rotate(180deg)' : 'none', transition: 'transform .15s', opacity: .7 } },
          R.createElement('polyline', { points: '6 9 12 15 18 9' }))
      ),
      ouvert && R.createElement('div', { onClick: function (e) { e.stopPropagation(); },
        style: { position: 'absolute', top: 42, left: 0, minWidth: 168, background: t.card || '#fff', border: '1px solid ' + (t.border || '#e5e7eb'),
          borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,.18)', padding: 6, zIndex: 60 } },
        R.createElement('div', { style: { fontSize: 10, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: t.textSec || '#6b7280', padding: '6px 10px 4px' } }, 'Choisir le sport'),
        SPORTS.map(function (sp) {
          var on = sp.id === sport;
          return R.createElement('button', { key: sp.id, type: 'button', onClick: function () { choisir(sp.id); },
            style: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', borderRadius: 10, border: 'none', textAlign: 'left',
              background: on ? accent : 'transparent', color: on ? '#fff' : (t.text || '#111'), fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' } },
            R.createElement('span', { style: { fontSize: 18, lineHeight: 1 } }, sp.emoji),
            R.createElement('span', { style: { flex: 1 } }, sp.nom),
            on && R.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' },
              R.createElement('polyline', { points: '20 6 9 17 4 12' })));
        })
      )
    );
  };

  window.NinjaTennisAPI = {
    fetchComps: function (sel) {
      var dl = dateDe(sel); var date = dl[0], live = dl[1];
      var appel = live ? api('method=get_livescore') : api('method=get_fixtures&date_start=' + date + '&date_stop=' + date);
      return Promise.all([appel, tournois()]).then(function (r) {
        var brut = r[0], T = r[1];
        var atp = [], wta = [];
        brut.forEach(function (x) {
          var m = convertir(x, T); if (!m) return;
          (m.competition === 'WTA' ? wta : atp).push(m);
        });
        var tri = function (a, b) { return (a.apiTier - b.apiTier) || String(a.startDate).localeCompare(String(b.startDate)); };
        atp.sort(tri); wta.sort(tri);
        return [{ competition: 'ATP', seriesId: null, matches: atp }, { competition: 'WTA', seriesId: null, matches: wta }].filter(function (c) { return c.matches.length; });
      });
    },
    dateDe: dateDe
  };
})();
