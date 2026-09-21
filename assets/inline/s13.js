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
      // Jeu decisif en cours ou joue : API-Tennis envoie « 6.1 » / « 6.4 »
      // (jeux.points du tie-break) -> « 6(1)-6(4) », format compris par le rendu.
      var tb = function (v) { return String(v).replace(/^(\d+)\.(\d+)$/, '$1($2)'); };
      return tb(a) + '-' + tb(b);
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
        cle: x.event_key, tournoiCle: x.tournament_key, tournoi: nom, cat: cat, circuit: circuit, rang: t.rang || 5, logo: t.logo || null,
        surface: t.surface || null, surfaceFr: surf, pays: t.pays || null, paysNom: paysNom || null, tour: x.tournament_round || null,
        j1: { cle: x.first_player_key, nom: x.event_first_player, photo: x.event_first_player_logo || null, pays: poserDrapeau(x.first_player_key, x.event_first_player) },
        j2: { cle: x.second_player_key, nom: x.event_second_player, photo: x.event_second_player_logo || null, pays: poserDrapeau(x.second_player_key, x.event_second_player) },
        serveur: x.event_serve || null, jeu: x.event_game_result || null, statutBrut: x.event_status || '',
        // Le vainqueur donne par le fournisseur : seul juge fiable sur un
        // abandon, ou le set entame fausse le compte des sets gagnes.
        vainqueur: x.event_winner || null, resultat: x.event_final_result || null
      }
    };
  }

  // ── Sport courant, global a l'app (12/09/2026) ──────────────────────────
  // Choisi dans le header de l'accueil (NS_SelecteurSport) ou dans le calendrier.
  // Memorise (localStorage ns_sport), lien profond ?sport=tennis, et expose via
  // window._ninjaScheduleSport que ScheduleScreen lit a l'initialisation.
  // Police emoji explicite : dans l'app iOS (WKWebView), 'Plus Jakarta Sans' declare
  // la plage U+0000-2FFF et affiche un « ? » a la place de U+26BD (ballon).
  var POLICE_EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  window.NS_POLICE_EMOJI = POLICE_EMOJI;
  var SPORTS = [
    { id: 'football', emoji: '\u26bd', nom: 'Foot' },
    { id: 'tennis', emoji: '\ud83c\udfbe', nom: 'Tennis' }
  ];
  window.NS_SPORT = (function () {
    var abonnes = [];
    var courant = 'football';
    try {
      var m = /[?&]sport=(football|tennis)\b/.exec(location.search);
      // Depuis le 21/09 le tennis a son adresse : /tennis/ ouvre le site en
      // mode tennis (partageable, indexable), et prime sur le dernier choix.
      if (m) courant = m[1];
      else if (/^\/tennis(\/|$)/.test(location.pathname)) courant = 'tennis';
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

  // Le titre de l'onglet suit le sport : le rendu serveur (api/seo.js) ne sert
  // que les robots, un visiteur en mode tennis avait « Resultats de foot en
  // direct » dans son onglet et dans ses favoris.
  (function () {
    var TENNIS = 'Tennis en direct — scores ATP et WTA, résultats et classements | NinjaScores';
    // Le titre foot est relu depuis le francais, pas depuis document.title :
    // i18n.js le traduit apres nous, on rendrait le titre francais a un
    // visiteur anglophone en revenant au foot.
    var FOOT = 'NinjaScores — Résultats de foot en direct, classements et pronostics';
    function majTitre(sp) {
      try {
        // Seules l'accueil et /tennis/ portent le sport : une fiche match ou
        // un article a son propre titre, on n'y touche pas.
        if (!/^\/(tennis\/?)?$/.test(location.pathname)) return;
        var fr = sp === 'tennis' ? TENNIS : FOOT;
        document.title = window.NS_T ? window.NS_T(fr) : fr;
      } catch (e) {}
    }
    majTitre(window.NS_SPORT.get());
    window.NS_SPORT.abonner(majTitre);
  })();

  // Pilule « ⚽ Foot ▾ » + liste deroulante (Foot / Tennis). Props : t, accent, compact.
  // Le choix pilote toute l'app (accueil, calendrier, pronostics, classements : voir s14.js).
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
      window.NS_SPORT.set(id); // l'accueil, le calendrier, les pronostics et les classements suivent
    };
    return R.createElement('div', { style: { position: 'relative', flexShrink: 0 } },
      R.createElement('button', {
        type: 'button', 'aria-label': 'Choisir le sport', 'aria-expanded': ouvert,
        onClick: function (e) { e.stopPropagation(); setOuvert(!ouvert); },
        style: { height: 36, padding: props.compact ? '0 10px' : '0 12px 0 10px', borderRadius: 18, border: '1px solid ' + (t.border || '#e5e7eb'),
          background: t.card || '#fff', color: t.text || '#111', boxShadow: t.shadowCard, display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }
      },
        R.createElement('span', { style: { fontSize: 16, lineHeight: 1, fontFamily: POLICE_EMOJI } }, info.emoji),
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
            R.createElement('span', { style: { fontSize: 18, lineHeight: 1, fontFamily: POLICE_EMOJI } }, sp.emoji),
            R.createElement('span', { style: { flex: 1 } }, sp.nom),
            on && R.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' },
              R.createElement('polyline', { points: '20 6 9 17 4 12' })));
        })
      )
    );
  };

  // Favoris (13/09/2026) : etat des matchs tennis suivis, meme forme que NS_FAV_LIVE (foot)
  // pour la carte « Match suivi » : status, homeScore/awayScore = sets gagnes, tennisPeriode.
  function setsGagnes(x) {
    var h = 0, a = 0;
    (x.scores || []).forEach(function (s) {
      var f = parseInt(s.score_first, 10), g = parseInt(s.score_second, 10);
      if (isNaN(f) || isNaN(g)) return;
      var fini = (Math.max(f, g) >= 6 && Math.abs(f - g) >= 2) || Math.max(f, g) === 7 || /\./.test(String(s.score_first) + String(s.score_second));
      if (!fini) return;
      if (f > g) h++; else if (g > f) a++;
    });
    return [h, a];
  }
  function entreeFavori(x) {
    var st = statutDe(x), sg = setsGagnes(x);
    return { sport: 'tennis', status: st, homeScore: sg[0], awayScore: sg[1], minute: null, apiScore: scoreDe(x),
      tennisPeriode: st === 'live' ? (x.event_status + (x.event_game_result && x.event_game_result !== '-' ? ' \u00b7 ' + x.event_game_result : '')) : null,
      homeTeam: x.event_first_player, awayTeam: x.event_second_player };
  }
  window.NS_FAV_LIVE_TENNIS = function (favoris) {
    return api('method=live').then(function (live) {
      var parCle = {}; (live || []).forEach(function (x) { parCle[String(x.event_key)] = x; });
      var out = {}, aFaire = [];
      (favoris || []).forEach(function (m) {
        var k = String(m.eventId || (m.tennis && m.tennis.cle) || '');
        if (!k) return;
        if (parCle[k]) { out[m.eventId] = entreeFavori(parCle[k]); return; }
        // Pas en direct : si le match a du commencer, on lit son etat (get_fixtures, cache 5 min).
        var debut = m.startDate ? new Date(m.startDate).getTime() : 0;
        if (debut && Date.now() > debut - 5 * 60000) aFaire.push([m, k]);
      });
      return Promise.all(aFaire.map(function (p) {
        return api('method=get_fixtures&match_key=' + p[1]).then(function (r) { if (r && r[0]) out[p[0].eventId] = entreeFavori(r[0]); });
      })).then(function () { return out; });
    });
  };

  // Drapeaux des joueurs (13/09/2026) : le calendrier n'en avait que pour ~200 noms codes en dur.
  // Les classements ATP/WTA (2 300 joueurs chacun, cache CDN 6 h) donnent le pays de chacun ;
  // on expose window.NS_TENNIS_DRAPEAUX[nom affiche] = drapeau, lu par le rendu du calendrier.
  var PAYS_ISO_EN = { 'Italy': 'IT', 'Spain': 'ES', 'Germany': 'DE', 'Serbia': 'RS', 'USA': 'US', 'United States': 'US', 'Russia': 'RU', 'Norway': 'NO', 'Denmark': 'DK', 'Greece': 'GR', 'Poland': 'PL', 'Australia': 'AU', 'Canada': 'CA', 'France': 'FR', 'Great Britain': 'GB', 'United Kingdom': 'GB', 'Czech Republic': 'CZ', 'Czechia': 'CZ', 'Kazakhstan': 'KZ', 'Argentina': 'AR', 'Chile': 'CL', 'Brazil': 'BR', 'Japan': 'JP', 'China': 'CN', 'Netherlands': 'NL', 'Belgium': 'BE', 'Switzerland': 'CH', 'Austria': 'AT', 'Croatia': 'HR', 'Bulgaria': 'BG', 'Hungary': 'HU', 'Romania': 'RO', 'Ukraine': 'UA', 'Belarus': 'BY', 'Latvia': 'LV', 'Estonia': 'EE', 'Lithuania': 'LT', 'Finland': 'FI', 'Sweden': 'SE', 'Portugal': 'PT', 'Slovakia': 'SK', 'Slovenia': 'SI', 'Bosnia and Herzegovina': 'BA', 'Georgia': 'GE', 'Turkey': 'TR', 'Tunisia': 'TN', 'Egypt': 'EG', 'South Africa': 'ZA', 'India': 'IN', 'Colombia': 'CO', 'Peru': 'PE', 'Mexico': 'MX', 'Ecuador': 'EC', 'Uruguay': 'UY', 'Bolivia': 'BO', 'Venezuela': 'VE', 'Korea, Republic of': 'KR', 'South Korea': 'KR', 'Taiwan': 'TW', 'Chinese Taipei': 'TW', 'Thailand': 'TH', 'Indonesia': 'ID', 'Israel': 'IL', 'Moldova': 'MD', 'Cyprus': 'CY', 'Monaco': 'MC', 'Luxembourg': 'LU', 'Ireland': 'IE', 'New Zealand': 'NZ', 'Uzbekistan': 'UZ', 'Armenia': 'AM', 'Azerbaijan': 'AZ', 'Dominican Republic': 'DO', 'Puerto Rico': 'PR', 'Morocco': 'MA', 'Philippines': 'PH', 'Hong Kong': 'HK', 'Malaysia': 'MY', 'Pakistan': 'PK', 'Zimbabwe': 'ZW', 'Nigeria': 'NG', 'Kenya': 'KE', 'Paraguay': 'PY', 'Costa Rica': 'CR', 'Guatemala': 'GT', 'Jamaica': 'JM', 'Barbados': 'BB', 'Vietnam': 'VN', 'Montenegro': 'ME', 'North Macedonia': 'MK', 'Albania': 'AL', 'Kosovo': 'XK', 'Liechtenstein': 'LI', 'Andorra': 'AD', 'Burundi': 'BI', 'Ivory Coast': 'CI', 'Jordan': 'JO', 'Malta': 'MT' };
  function drapeauISO(iso) { try { return String.fromCodePoint.apply(null, iso.toUpperCase().split('').map(function (c) { return 0x1F1E6 + c.charCodeAt(0) - 65; })); } catch (e) { return ''; } }
  var paysParCle = null, paysP = null;
  function paysJoueurs() {
    if (paysP) return paysP;
    paysP = Promise.all(['ATP', 'WTA'].map(function (c) { return api('method=get_standings&event_type=' + c); })).then(function (r) {
      var m = {};
      (r[0] || []).concat(r[1] || []).forEach(function (j) { var iso = PAYS_ISO_EN[j.country]; if (iso && j.player_key) m[String(j.player_key)] = iso; });
      paysParCle = m; return m;
    }).catch(function () { paysParCle = {}; return {}; });
    return paysP;
  }
  window.NS_TENNIS_DRAPEAUX = window.NS_TENNIS_DRAPEAUX || {};
  function poserDrapeau(cle, nom) {
    if (!paysParCle || !cle || !nom) return null;
    var iso = paysParCle[String(cle)]; if (!iso) return null;
    window.NS_TENNIS_DRAPEAUX[nom] = drapeauISO(iso);
    return iso;
  }

  window.NinjaTennisAPI = {
    fetchComps: function (sel) {
      var dl = dateDe(sel); var date = dl[0], live = dl[1];
      // Le direct vient de /api/tennis/?method=live (WebSocket -> Redis, 3 s de cache CDN).
      // Vue LIVE : uniquement ces matchs. Vue du jour : fixtures (5 min) + fusion du direct.
      var auj = dateDe('today')[0];
      var appel = live ? api('method=live') : api('method=get_fixtures&date_start=' + date + '&date_stop=' + date);
      var appelLive = (!live && date === auj) ? api('method=live') : Promise.resolve(null);
      // Cotes vainqueur du jour (une requete, cache 30 min) pour la colonne du calendrier.
      var appelCotes = window.NS_HIDE_ODDS ? Promise.resolve({}) : fetch('/api/tennis/?method=cotes-jour&date=' + date).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return (j && j.result) || {}; }).catch(function () { return {}; });
      return Promise.all([appel, tournois(), appelLive, paysJoueurs(), appelCotes]).then(function (r) {
        var brut = r[0], T = r[1], enDirect = r[2], cotes = r[4] || {};
        if (enDirect && enDirect.length) {
          var parCle = {}; enDirect.forEach(function (x) { parCle[String(x.event_key)] = x; });
          brut = brut.map(function (x) { var l = parCle[String(x.event_key)]; return l ? Object.assign({}, x, l) : x; });
        }
        var atp = [], wta = [];
        brut.forEach(function (x) {
          var m = convertir(x, T); if (!m) return;
          var c = cotes[String(x.event_key)]; if (c) { m.cote1 = c.c1; m.cote2 = c.c2; }
          (m.competition === 'WTA' ? wta : atp).push(m);
        });
        var tri = function (a, b) { return (a.apiTier - b.apiTier) || String(a.startDate).localeCompare(String(b.startDate)); };
        atp.sort(tri); wta.sort(tri);
        return [{ competition: 'ATP', seriesId: null, matches: atp }, { competition: 'WTA', seriesId: null, matches: wta }].filter(function (c) { return c.matches.length; });
      });
    },
    dateDe: dateDe,
    tournois: tournois,
    // Un match tennis par son identifiant (21/09/2026) : c'est ce qui manquait
    // pour ouvrir une fiche depuis une URL ou une notification — le repli de
    // NS_MATCH_PAR_ID (s6.js) passe par ici quand le foot ne connait pas l'id.
    parId: function (id) {
      return Promise.all([api('method=get_fixtures&match_key=' + id + '&detail=1'), tournois()])
        .then(function (r) {
          var x = (r[0] || [])[0];
          if (!x) return null;
          var m = convertir(x, r[1] || {});
          if (m) m.brut = x;
          return m;
        }).catch(function () { return null; });
    }
  };
  window.NS_MATCH_TENNIS_PAR_ID = function (id) { return window.NinjaTennisAPI.parId(id); };
})();
