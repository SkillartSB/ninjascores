
(function () {
  // Le fournisseur renvoie TOUS les matchs du monde pour une date : 2131 sur
  // sept jours, dont plus de la moitie sans interet ici (amicaux de
  // pre-saison, categories jeunes, feminin traite dans sa propre section).
  // On filtre donc a la reception plutot que d'inonder l'ecran.
  var JEUNES = /(\bu-?1[0-9]\b|\bu-?2[0-3]\b|youth|junior|primavera|junioren|aspirantes|jugend|sub-?2[0-3]|sub-?19|academy|cadet)/i;
  var FEMININ = /(women|femen|f[ée]minin|femminile|frauen|\bwsl\b|\bnwsl\b|damallsvenskan|feminina|kvinner|naisten)/i;
  var AMICAL = /(friendl|amistoso|amical|pre-?season|test match)/i;
  // Competitions ecartees a la demande, dont le libelle ne trahit pas la
  // nature : le COTIF est un tournoi de jeunes (U20) sans marqueur d'age.
  var ECARTEES = /(cotif)/i;

  var EN_COURS = { '1H': 1, '2H': 1, 'HT': 1, 'ET': 1, 'BT': 1, 'P': 1, 'LIVE': 1, 'INT': 1 };
  var TERMINE = { 'FT': 1, 'AET': 1, 'PEN': 1, 'WO': 1 };

  var cache = {};        // 'YYYY-MM-DD' | 'live'  ->  Promise

  function paysFr(nomApi) {
    try {
      var cle = window.NS_cleApi && window.NS_cleApi(nomApi);
      if (cle && window.NS_MANIFEST && window.NS_MANIFEST.pays[cle]) {
        return window.NS_MANIFEST.pays[cle].nom;
      }
    } catch (e) {}
    return nomApi;
  }

  function convertir(f) {
    var st = (f.fixture.status && f.fixture.status.short) || '';
    var live = !!EN_COURS[st], fini = !!TERMINE[st];
    var g = f.goals || {};
    return {
      slug: 'af' + f.fixture.id,
      eventId: f.fixture.id,
      startDate: f.fixture.date,
      homeTeam: f.teams.home.name,
      awayTeam: f.teams.away.name,
      homeLogo: f.teams.home.logo,
      awayLogo: f.teams.away.logo,
      // logo de la ligue fourni par l'API, indexe par identifiant : il ne peut
      // pas se tromper de pays. « Serie A » existe au Bresil ET en Italie ; sans
      // ce champ, l'entete resolvait par nom et sortait le logo italien.
      leagueLogo: f.league.logo,
      // ATTENTION : l'affichage deduit la cote de la probabilite (100/pct).
      // Mettre 50/50 par "neutralite" fabriquait donc une cote de 2.00 sur
      // tous les matchs, presentee comme reelle. A zero, aucune cote n'est
      // affichee -- tant qu'on n'aura pas branche /odds, mieux vaut rien.
      homePct: 0, awayPct: 0,
      status: live ? 'live' : (fini ? 'ended' : 'upcoming'),
      apiScore: (g.home != null && g.away != null) ? (g.home + '-' + g.away) : null,
      apiPeriod: st,
      apiEnded: fini,
      // l'affichage exige ces deux champs pour montrer le score en direct ;
      // sans eux il retombait sur "? - ?" avec une minute calculee depuis le
      // coup d'envoi (65' partout, 125' sur un match commence 2 h plus tot)
      apiLive: live,
      apiElapsed: (f.fixture.status && f.fixture.status.elapsed != null)
        ? String(f.fixture.status.elapsed) : null,
      minute: (f.fixture.status && f.fixture.status.elapsed) || null,
      venue: (f.fixture.venue && f.fixture.venue.name) || null,
      venueCity: (f.fixture.venue && f.fixture.venue.city) || null,
      // arbitre : deja dans la reponse fixtures, souvent vide avant-match
      referee: f.fixture.referee || null,
      round: f.league.round || null,
      homeId: f.teams.home.id, awayId: f.teams.away.id,
    };
  }

  // ── Tendances des 2 equipes sur leurs derniers matchs ────────────────────
  // Le bloc comparatif de l'onglet Pronostics etait alimente par NS_FORM, un
  // jeu de donnees en dur ne contenant QU'UNE cle ('wc2026-eng-arg', le match
  // de demonstration). Des que le calendrier a servi de vrais matchs, la
  // condition NS_FORM[match.id] n'a plus jamais ete satisfaite et le bloc a
  // disparu. On reconstruit ici la meme structure depuis le fournisseur.
  var TERMINES = { FT: 1, AET: 1, PEN: 1 };
  function codeCompet(nom) {
    var n = String(nom || '');
    if (/friendl/i.test(n)) return 'AMI';
    if (/qualif/i.test(n)) return 'ELIM';
    if (/world cup|coupe du monde/i.test(n)) return 'CDM';
    if (/champions/i.test(n)) return 'LDC';
    if (/europa|conference/i.test(n)) return 'UEFA';
    if (/\bcup\b|coupe|copa/i.test(n)) return 'COUPE';
    var mots = n.replace(/[^A-Za-zÀ-ÿ ]/g, ' ').split(/\s+/).filter(Boolean);
    if (mots.length >= 2) return (mots[0][0] + mots[1][0] + (mots[2] ? mots[2][0] : '')).toUpperCase();
    return n.slice(0, 4).toUpperCase();
  }
  function formeEquipe(id, n) {
    return reponse('path=fixtures&team=' + id + '&last=' + (n || 20)).then(function (fx) {
      return fx.filter(function (f) { return TERMINES[f.fixture.status.short]; })
        .map(function (f) {
          var dom = f.teams.home.id === id;
          var g = f.goals, h = (f.score && f.score.halftime) || {};
          var d = new Date(f.fixture.date);
          return {
            d: String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0')
               + '.' + String(d.getFullYear()).slice(2),
            cp: codeCompet(f.league.name),
            opp: (window.displayTeamName || String)(dom ? f.teams.away.name : f.teams.home.name),
            dom: dom ? 1 : 0,
            gf: (dom ? g.home : g.away) || 0, ga: (dom ? g.away : g.home) || 0,
            hf: (dom ? h.home : h.away) || 0, ha: (dom ? h.away : h.home) || 0,
          };
        });
    }).catch(function () { return []; });
  }
  var cacheForme = {};
  window.NS_FORME = function (idA, idB, nomA, nomB) {
    if (!idA || !idB) return Promise.resolve(null);
    var k = idA + '-' + idB;
    if (cacheForme[k]) return cacheForme[k];
    var p = Promise.all([formeEquipe(idA, 20), formeEquipe(idB, 20)]).then(function (r) {
      // le comparatif exige autant de matchs de chaque cote. On plafonne a 10 :
      // au-dela on melange des periodes trop anciennes (mercato, changement
      // d'entraineur) et la « tendance en cours » n'en est plus une.
      if (r[0].length < 5 || r[1].length < 5) return null;
      var n = Math.min(r[0].length, r[1].length, 10);
      return { teams: [nomA, nomB], A: r[0].slice(0, n), B: r[1].slice(0, n) };
    }).catch(function () { return null; });
    cacheForme[k] = p;
    // Echec ou vide : on ne memorise pas, la prochaine visite retentera.
    p.then(function (r) { if (!r) delete cacheForme[k]; }, function () { delete cacheForme[k]; });
    return p;
  };

  // Le fournisseur nomme tout en anglais. On traduit ce qui a un nom francais
  // etabli, et RIEN d'autre : "Premier League", "Serie A" ou "Eredivisie" sont
  // les noms d'usage en francais aussi, les traduire serait une faute.
  var TRAD_COMPET = {
    'UEFA Champions League': 'Ligue des Champions',
    'Friendlies': 'Match amical',
    'Friendlies Clubs': 'Match amical',
    'Euro Championship - Qualification': 'Éliminatoires Euro',
    'Euro Championship - Qualifications': 'Éliminatoires Euro',
    'UEFA Europa League': 'Ligue Europa',
    'UEFA Europa Conference League': 'Ligue Conférence',
    'UEFA Super Cup': "Supercoupe d'Europe",
    'UEFA Nations League': 'Ligue des Nations',
    'Euro Championship': "Championnat d'Europe",
    'World Cup': 'Coupe du monde',
    'FIFA Club World Cup': 'Coupe du monde des clubs',
    'Africa Cup of Nations': "Coupe d'Afrique des nations",
    'CAF Champions League': 'Ligue des Champions de la CAF',
    'CAF Confederation Cup': 'Coupe de la Confédération',
    'CONMEBOL Libertadores': 'Copa Libertadores',
    'CONMEBOL Sudamericana': 'Copa Sudamericana',
    'CONCACAF Champions League': 'Ligue des Champions de la CONCACAF',
    'CONCACAF Gold Cup': "Gold Cup",
    'CONCACAF Nations League': 'Ligue des Nations de la CONCACAF',
    'AFC Champions League Elite': "Ligue des Champions de l'AFC",
    'AFC Champions League Two': "Coupe de l'AFC",
    'Asian Cup': "Coupe d'Asie des nations",
    'Gulf Cup of Nations': 'Coupe du Golfe',
    'Arab Club Champions Cup': 'Coupe arabe des clubs champions',
  };
  function traduire(nom) {
    var n = String(nom || '');
    if (TRAD_COMPET[n]) return TRAD_COMPET[n];
    // "World Cup - Qualification Europe" et ses six confederations
    var q = n.match(/^World Cup - Qualification (.+)$/);
    if (q) {
      var z = { Europe: 'Europe', Africa: 'Afrique', Asia: 'Asie',
                CONCACAF: 'CONCACAF', 'South America': 'Amérique du Sud',
                Oceania: 'Océanie' }[q[1]] || q[1];
      return 'Éliminatoires Coupe du monde · ' + z;
    }
    if (/^Cup$/i.test(n)) return 'Coupe';
    if (/^Super Cup$/i.test(n)) return 'Supercoupe';
    if (/^League Cup$/i.test(n)) return 'Coupe de la Ligue';
    return n;
  }
  window.NS_TRAD_COMPET = traduire;

  // Index complet des équipes (nom + logo + pays) pour la recherche et les
  // favoris — 6600+ clubs de tous les championnats. Chargé à la demande
  // (fichier séparé, pas dans le bundle) et mis en cache.
  window.NS_ensureTeamsIndex = (function () {
    var p = null;
    return function () {
      if (window.NS_TEAMS_INDEX) return Promise.resolve(window.NS_TEAMS_INDEX);
      if (p) return p;
      p = fetch('/data/teams-index.json?v=2')
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (a) { window.NS_TEAMS_INDEX = a || []; return window.NS_TEAMS_INDEX; })
        .catch(function () { window.NS_TEAMS_INDEX = []; return window.NS_TEAMS_INDEX; });
      return p;
    };
  })();
  // Préchargement différé (idle) : l'index est prêt pour la barre de recherche
  // du haut comme pour « Ajouter un favori », quel que soit le point d'entrée.
  try { (window.requestIdleCallback || function (f) { setTimeout(f, 1800); })(function () {
    if (window.NS_ensureTeamsIndex) window.NS_ensureTeamsIndex();
  }); } catch (e) {}

  // Effectif réel d'un club par team ID (data/team-squads.json, ~4500 clubs
  // tous championnats confondus — remplace le filtre par nom sur SEARCH_DATA,
  // qui ne couvrait que les ~922 clubs des grands championnats). Servi via
  // /api/team-squads (un seul club par appel, jamais le fichier entier),
  // caché CDN 24h côté serveur + en mémoire ici pour la session.
  var _squadCache = {};
  window.NS_TEAM_SQUAD = function (teamId) {
    if (!teamId) return Promise.resolve(null);
    if (_squadCache[teamId]) return _squadCache[teamId];
    var p = fetch('/api/team-squads?team=' + teamId)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.players && j.players.length) ? j : null; })
      .catch(function () { return null; });
    _squadCache[teamId] = p;
    return p;
  };

  // Traduction des sous-titres / groupes de classement (phases, poules,
  // conférences…) par motifs. Couvre les ~670 valeurs anglaises des données.
  // Apertura/Clausura conservés (noms de tournois). Les noms propres de
  // compétition (Premier League, Pro League…) restent inchangés.
  window.NS_TRAD_GROUPE = function (s) {
    if (!s) return s;
    var r = String(s);
    var rules = [
      [/Conference League Play-?off Group/gi, 'Barrages Ligue Conférence'],
      [/Copa Libertadores Play-?off/gi, 'Barrage Copa Libertadores'],
      [/CL\/EL Play-?offs?/gi, 'Barrages LDC/Ligue Europa'],
      [/Europa League Group/gi, 'Poule Ligue Europa'],
      [/Championship Round/gi, 'Tour du titre'],
      [/Championship Group/gi, 'Poule de titre'],
      [/Relegation Round/gi, 'Tour de relégation'],
      [/Relegation Group/gi, 'Poule de relégation'],
      [/Rel\.?\/Prom\.? Play-?offs?/gi, 'Barrages relégation/promotion'],
      [/Relegation\/Promotion/gi, 'Relégation/Promotion'],
      [/Promotion Play-?offs?/gi, 'Barrages de promotion'],
      [/Promotion Round/gi, 'Tour de promotion'],
      [/Promotion Group/gi, 'Poule de promotion'],
      [/Middle Play-?offs Group/gi, 'Poule de barrages intermédiaires'],
      [/Qualification Play-?off/gi, 'Barrage de qualification'],
      [/Qualifying Play-?off/gi, 'Barrage de qualification'],
      [/Qualifying Round/gi, 'Tour de qualification'],
      [/Regular Season/gi, 'Saison régulière'],
      [/Group Stage/gi, 'Phase de groupes'],
      [/Winners Stage/gi, 'Phase des vainqueurs'],
      [/Losers Stage/gi, 'Phase des perdants'],
      [/Main Round/gi, 'Tour principal'],
      [/Opening Bottom 6/gi, 'Ouverture — Bas 6'],
      [/Closing Bottom 6/gi, 'Clôture — Bas 6'],
      [/Opening Top 6/gi, 'Ouverture — Top 6'],
      [/Closing Top 6/gi, 'Clôture — Top 6'],
      [/Opening Round/gi, "Tour d'ouverture"],
      [/Closing Round/gi, 'Tour de clôture'],
      [/Lower Table Round/gi, 'Tour bas de tableau'],
      [/Upper Table Round/gi, 'Tour haut de tableau'],
      [/Placement Matches/gi, 'Matchs de classement'],
      [/Placement Round/gi, 'Tour de classement'],
      [/Intermediate Round/gi, 'Tour intermédiaire'],
      [/Hexagonal Final/gi, 'Hexagonal final'],
      [/Final Four/gi, 'Final Four'],
      [/Eastern Conference/gi, 'Conférence Est'],
      [/Western Conference/gi, 'Conférence Ouest'],
      [/\bConference\b/gi, 'Conférence'],
      [/Qualification Playoff/gi, 'Barrage de qualification'],
      [/Play-?offs?/gi, 'Barrages'],
      [/1st Phase/gi, '1re phase'], [/2nd Phase/gi, '2e phase'],
      [/1st Stage/gi, '1re phase'], [/2nd Stage/gi, '2e phase'], [/First Stage/gi, '1re phase'],
      [/1st Round/gi, '1er tour'], [/2nd Round/gi, '2e tour'],
      [/First Amateur Division/gi, 'Première Division Amateur'],
      [/First Division/gi, 'Première Division'], [/Second Division/gi, 'Deuxième Division'], [/Third Division/gi, 'Troisième Division'],
      [/1st Division/gi, '1re Division'], [/2nd Division/gi, '2e Division'],
      [/Torneo Intermedio/gi, 'Tournoi intermédiaire'],
      [/Torneo Competencia/gi, 'Tournoi de compétition'],
      [/Tabla Anual/gi, 'Classement annuel'],
      [/\bPromedios\b/gi, 'Moyennes'],
      [/Quadrangular/gi, 'Quadrangulaire'],
      [/\bGROUP\b/g, 'GROUPE'], [/\bGroup\b/gi, 'Groupe'],
      [/\bRegion\b/gi, 'Région'],
      [/\bEastern\b/gi, 'Est'], [/\bWestern\b/gi, 'Ouest'],
      [/\bNorthern\b/gi, 'Nord'], [/\bSouthern\b/gi, 'Sud'],
      [/Centre-East/gi, 'Centre-Est'],
      [/\bNorth\b/gi, 'Nord'], [/\bSouth\b/gi, 'Sud'],
      [/\bEast\b/gi, 'Est'], [/\bWest\b/gi, 'Ouest'],
      [/\bCentral\b/gi, 'Centre'],
      [/\bOpening\b/gi, 'Ouverture'], [/\bClosing\b/gi, 'Clôture'],
    ];
    rules.forEach(function (rl) { r = r.replace(rl[0], rl[1]); });
    return r.replace(/\s+/g, ' ').replace(/\s+:/g, ' :').trim();
  };

  // "2nd Qualifying Round" ne dit pas la meme chose que "Group Stage" : pour
  // une competition internationale, la phase est plus parlante que le mot
  // "International", qui ne distinguait pas un tour preliminaire d'une finale.
  function phase(round) {
    var r = String(round || '');
    if (/qualif/i.test(r)) return 'Qualification';
    if (/play-?off/i.test(r)) return 'Barrages';
    if (/group/i.test(r)) return 'Phase de groupes';
    if (/round of 64/i.test(r)) return '32es de finale';
    if (/round of 32/i.test(r)) return '16es de finale';
    if (/round of 16|1\/8/i.test(r)) return '8es de finale';
    if (/quarter/i.test(r)) return 'Quarts de finale';
    if (/semi/i.test(r)) return 'Demi-finales';
    if (/3rd place|third place/i.test(r)) return 'Petite finale';
    if (/final/i.test(r)) return 'Finale';
    return null;
  }

  // Ordre d'importance des competitions. Classe par IDENTIFIANT et non par
  // libelle : le tri precedent lisait des expressions anglaises et la
  // traduction en francais l'a rendu inoperant (la Ligue des champions
  // tombait en 999, tout en bas). Il confondait aussi "Premier League"
  // d'Angleterre et du Ghana, faute de tenir compte du pays.
  var RANG_COMPET = {
    2: 0, 3: 1, 848: 2, 531: 3, 15: 4,          // C1, C3, Conference, Supercoupe, Mondial des clubs
    13: 5, 11: 6, 12: 7, 20: 8, 17: 9, 16: 10,  // Libertadores, Sudamericana, CAF, AFC, CONCACAF
    1: 12, 4: 13, 6: 14, 9: 15, 7: 16, 5: 17,   // Mondial, Euro, CAN, Copa America, Asie, Nations
    29: 18, 30: 18, 31: 18, 32: 18, 33: 18, 34: 18, 37: 18, 960: 19, 36: 20, 22: 21,
    39: 25, 140: 26, 135: 27, 78: 28, 61: 29,   // les cinq grands championnats
    94: 30, 88: 31, 203: 32, 144: 33, 71: 34, 128: 35, 262: 36, 253: 37,
    307: 38, 98: 39, 292: 40, 179: 41,
    40: 46, 62: 47, 136: 48, 79: 49, 141: 50,   // deuxiemes divisions des grands pays
  };
  function rangCompet(f) {
    var id = f.league.id;
    if (RANG_COMPET[id] != null) return RANG_COMPET[id];
    var cle = null;
    try { cle = window.NS_cleApi && window.NS_cleApi(f.league.country); } catch (e) {}
    var info = cle && window.NS_MANIFEST && window.NS_MANIFEST.pays[cle];
    if (info && info.ordre) {
      var i = info.ordre.indexOf(f.league.name);
      if (i === 0) return 60;                    // premiere division d'un pays couvert
      if (i > 0) return 70 + Math.min(i, 8);     // divisions inferieures
    }
    return 90;                                   // coupes mineures, ligues regionales
  }

  function grouper(liste) {
    var par = {};
    liste.forEach(function (f) {
      var nom = f.league.name;
      if (AMICAL.test(nom) || JEUNES.test(nom) || FEMININ.test(nom) || ECARTEES.test(nom)) return;
      var intl = f.league.country === 'World';
      var cle = f.league.id + '|' + (intl ? (phase(f.league.round) || 'International') : '');
      if (!par[cle]) {
        par[cle] = {
          ligue: traduire(nom), ligueVo: nom,
          pays: intl ? (phase(f.league.round) || 'International') : paysFr(f.league.country),
          seriesId: f.league.id, season: f.league.season, rang: rangCompet(f),
          logo: f.league.logo, drapeau: f.league.flag,
          matches: [],
        };
      }
      par[cle].matches.push(convertir(f));
    });
    var out = Object.keys(par).map(function (k) { return par[k]; });
    out.forEach(function (c) {
      // le libelle doit rester unique : 28 pays ont une "Premier League"
      c.competition = c.ligue + ' · ' + c.pays;
      c.matches.sort(function (a, b) { return new Date(a.startDate) - new Date(b.startDate); });
    });
    return out;
  }

  function appel(params) {
    return fetch('/api/foot/?' + params)   // slash final : evite une redirection 308 par appel
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j || {}; })
      .catch(function () { return {}; });
  }
  function reponse(params) {
    return appel(params).then(function (j) { return j.response || []; });
  }

  // Cotes 1/N/2 d'une journee. L'endpoint pagine par 10 : une journee chargee
  // demande une douzaine d'appels, d'ou le chargement en parallele. On ne
  // fabrique jamais de cote : un match sans cote publiee n'en affichera pas.
  // ===== GEO : pays de l'utilisateur, cotes et affiliation localisees =====
  // Les URLS d'affiliation seront fournies par l'utilisateur ; tant qu'un
  // partenaire a url:null, aucun lien affilie n'est rendu pour lui (on ne
  // rabat jamais un logo partenaire sur les cotes d'un autre bookmaker).
  window.NS_PARTENAIRES = {
    winamax: { nom: 'Winamax', couleur: '#E2001A', url: 'https://winamax.fr' },
    // Lollybet n'a PAS d'agrement ANJ. Il est volontairement absent de la
    // liste `affil` : il ne doit apparaitre QUE sur les articles de
    // pronostics, ou api/pronostic.mjs l'injecte directement.
    lollybet: { nom: 'Lollybet', couleur: '#E8112D', url: 'https://www.lolly-bet888.com/?faff=423',
                logo: '/assets/logos/bookmakers/lollybet.png?v=1', logoBleed: true },
    melbet:  { nom: 'Melbet',  couleur: '#F2A900', url: 'https://refpa3665.com/L?tag=d_5755095m_66335c_&site=5755095&ad=66335', promo: 'NINJASCORES', bonus: '200% jusqu’à 130 000 FCFA', logo: '/assets/logos/bookmakers/melbet.png?v=1', logoBleed: true },
    win1:    { nom: '1WIN',    couleur: '#1E5EFF', url: 'https://one-vv2541.com/?open=register&p=qmd0', logo: '/assets/logos/bookmakers/win1.png?v=5', logoWhite: '/assets/logos/bookmakers/win1-white.png?v=3', promo: 'NINJASCORES', bonus: '500% jusqu’à 620 000 FCFA' },
    starz888:{ nom: '888Starz',couleur: '#E1222B', url: 'https://top100bonus.com/L?tag=d_5345199m_64133c_&site=5345199&ad=64133', promo: 'NINJASCORES', bonus: 'Jusqu’à 260 000 FCFA', logo: '/assets/logos/bookmakers/starz888.png?v=1', logoBleed: true }
  };
  // cotes = ordre de preference des bookmakers du flux (8=Bet365, 11=1xBet).
  // affil = partenaires par support ; mobile privilégie ceux presents sur
  // l'App Store (meilleure conversion), desktop le meilleur revshare.
  // Drapeaux ronds (SVG) — plus nets et cohérents que les emoji (qui
  // s'affichent en texte « FR » sur Windows/Chrome). Tricolores verticaux ;
  // id de clip unique par instance pour éviter les collisions.
  window.NS_FLAG = (function () {
    var n = 0;
    var BANDES = {
      FR: ['#0055A4', '#ffffff', '#EF4135'],
      CI: ['#F77F00', '#ffffff', '#009E60'],
      CM: ['#007A5E', '#CE1126', '#FCD116'],
      SN: ['#00853F', '#FDEF42', '#E31B23'],
      ML: ['#14B53A', '#FCD116', '#CE1126']
    };
    var ETOILE = { CM: '#FCD116', SN: '#00853F' };
    var PATH_ETOILE = 'M12 8.4l0.88 2.39 2.54 0.1-1.99 1.57 0.69 2.45L12 13.5l-2.12 1.41 0.69-2.45-1.99-1.57 2.54-0.1z';
    return function (code, taille) {
      var R = React.createElement, s = taille || 20;
      var id = 'nsfl' + (n++);
      var kids;
      if (code === 'CD') {
        // RD Congo : bleu ciel, bande diagonale rouge bordée de jaune, étoile jaune en haut à gauche.
        kids = [
          R('rect', { key: 'bg', width: 24, height: 24, fill: '#007FFF' }),
          R('line', { key: 'y', x1: -3, y1: 27, x2: 27, y2: -3, stroke: '#F7D618', strokeWidth: 7 }),
          R('line', { key: 'r', x1: -3, y1: 27, x2: 27, y2: -3, stroke: '#CE1021', strokeWidth: 3.8 }),
          R('path', { key: 'star', fill: '#F7D618',
            d: 'M6 3.2l0.68 1.87 1.98 0.06-1.57 1.22 0.56 1.92L6 9.15l-1.65 1.12 0.56-1.92-1.57-1.22 1.98-0.06z' })
        ];
      } else {
        var b = BANDES[code] || ['#c9c6d4', '#ded9e8', '#c9c6d4'];
        kids = [
          R('rect', { key: 0, width: 8, height: 24, fill: b[0] }),
          R('rect', { key: 1, x: 8, width: 8, height: 24, fill: b[1] }),
          R('rect', { key: 2, x: 16, width: 8, height: 24, fill: b[2] })
        ];
        if (ETOILE[code]) kids.push(R('path', { key: 's', d: PATH_ETOILE, fill: ETOILE[code] }));
      }
      return R('svg', { width: s, height: s, viewBox: '0 0 24 24', 'aria-hidden': 'true',
        style: { borderRadius: '50%', boxShadow: 'inset 0 0 0 1px rgba(20,18,28,0.12)', flexShrink: 0, display: 'block' } },
        R('defs', null, R('clipPath', { id: id }, R('circle', { cx: 12, cy: 12, r: 12 }))),
        R('g', { clipPath: 'url(#' + id + ')' }, kids));
    };
  })();

  // Badge de marque d'un bookmaker (nom sur sa couleur officielle, façon
  // logo). Couleur de texte auto selon la luminance du fond. Sert de logo
  // tant qu'on n'a pas les vrais fichiers dans assets/logos/bookmakers/.
  window.NS_BKLOGO = function (slug, h) {
    var R = React.createElement, s = h || 20;
    var p = (window.NS_PARTENAIRES && window.NS_PARTENAIRES[slug]) || { nom: slug, couleur: '#666' };
    if (p.logo && p.logoBleed) {
      // Logo avec son propre fond (sombre) : image directe, coins arrondis.
      return R('img', { src:p.logo, alt:p.nom, style:{ height:s, width:'auto',
        borderRadius:Math.round(s*0.24), display:'block' } });
    }
    if (p.logo) {
      // Logo wordmark transparent (1WIN) : aucune boîte/arrière-plan.
      // Version sombre en thème clair, blanche en thème sombre (window.ninjaDark).
      var _src = (window.ninjaDark && p.logoWhite) ? p.logoWhite : p.logo;
      return R('img', { src:_src, alt:p.nom, style:{ height:Math.round(s*0.9), width:'auto', display:'block' } });
    }
    var c = (p.couleur || '#666').replace('#', '');
    var lum = 0.299 * parseInt(c.substr(0,2),16) + 0.587 * parseInt(c.substr(2,2),16) + 0.114 * parseInt(c.substr(4,2),16);
    return R('span', { style: { display:'inline-flex', alignItems:'center', height:s,
      padding:'0 ' + Math.round(s*0.55) + 'px', borderRadius:s/2, background:p.couleur,
      color: lum > 150 ? '#14121c' : '#fff', fontSize:Math.round(s*0.6), fontWeight:800,
      letterSpacing:0.2, lineHeight:1, whiteSpace:'nowrap' } }, p.nom);
  };

  // Couleur de texte lisible sur un fond donné (luminance).
  window.NS_TXTON = function (hex) {
    var c = (hex || '#666').replace('#', '');
    var l = 0.299*parseInt(c.substr(0,2),16) + 0.587*parseInt(c.substr(2,2),16) + 0.114*parseInt(c.substr(4,2),16);
    return l > 150 ? '#14121c' : '#fff';
  };
  // Cartes « partenaires » (Pronostics) pour le pays actif hors France :
  // logo + CTA affilié réel. Aucun bonus inventé. Renvoie un tableau vide
  // si aucun partenaire n'a de lien -> rien ne s'affiche.
  window.NS_AFRICABK = function (t, accent) {
    var R = React.createElement, p = window.NS_GEO.actif();
    var order = (p.affil && p.affil.desktop) || [], seen = {}, out = [];
    order.forEach(function (slug) {
      if (seen[slug]) return; seen[slug] = 1;
      var bk = window.NS_PARTENAIRES[slug];
      if (!bk || !bk.url) return;
      out.push(R('div', { key: slug, style: { borderRadius: 14, background: t.card, border: '1px solid ' + t.border, overflow: 'hidden', flexShrink: 0 } },
        R('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid ' + t.border } },
          window.NS_BKLOGO(slug, 24),
          R('span', { style: { marginLeft: 'auto', fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: accent, background: accent + '18', padding: '3px 9px', borderRadius: 6 } }, 'PARTENAIRE')),
        R('div', { style: { padding: '12px 14px' } },
          R('div', { style: { fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: t.textTer, marginBottom: 4 } }, 'Offre de bienvenue'),
          R('div', { style: { fontSize: 19, fontWeight: 900, color: accent, lineHeight: 1.05, marginBottom: 12 } }, bk.bonus || 'Bonus de bienvenue'),
          R('a', { href: bk.url, target: '_blank', rel: 'noopener sponsored', style: { display: 'block', boxSizing: 'border-box', textAlign: 'center', width: '100%', background: bk.couleur, color: window.NS_TXTON(bk.couleur), fontWeight: 800, fontSize: 13, borderRadius: 10, padding: '11px', textDecoration: 'none' } }, 'D\u00e9couvrir l\u2019offre \u2192'))));
    });
    return out;
  };

  // Opérateurs pour la section Pronostics (bannières) selon le pays actif :
  // nom + couleur + lien (rendu texte, pas d'image, car les bannières sont
  // sur fond de couleur de marque). Utilisé hors France.
  window.NS_BKMS_GEO = function () {
    var pp = window.NS_GEO.actif();
    var order = (pp.affil && pp.affil.desktop) || [], seen = {}, out = [];
    order.forEach(function (s) {
      if (seen[s]) return; seen[s] = 1;
      var bk = window.NS_PARTENAIRES[s];
      if (bk && bk.url) out.push({ nom: bk.nom, url: bk.url, color: bk.couleur, logo: bk.logoWhite || bk.logo || null, w: 'auto', size: 22 });
    });
    return out.length ? out : [{ nom: '', url: '#', color: '#666' }];
  };

  // Opérateur africain n° k (cyclique) pour la section Cotes : logo réel si
  // disponible (sinon nom), offre = code promo, lien affilié.
  window.NS_OPI = function (k) {
    var pp = window.NS_GEO.actif();
    var order = (pp.affil && pp.affil.desktop) || [], seen = {}, list = [];
    order.forEach(function (s) {
      if (seen[s]) return; seen[s] = 1;
      var bk = window.NS_PARTENAIRES[s];
      if (bk && bk.url) list.push(bk);
    });
    if (!list.length) return { nom: '', url: '#', color: '#666', logo: null, offre: '' };
    var bk = list[k % list.length];
    return { nom: bk.nom, url: bk.url, color: bk.couleur, logo: bk.logo || null,
      offre: bk.bonus || 'Bonus de bienvenue' };
  };

  // Bandeau compact des bonus partenaires (logo + bonus en violet + CTA),
  // horizontal et scrollable. Affiché en haut des onglets Résumé/Cotes/
  // Pronostics hors France. Renvoie null si pas de partenaire.
  // Liste 'Bonus du moment' selon le pays actif : France -> NS_BOOKMAKERS
  // (opérateurs FR) ; pays africain -> partenaires (Melbet/1WIN/888Starz)
  // avec leur logo + bonus. Format compatible avec la carte existante.
  window.NS_BONUS_LIST = function () {
    var p = window.NS_GEO && window.NS_GEO.actif();
    if (!p || p.code === 'FR') return window.NS_BOOKMAKERS || [];
    var order = (p.affil && p.affil.desktop) || [], seen = {}, out = [];
    order.forEach(function (s) {
      if (seen[s]) return; seen[s] = 1;
      var bk = window.NS_PARTENAIRES[s];
      if (bk && bk.url) out.push({ slug: s, nom: bk.nom, couleur: bk.couleur,
        note: '', offre: bk.bonus || 'Bonus de bienvenue', url: bk.url, branded: true });
    });
    return out.length ? out : (window.NS_BOOKMAKERS || []);
  };

  window.NS_BONUS_STRIP = function (t, accent) {
    if (!window.NS_GEO) return null;
    var R = React.createElement, p = window.NS_GEO.actif();
    if (!p || p.code === 'FR') return null;
    var order = (p.affil && p.affil.desktop) || [], seen = {}, list = [];
    order.forEach(function (s) {
      if (seen[s]) return; seen[s] = 1;
      var bk = window.NS_PARTENAIRES[s];
      if (bk && bk.url) list.push([s, bk]);
    });
    if (!list.length) return null;
    return R('div', { style: { display:'flex', gap:10, overflowX:'auto', padding:'2px 0 6px',
      marginBottom:6, WebkitOverflowScrolling:'touch' } },
      list.map(function (pair) {
        var slug = pair[0], bk = pair[1];
        return R('a', { key:slug, href:bk.url, target:'_blank', rel:'noopener sponsored',
          style:{ flex:'0 0 auto', width:172, textDecoration:'none', background:t.card,
            border:'1px solid '+t.border, borderRadius:14, overflow:'hidden', display:'flex', flexDirection:'column' } },
          R('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'9px 11px', borderBottom:'1px solid '+t.border } },
            window.NS_BKLOGO(slug, 20),
            R('span', { style:{ fontSize:8, fontWeight:800, letterSpacing:0.5, color:accent,
              background:accent+'18', padding:'2px 6px', borderRadius:5 } }, 'BONUS')),
          R('div', { style:{ padding:'9px 11px' } },
            R('div', { style:{ fontSize:14, fontWeight:900, color:accent, lineHeight:1.1, marginBottom:9,
              minHeight:31 } }, bk.bonus || 'Bonus de bienvenue'),
            R('div', { style:{ background:bk.couleur, color:window.NS_TXTON(bk.couleur), fontWeight:800,
              fontSize:12, borderRadius:9, padding:'8px', textAlign:'center' } }, 'Voir l\u2019offre \u2192')));
      }));
  };

  window.NS_PAYS_GEO = [
    { code:'FR', nom:'France',         drapeau:'\uD83C\uDDEB\uD83C\uDDF7', tz:'Europe/Paris', cotes:[8,11,7,2,32,1],
      affil:{ mobile:['winamax'], desktop:['winamax'] } },
    { code:'CI', nom:"C\u00f4te d'Ivoire", drapeau:'\uD83C\uDDE8\uD83C\uDDEE', tz:'Africa/Abidjan', cotes:[11,8,7,2,32,1],
      affil:{ mobile:['win1','melbet','starz888'], desktop:['win1','melbet','starz888'] } },
    { code:'CM', nom:'Cameroun',       drapeau:'\uD83C\uDDE8\uD83C\uDDF2', tz:'Africa/Douala', cotes:[11,8,7,2,32,1],
      affil:{ mobile:['win1','melbet','starz888'], desktop:['win1','melbet','starz888'] } },
    { code:'SN', nom:'S\u00e9n\u00e9gal', drapeau:'\uD83C\uDDF8\uD83C\uDDF3', tz:'Africa/Dakar', cotes:[11,8,7,2,32,1],
      affil:{ mobile:['win1','melbet','starz888'], desktop:['win1','melbet','starz888'] } },
    { code:'CD', nom:'RD Congo', drapeau:'\uD83C\uDDE8\uD83C\uDDE9', tz:'Africa/Kinshasa', cotes:[11,8,7,2,32,1],
      affil:{ mobile:['win1','melbet','starz888'], desktop:['win1','melbet','starz888'] } },
    { code:'ML', nom:'Mali', drapeau:'\uD83C\uDDF2\uD83C\uDDF1', tz:'Africa/Bamako', cotes:[11,8,7,2,32,1],
      affil:{ mobile:['win1','melbet','starz888'], desktop:['win1','melbet','starz888'] } }
  ];
  window.NS_GEO = (function () {
    var CLE = 'ns_geo_pays', SRC = 'ns_geo_src';
    function trouver(code) {
      return window.NS_PAYS_GEO.filter(function (p) { return p.code === code; })[0] || null;
    }
    function actif() {
      var c = null;
      try { c = localStorage.getItem(CLE); } catch (e) {}
      return trouver(c) || window.NS_PAYS_GEO[0];
    }
    function set(code) {
      if (!trouver(code)) return;
      try { localStorage.setItem(CLE, code); localStorage.setItem(SRC, 'manual'); } catch (e) {}
      window.location.reload();
    }
    // Geodetection : au premier passage ET tant que l'utilisateur n'a pas
    // choisi manuellement, on suit l'IP (utile en voyage / VPN). Un choix
    // manuel dans le selecteur fige la preference (src='manual').
    var src = null, cur = null;
    try { src = localStorage.getItem(SRC); cur = localStorage.getItem(CLE); } catch (e) {}
    if (src !== 'manual') {
      fetch('/api/geo/').then(function (r) { return r.json(); }).then(function (j) {
        var c = j && j.pays && trouver(j.pays) ? j.pays : 'FR';
        var actuel = trouver(cur) ? cur : 'FR';
        if (c !== actuel) {
          try { localStorage.setItem(CLE, c); localStorage.setItem(SRC, 'auto'); } catch (e) {}
          window.location.reload();
        } else if (c !== cur) {
          try { localStorage.setItem(CLE, c); localStorage.setItem(SRC, 'auto'); } catch (e) {}
        }
      }).catch(function () {});
    }
    return { actif: actif, set: set, liste: window.NS_PAYS_GEO };
  })();
  // Partenaire d'affiliation actif : premier partenaire du pays (selon le
  // support) qui a une URL configurée ; alternance quotidienne s'il y en a
  // plusieurs. Renvoie null si aucun lien n'est encore fourni.
  window.NS_AFFIL = function () {
    var p = window.NS_GEO.actif();
    var mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    var noms = (p.affil && (mobile ? p.affil.mobile : p.affil.desktop)) || [];
    var dispo = noms.map(function (n) { return window.NS_PARTENAIRES[n]; })
      .filter(function (x) { return x && x.url; });
    if (!dispo.length) return null;
    return dispo[new Date().getDate() % dispo.length];
  };

  var PREFERES = [8, 11, 7, 2, 32, 1];   // Bet365, 1xBet, William Hill, Marathon, Betano, 10Bet

  function extraire(tout, par) {
    (tout || []).forEach(function (o) {
      if (!o || !o.fixture || par[o.fixture.id]) return;
      var bks = o.bookmakers || [];
      var choisi = null;
      var _prefs = (window.NS_GEO && NS_GEO.actif().cotes) || PREFERES;
      for (var i = 0; i < _prefs.length && !choisi; i++) {
        choisi = bks.filter(function (b) { return b.id === _prefs[i]; })[0] || null;
      }
      if (!choisi) choisi = bks[0];
      if (!choisi) return;
      var mw = (choisi.bets || []).filter(function (b) { return b.name === 'Match Winner'; })[0];
      if (!mw) return;
      var v = {};
      (mw.values || []).forEach(function (x) { v[x.value] = x.odd; });
      if (v.Home && v.Away) {
        par[o.fixture.id] = { c1: v.Home, cN: v.Draw || null, c2: v.Away, source: choisi.name };
      }
    });
    return par;
  }

  // n promesses au maximum en vol, pour ne pas ouvrir 40 connexions d'un coup
  function enFile(taches, largeur) {
    var i = 0, res = [];
    function suivant() {
      if (i >= taches.length) return Promise.resolve();
      var k = i++;
      return taches[k]().then(function (r) { res[k] = r; return suivant(); });
    }
    var fils = [];
    for (var f = 0; f < Math.min(largeur, taches.length); f++) fils.push(suivant());
    return Promise.all(fils).then(function () { return res; });
  }

  // Deux passes, parce que l'appel par date est INCOMPLET : le 22/07 il
  // ignorait 5 des 9 matchs de Ligue des champions et de Conference League,
  // alors qu'un appel cible sur le championnat les renvoyait tous.
  //   1. odds?date=      — pagine par 10, couvre l'essentiel en ~12 appels
  //   2. odds?date&league&season — rattrapage, seulement pour les championnats
  //      dont il reste au moins un match sans cote
  function cotesJour(cle, ligues) {
    return appel('path=odds&date=' + cle).then(function (j) {
      var par = {};
      extraire(j.response, par);
      var pages = (j.paging && j.paging.total) || 1;
      var suite = [];
      for (var p = 2; p <= Math.min(pages, 25); p++) {
        (function (n) {
          suite.push(function () { return reponse('path=odds&date=' + cle + '&page=' + n); });
        })(p);
      }
      return enFile(suite, 6).then(function (rest) {
        rest.forEach(function (r) { extraire(r, par); });
        var manquants = (ligues || []).filter(function (l) {
          return l.fixtures.some(function (id) { return !par[id]; });
        });
        if (!manquants.length) return par;
        var top = manquants.map(function (l) {
          return function () {
            return reponse('path=odds&date=' + cle + '&league=' + l.id + '&season=' + l.season);
          };
        });
        return enFile(top, 6).then(function (rs) {
          rs.forEach(function (r) { extraire(r, par); });
          return par;
        });
      });
    }).catch(function () { return {}; });
  }

  // Cotes detaillees d'UN match, pour la fiche ouverte. Une requete, a la
  // demande : la fiche affichait jusqu'ici des valeurs codees en dur
  // (Double chance 1.20/1.42/1.15 sur tous les matchs, sous logo Betsson).
  var cacheMatch = {};
  window.NS_COTES_MATCH = function (fixtureId) {
    if (!fixtureId) return Promise.resolve(null);
    if (cacheMatch[fixtureId]) return cacheMatch[fixtureId];
    var p = reponse('path=odds&fixture=' + fixtureId).then(function (r) {
      if (!r.length) return null;
      var bks = r[0].bookmakers || [];
      var choisi = null;
      var _prefs = (window.NS_GEO && NS_GEO.actif().cotes) || PREFERES;
      for (var i = 0; i < _prefs.length && !choisi; i++) {
        choisi = bks.filter(function (b) { return b.id === _prefs[i]; })[0] || null;
      }
      if (!choisi) choisi = bks[0];
      if (!choisi) return null;
      var pari = function (nom) {
        var b = (choisi.bets || []).filter(function (x) { return x.name === nom; })[0];
        if (!b) return null;
        var o = {};
        (b.values || []).forEach(function (v) { o[v.value] = v.odd; });
        return o;
      };
      return {
        bookmaker: choisi.name,
        mw: pari('Match Winner'),
        dc: pari('Double Chance'),
        fh: pari('First Half Winner'),
        btts: pari('Both Teams Score'),
        ou: pari('Goals Over/Under'),
        // marches par mi-temps : indispensables pour coter les tendances
        // « plus de 0,5 but » que le bloc Tendances met en avant
        ou1: pari('Goals Over/Under First Half'),
        ou2: pari('Goals Over/Under - Second Half'),
        exact: pari('Exact Score'),
      };
    }).catch(function () { return null; });
    cacheMatch[fixtureId] = p;
    // Echec ou vide : on ne memorise pas, la prochaine visite retentera.
    p.then(function (r) { if (!r) delete cacheMatch[fixtureId]; }, function () { delete cacheMatch[fixtureId]; });
    return p;
  };

  // ── Pronostics classes par force statistique ────────────────────────────
  // Philosophie : une petite cote ne vaut pas confiance. La note vient de la
  // frequence OBSERVEE sur les 10 derniers matchs des deux equipes, jamais du
  // marche. La cote ne sert qu'a mesurer la value, c'est-a-dire l'ecart entre
  // ce que la tendance annonce et ce que le bookmaker paie.
  function wilson(k, n) {
    if (!n) return 0;
    var z = 1.96, p = k / n, d = 1 + z * z / n;
    return Math.max(0, ((p + z * z / (2 * n)) - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d);
  }
  // Ratio direct arrondi au demi-point : 19/20 donne 9,5 et non 10. Arrondir a
  // l'entier faisait afficher 10/10 pour un pronostic rate une fois sur vingt.
  function note10(k, n) {
    return n ? Math.min(10, Math.max(1, Math.round((k * 20) / n) / 2)) : 1;
  }
  // Un seul sens par marche : on ne propose jamais « Plus de 2.5 » ET
  // « Moins de 2.5 », c'est la tendance qui tranche.
  var MARCHES = [
    { g:'ou25',  lbl:'Plus de 2.5 buts',  pred:'OUI', c:['ou','Over 2.5'],
      f:function(m){ return m.gf + m.ga > 2.5; } },
    { g:'ou25',  lbl:'Moins de 2.5 buts', pred:'NON', c:['ou','Under 2.5'],
      f:function(m){ return m.gf + m.ga < 2.5; } },
    { g:'ou15',  lbl:'Plus de 1.5 buts',  pred:'OUI', c:['ou','Over 1.5'],
      f:function(m){ return m.gf + m.ga > 1.5; } },
    { g:'btts',  lbl:'Les deux équipes marquent', pred:'OUI', c:['btts','Yes'],
      f:function(m){ return m.gf > 0 && m.ga > 0; } },
    { g:'btts',  lbl:'Les deux équipes marquent', pred:'NON', c:['btts','No'],
      f:function(m){ return !(m.gf > 0 && m.ga > 0); } },
    { g:'mt1',   lbl:'Plus de 0.5 but en 1re mi-temps', pred:'OUI', c:['ou1','Over 0.5'],
      f:function(m){ return m.hf + m.ha > 0.5; } },
    { g:'mt2',   lbl:'Plus de 0.5 but en 2e mi-temps',  pred:'OUI', c:['ou2','Over 0.5'],
      f:function(m){ return (m.gf + m.ga) - (m.hf + m.ha) > 0.5; } },
  ];

  window.NS_PRONOS = function (forme, cotes) {
    if (!forme || !forme.A || !forme.B || !forme.A.length || !forme.B.length) return null;
    var both = forme.A.concat(forme.B);
    var lire = function (ref) {
      var g = cotes && ref && cotes[ref[0]];
      var v = g ? parseFloat(g[ref[1]]) : NaN;
      return isFinite(v) && v > 1 ? v : null;
    };
    var ligne = function (lbl, pred, k, n, cote, src) {
      var p = n ? k / n : 0;
      return { label: lbl, pred: pred, k: k, n: n, pct: Math.round(100 * p),
               trust: note10(k, n), cote: cote, src: src,
               // esperance de gain d'une mise unitaire : positive = value
               ev: cote ? p * cote - 1 : null };
    };
    // Marches « de match » : chaque equipe apporte ses 10 rencontres, d'ou
    // 20 observations. Le libelle doit le dire, sinon « 17/20 sur les 10
    // derniers matchs » est incomprehensible.
    var srcDeux = '10 derniers matchs de chaque équipe';
    var out = MARCHES.map(function (M) {
      return ligne(M.lbl, M.pred, both.filter(M.f).length, both.length, lire(M.c), srcDeux);
    });
    MARCHES.forEach(function (M, i) { out[i].g = M.g; });

    // Double chance : propre a une equipe, donc calculee sur ses 10 matchs.
    [['1X', forme.A, ['dc','Home/Draw'], forme.teams && forme.teams[0]],
     ['X2', forme.B, ['dc','Draw/Away'], forme.teams && forme.teams[1]]]
      .forEach(function (d) {
        var L = d[1], k = L.filter(function (m) { return m.gf >= m.ga; }).length;
        var r = ligne('Double Chance', d[0], k, L.length, lire(d[2]),
                      '10 derniers matchs' + (d[3] ? ' de ' + d[3] : ''));
        r.g = 'dc'; out.push(r);
      });

    var vus = {};
    var retenus = out
      // La cote est l'element central de la carte : un marche que le
      // bookmaker ne propose pas n'a rien a y faire.
      .filter(function (p) { return p.cote; })
      .sort(function (a, b) {
        if (b.trust !== a.trust) return b.trust - a.trust;
        return (b.ev == null ? -9 : b.ev) - (a.ev == null ? -9 : a.ev);
      })
      .filter(function (p) { if (vus[p.g]) return false; vus[p.g] = 1; return true; })
      .slice(0, 4);
    // tableau vide = aucune cote exploitable : l'appelant retombe sur son
    // prono par defaut plutot que d'afficher un bloc vide
    return retenus.length ? retenus : null;
  };

  // ── Tableau d'une coupe, ou classement d'un championnat ──────────────────
  // Le fournisseur ne publie AUCUN tableau tout fait : on le reconstruit en
  // recuperant tous les matchs de la saison et en les regroupant par tour.
  // L'onglet de la fiche match affichait jusqu'ici un classement invente
  // ("Team 1", "Team 2", points fictifs).
  var RANGS = [
    [/preliminary/i, 5], [/1st qualifying/i, 10], [/2nd qualifying/i, 11],
    [/3rd qualifying/i, 12], [/qualif/i, 13], [/play-?off/i, 20],
    [/group/i, 30], [/round of 128/i, 40], [/round of 64/i, 41],
    [/round of 32/i, 42], [/round of 16|1\/8/i, 43], [/quarter/i, 50],
    [/semi/i, 60], [/3rd place|third place/i, 70], [/final/i, 80],
  ];
  function rang(r) {
    for (var i = 0; i < RANGS.length; i++) if (RANGS[i][0].test(r)) return RANGS[i][1];
    return 99;
  }
  var ELIM = /(qualif|play-?off|round of|quarter|semi|final|1\/8|preliminary)/i;
  function phaseDetail(r) {
    var m = String(r || '').match(/^(\d)(?:st|nd|rd|th)\s+qualifying/i);
    if (m) return m[1] + (m[1] === '1' ? 'er' : 'e') + ' tour de qualification';
    if (/preliminary/i.test(r)) return 'Tour préliminaire';
    return phase(r) || r;
  }

  // Competitions REELLES d'un club sur la saison en cours : championnat, coupe
  // nationale, coupe continentale. On interroge l'API plutot que de deduire le
  // pays d'un dataset statique — celui-ci ne couvre que quelques championnats
  // europeens, et laissait la fiche d'un club bresilien entierement vide.
  var cacheTeamCompets = {};
  window.NS_TEAM_COMPETS = function (teamId) {
    if (!teamId) return Promise.resolve([]);
    if (cacheTeamCompets[teamId]) return cacheTeamCompets[teamId];
    var p = reponse('path=leagues&team=' + teamId + '&current=true')
      .then(function (ls) {
        var out = [];
        (ls || []).forEach(function (x) {
          var lg = x.league || {}, ss = x.seasons || [];
          // `current=true` peut renvoyer plusieurs saisons : on garde la
          // derniere reellement marquee courante, sinon la plus recente.
          var cur = null;
          ss.forEach(function (s) { if (s.current) cur = s; });
          if (!cur && ss.length) cur = ss[ss.length - 1];
          if (!cur) return;
          out.push({
            id: lg.id,
            nom: (window.NS_TRAD_COMPET ? window.NS_TRAD_COMPET(lg.name || '') : (lg.name || '')),
            nomApi: lg.name || '',
            type: lg.type || '',                       // « League » ou « Cup »
            logo: lg.logo || '',
            pays: (x.country && x.country.name) || '',
            saison: cur.year,
          });
        });
        // Les amicaux ne sont pas une competition classable.
        out = out.filter(function (c) { return !/friendl|amical/i.test(c.nomApi); });
        // L'API traine des editions mortes depuis des annees (Coupe de la Ligue
        // 2019). On coupe, mais avec UNE saison de tolerance : les coupes ne
        // basculent pas en meme temps que les championnats — en aout 2026 la
        // Ligue 1 est en 2026 alors que la Coupe de France en est encore a
        // 2025, et un filtre strict la faisait disparaitre de la fiche.
        var maxSaison = out.reduce(function (m, c) { return Math.max(m, c.saison || 0); }, 0);
        out = out.filter(function (c) { return (c.saison || 0) >= maxSaison - 1; });
        // Championnat d'abord (c'est ce qu'on vient chercher en premier), puis
        // les coupes par ordre alphabetique pour un affichage stable.
        out.sort(function (a, b) {
          var la = a.type === 'League' ? 0 : 1, lb = b.type === 'League' ? 0 : 1;
          return la - lb || a.nom.localeCompare(b.nom, 'fr');
        });
        return out;
      })
      .catch(function () { return []; });
    cacheTeamCompets[teamId] = p;
    // Echec ou vide : on ne memorise pas, la prochaine visite retentera.
    p.then(function (r) { if (!r||!r.length) delete cacheTeamCompets[teamId]; }, function () { delete cacheTeamCompets[teamId]; });
    return p;
  };

  var cacheCompet = {};
  window.NS_COMPET = function (leagueId, season) {
    if (!leagueId || !season) return Promise.resolve(null);
    var k = leagueId + '/' + season;
    if (cacheCompet[k]) return cacheCompet[k];
    // C'est l'existence d'un CLASSEMENT qui distingue un championnat d'une
    // coupe, pas le nombre de tours a elimination : la Reserve League
    // argentine enchaine 18 journees PUIS des quarts et des demies, et se
    // retrouvait presentee comme une coupe alors qu'elle a un classement.
    var p = reponse('path=standings&league=' + leagueId + '&season=' + season)
      .then(function (st) {
        var g = st[0] && st[0].league && st[0].league.standings;
        if (g && g.length) return { type: 'classement', groupes: g };
        return reponse('path=fixtures&league=' + leagueId + '&season=' + season)
          .then(function (fx) {
        if (!fx.length) return null;
        var tours = {};
        fx.forEach(function (f) {
          var r = f.league.round || '';
          if (!ELIM.test(r)) return;
          (tours[r] = tours[r] || []).push(f);
        });
        var noms = Object.keys(tours);
        if (!noms.length) return null;
        noms.sort(function (a, b) { return rang(a) - rang(b) || a.localeCompare(b); });
        return {
          type: 'tableau',
          tours: noms.map(function (n) {
            return {
              // dans un tableau il faut distinguer les tours : les trois tours
              // preliminaires s'appelaient tous "Qualification"
              nom: phaseDetail(n),
              matches: tours[n].map(convertir).sort(function (a, b) {
                return new Date(a.startDate) - new Date(b.startDate);
              }),
            };
          }),
        };
          });                       // fin du repli sur les matchs (coupe)
      }).catch(function () { return null; });
    cacheCompet[k] = p;
    // Echec ou vide : on ne memorise pas, la prochaine visite retentera.
    p.then(function (r) { if (!r) delete cacheCompet[k]; }, function () { delete cacheCompet[k]; });
    return p;
  };

  // ── Top buteurs / passeurs d'une competition ──────────────────────────────
  // Presents sous CHAQUE classement (onglet Classement des pages match et des
  // pages equipe) — demande utilisateur du 30/08. Deux endpoints dedies cote
  // API, mis en cache 6 h par le proxy : le palmares ne bouge qu'apres les
  // matchs.
  var cacheTopJoueurs = {};
  window.NS_TOP_JOUEURS = function (leagueId, season) {
    if (!leagueId || !season) return Promise.resolve(null);
    var k = leagueId + '/' + season;
    if (cacheTopJoueurs[k]) return cacheTopJoueurs[k];
    function ligne(r) {
      var st = (r.statistics && r.statistics[0]) || {};
      return {
        nom: (r.player && r.player.name) || '',
        photo: (r.player && r.player.photo) || null,
        equipe: (st.team && st.team.name) || '',
        logo: (st.team && st.team.logo) || null,
        buts: (st.goals && st.goals.total) || 0,
        passes: (st.goals && st.goals.assists) || 0,
      };
    }
    var p = Promise.all([
      reponse('path=players/topscorers&league=' + leagueId + '&season=' + season),
      reponse('path=players/topassists&league=' + leagueId + '&season=' + season),
    ]).then(function (res) {
      var buteurs = (res[0] || []).slice(0, 10).map(ligne);
      var passeurs = (res[1] || []).slice(0, 10).map(ligne);
      if (!buteurs.length && !passeurs.length) return null;
      return { buteurs: buteurs, passeurs: passeurs };
    }).catch(function () { return null; });
    cacheTopJoueurs[k] = p;
    // Echec ou vide : on ne memorise pas, la prochaine visite retentera.
    p.then(function (r) { if (!r) delete cacheTopJoueurs[k]; }, function () { delete cacheTopJoueurs[k]; });
    return p;
  };

  // Composant React rendu par le bundle (voir les deux greffes « NS_TOP_BLOC »
  // dans app.compiled.js). Defini ICI pour rester dans un fichier editable :
  // le bundle ne porte qu'une ligne d'integration par ecran de classement.
  // React est global (assets/libs/react.production.min.js, charge avant s6).
  window.NS_TOP_BLOC = function (props) {
    var React = window.React;
    if (!React) return null;
    var t = props.t || {}, accent = props.accent || '#6133E0';
    var etat = React.useState(null), data = etat[0], setData = etat[1];
    var ongl = React.useState('buteurs'), mode = ongl[0], setMode = ongl[1];
    React.useEffect(function () {
      var vif = true;
      setData(null);
      if (window.NS_TOP_JOUEURS) {
        window.NS_TOP_JOUEURS(props.ligueId, props.saison).then(function (d) { if (vif) setData(d); });
      }
      return function () { vif = false; };
    }, [props.ligueId, props.saison]);
    // Pas de donnees (coupe a elimination, ligue exotique…) : la section
    // n'existe pas — plutot qu'un bloc vide.
    if (!data) return null;
    var liste = mode === 'buteurs' ? data.buteurs : data.passeurs;
    if (!liste.length) liste = mode === 'buteurs' ? data.passeurs : data.buteurs;
    var e = React.createElement;
    function pilule(cle, label) {
      var actif = mode === cle;
      return e('button', {
        key: cle,
        onClick: function () { setMode(cle); },
        style: { flex: 1, padding: '8px 0', border: 'none', borderRadius: 9, cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 12, fontWeight: 800,
          background: actif ? accent : 'transparent', color: actif ? '#fff' : (t.textSec || '#666') },
      }, label);
    }
    return e('div', { style: { marginTop: 16 } },
      e('div', { style: { display: 'flex', gap: 4, background: t.border || 'rgba(0,0,0,0.06)',
        borderRadius: 11, padding: 3, marginBottom: 10 } },
        pilule('buteurs', '⚽ Top buteurs'), pilule('passeurs', '🎯 Top passeurs')),
      e('div', { style: { background: t.card || '#fff', borderRadius: 12,
        border: '1px solid ' + (t.border || 'rgba(0,0,0,0.08)'), overflow: 'hidden' } },
        liste.map(function (j, i) {
          return e('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderBottom: i < liste.length - 1 ? '1px solid ' + (t.border || 'rgba(0,0,0,0.06)') : 'none' } },
            e('span', { style: { width: 18, fontSize: 12, fontWeight: 800,
              color: i < 3 ? accent : (t.textTer || '#999'), textAlign: 'center' } }, i + 1),
            j.photo ? e('img', { src: j.photo, alt: '', loading: 'lazy',
              style: { width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 } }) : null,
            e('div', { style: { flex: 1, minWidth: 0 } },
              e('div', { style: { fontSize: 12.5, fontWeight: 700, color: t.text || '#111',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, j.nom),
              e('div', { style: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 } },
                j.logo ? e('img', { src: j.logo, alt: '', loading: 'lazy', style: { width: 12, height: 12, objectFit: 'contain' } }) : null,
                e('span', { style: { fontSize: 10.5, color: t.textSec || '#777', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, j.equipe))),
            e('div', { style: { textAlign: 'right', flexShrink: 0 } },
              e('div', { style: { fontSize: 15, fontWeight: 900, color: accent, lineHeight: 1 } },
                mode === 'buteurs' ? j.buts : j.passes),
              e('div', { style: { fontSize: 9, fontWeight: 700, color: t.textTer || '#999',
                letterSpacing: 0.5, textTransform: 'uppercase' } },
                mode === 'buteurs' ? 'buts' : 'passes')));
        })));
  };

  // Confrontations directes entre deux clubs. Une seule requete, en cache :
  // l'onglet TaT affichait jusqu'ici des rencontres inventees (Arsenal,
  // Chelsea, Valencia) quels que soient les deux clubs concernes.
  var cacheH2H = {};
  window.NS_H2H = function (idA, idB) {
    if (!idA || !idB) return Promise.resolve(null);
    var k = idA + 'x' + idB;
    if (cacheH2H[k]) return cacheH2H[k];
    var p = reponse('path=fixtures/headtohead&h2h=' + idA + '-' + idB + '&last=20')
      .then(function (fx) {
        var out = fx.filter(function (f) { return TERMINES[f.fixture.status.short]; })
          .map(function (f) {
            var g = f.goals, dt = new Date(f.fixture.date);
            return {
              date: String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0')
                    + '/' + String(dt.getFullYear()).slice(2),
              h: f.teams.home.name, a: f.teams.away.name,
              hLogo: f.teams.home.logo, aLogo: f.teams.away.logo,
              hs: g.home, as_: g.away,
              hw: g.home > g.away, aw: g.away > g.home,
              comp: f.league.name, compLogo: f.league.logo,
              eventId: f.fixture.id, homeTeam: f.teams.home.name, awayTeam: f.teams.away.name,
            };
          });
        out.sort(function (x, y) { return 0; });
        return out;
      }).catch(function () { return []; });
    cacheH2H[k] = p;
    return p;
  };

  // Compositions. Officielle si publiee (~40-60 min avant le coup d'envoi,
  // et conservee apres le match), sinon "probable" = la compo de chaque
  // equipe lors de son dernier match joue. Jamais de compo inventee.
  var cacheLineup = {};
  window.NS_LINEUP = function (fixtureId, homeId, awayId) {
    if (!fixtureId) return Promise.resolve(null);
    var k = 'L' + fixtureId;
    if (cacheLineup[k]) return cacheLineup[k];
    function norm(t) {
      if (!t) return null;
      return {
        teamId: t.team && t.team.id, teamName: t.team && t.team.name,
        formation: t.formation || null, coach: (t.coach && t.coach.name) || null,
        startXI: (t.startXI || []).map(function (e) { var p = e.player || {}; return { id: p.id, num: p.number, name: p.name, pos: p.pos, grid: p.grid }; }),
        subs: (t.substitutes || []).map(function (e) { var p = e.player || {}; return { id: p.id, num: p.number, name: p.name, pos: p.pos }; }),
      };
    }
    function derniere(teamId) {
      if (!teamId) return Promise.resolve(null);
      return reponse('path=fixtures&team=' + teamId + '&last=1')
        .then(function (fx) {
          if (!fx || !fx[0]) return null;
          var fid = fx[0].fixture.id;
          return reponse('path=fixtures/lineups&fixture=' + fid + '&team=' + teamId)
            .then(function (ls) { return ls && ls[0] ? norm(ls[0]) : null; });
        }).catch(function () { return null; });
    }
    var byId = function (ls, id, fb) { for (var i = 0; i < ls.length; i++) { if (ls[i].team && ls[i].team.id === id) return ls[i]; } return ls[fb] || null; };
    var absents = function (teamId, list) {
      var seen = {}, out = [];
      (list || []).forEach(function (x) {
        if (!x.team || x.team.id !== teamId) return;
        var pl = x.player || {}, key = pl.id || pl.name;
        if (!key || seen[key]) return;
        seen[key] = 1;
        out.push({ id: pl.id, name: pl.name, reason: pl.reason || pl.type || '' });
      });
      return out;
    };
    var p = Promise.all([
      reponse('path=fixtures/lineups&fixture=' + fixtureId),
      reponse('path=injuries&fixture=' + fixtureId).catch(function () { return []; }),
    ]).then(function (res) {
      var ls = res[0] || [], bl = res[1] || [];
      var injH = absents(homeId, bl), injA = absents(awayId, bl);
      if (ls.length && ls[0].startXI && ls[0].startXI.length) {
        return { probable: false, home: norm(byId(ls, homeId, 0)), away: norm(byId(ls, awayId, 1)), injHome: injH, injAway: injA };
      }
      return Promise.all([derniere(homeId), derniere(awayId)]).then(function (r) {
        if (!r[0] && !r[1]) return null;
        return { probable: true, home: r[0], away: r[1], injHome: injH, injAway: injA };
      });
    }).catch(function () { return null; });
    cacheLineup[k] = p;
    // Echec ou vide : on ne memorise pas, la prochaine visite retentera.
    p.then(function (r) { if (!r) delete cacheLineup[k]; }, function () { delete cacheLineup[k]; });
    return p;
  };

  // Photo d'un joueur (API-Football). Fallback silencieux si absente.
  window.NS_PHOTO = function (id) {
    return id ? 'https://media.api-sports.io/football/players/' + id + '.png' : '';
  };

  // Photo d'une page joueur : le dataset (search_data) utilise des ids
  // Transfermarkt, pas API-Football. On retrouve la photo via une map
  // pre-calculee (data/player-photos.json), indexee par « nomdefamille|club ».
  // Chargement paresseux (700 Ko) : seulement a la 1re ouverture d'une fiche.
  (function () {
    function _nrm(s) {
      return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]/g, '');
    }
    function _last(n) {
      var t = (n || '').replace(/\./g, ' ').trim().split(/\s+/);
      return t.length ? _nrm(t[t.length - 1]) : '';
    }
    var _mapP = null;
    function _load() {
      if (!_mapP) _mapP = fetch('/data/player-photos.json?v=6')
        .then(function (r) { return r.ok ? r.json() : {}; })
        .catch(function () { return {}; });
      return _mapP;
    }
    window.NS_PLAYER_INFO = function (name, team) {
      return _load().then(function (map) { return map[_last(name) + '|' + _nrm(team)] || null; });
    };
    window.NS_PLAYER_PHOTO = function (name, team) {
      return window.NS_PLAYER_INFO(name, team).then(function (e) {
        return e ? (e.photo || (e.apiId ? window.NS_PHOTO(e.apiId) : null)) : null;
      });
    };
  })();

  // Historique de transferts d'un joueur (par id API-Football).
  var _trCache = {};
  window.NS_TRANSFERS = function (id) {
    if (!id) return Promise.resolve([]);
    if (_trCache[id]) return _trCache[id];
    var p = reponse('path=transfers&player=' + id).then(function (r) {
      if (!r || !r[0]) return [];
      var out = (r[0].transfers || []).map(function (t) {
        var tm = t.teams || {};
        return { date: t.date || '', type: t.type || '',
          outName: (tm.out || {}).name || '', outLogo: (tm.out || {}).logo || '',
          inName: (tm.in || {}).name || '', inLogo: (tm.in || {}).logo || '' };
      });
      out.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      return out;
    }).catch(function () { return []; });
    _trCache[id] = p;
    return p;
  };

  // Carriere d'un joueur : stats par saison/competition via l'API (id API-Football).
  // Plusieurs saisons en parallele, agregees en lignes {saison, competition, club,
  // matchs, buts, passes, note}. Rien d'invente : une saison sans stats est ignoree.
  var _carCache = {};
  window.NS_PLAYER_CAREER = function (id) {
    if (!id) return Promise.resolve([]);
    if (_carCache[id]) return _carCache[id];
    var seasons = [2025, 2024, 2023, 2022, 2021];
    var p = Promise.all(seasons.map(function (s) {
      return reponse('path=players&id=' + id + '&season=' + s).catch(function () { return []; });
    })).then(function (results) {
      var rows = [];
      results.forEach(function (r) {
        if (!r || !r[0]) return;
        (r[0].statistics || []).forEach(function (st) {
          var lg = st.league || {}, tm = st.team || {}, g = st.games || {}, go = st.goals || {};
          var apps = g.appearences || 0;
          if (!apps && !(go.total)) return; // ligne vide (0 match, 0 but) -> on saute
          if (/friendl/i.test(lg.name || '')) return; // matchs amicaux -> bruit, ignore
          rows.push({
            season: lg.season || '', league: (window.NS_TRAD_COMPET ? window.NS_TRAD_COMPET(lg.name || '') : (lg.name || '')), leagueLogo: lg.logo || '',
            team: tm.name || '', teamLogo: tm.logo || '',
            apps: apps, goals: go.total || 0, assists: go.assists || 0,
            rating: g.rating ? Math.round(parseFloat(g.rating) * 10) / 10 : null
          });
        });
      });
      rows.sort(function (a, b) {
        if (b.season !== a.season) return (b.season || 0) - (a.season || 0);
        return (b.apps || 0) - (a.apps || 0);
      });
      return rows;
    }).catch(function () { return []; });
    _carCache[id] = p;
    return p;
  };

  // Journal des derniers matchs d'un joueur (id API-Football) avec ses stats
  // PERSO par match (buts, passes, note, minutes). L'API n'a pas d'endpoint
  // "matchs d'un joueur" : on reconstitue via 1) ses equipes de la saison,
  // 2) les derniers matchs de ces equipes, 3) la feuille de match de chacun.
  // ~10-16 appels/joueur, mis en cache. Rien d'invente : un match sans feuille
  // exploitable est ignore ; un joueur absent de la feuille => "n'a pas joue".
  var _pmCache = {};
  window.NS_PLAYER_MATCHES = function (id) {
    if (!id) return Promise.resolve([]);
    if (_pmCache[id]) return _pmCache[id];
    var teamIds = [];
    var p = reponse('path=players&id=' + id + '&season=2025').then(function (r) {
      if (r && r[0] && (r[0].statistics || []).length) return r;
      return reponse('path=players&id=' + id + '&season=2024');
    }).then(function (r) {
      (((r || [])[0] || {}).statistics || []).forEach(function (s) {
        var tid = (s.team || {}).id;
        if (tid && teamIds.indexOf(tid) < 0) teamIds.push(tid);
      });
      if (!teamIds.length) return [];
      return Promise.all(teamIds.slice(0, 3).map(function (tid) {
        return reponse('path=fixtures&team=' + tid + '&last=8').catch(function () { return []; });
      }));
    }).then(function (lists) {
      var seen = {}, done = [];
      (lists || []).forEach(function (l) {
        (l || []).forEach(function (f) {
          var st = (((f.fixture || {}).status) || {}).short;
          var fid = (f.fixture || {}).id;
          if (['FT', 'AET', 'PEN'].indexOf(st) >= 0 && fid && !seen[fid]) {
            seen[fid] = 1; done.push(f);
          }
        });
      });
      done.sort(function (a, b) {
        return ((b.fixture || {}).date || '').localeCompare((a.fixture || {}).date || '');
      });
      done = done.slice(0, 12);
      // Une feuille de match n'est JAMAIS vide legitimement : une reponse vide
      // = appel echoue (limite API). On reessaie, et on distingue "echec" (ok=false,
      // -> inconnu) de "vraiment absent de la feuille" (ok=true, st=null -> pas joue).
      var sheet = function (fid, n) {
        return reponse('path=fixtures/players&fixture=' + fid).then(function (tp) {
          if ((!tp || !tp.length) && n > 0) {
            return new Promise(function (r) { setTimeout(r, 700); }).then(function () { return sheet(fid, n - 1); });
          }
          return tp || [];
        }).catch(function () {
          if (n > 0) return new Promise(function (r) { setTimeout(r, 700); }).then(function () { return sheet(fid, n - 1); });
          return [];
        });
      };
      return Promise.all(done.map(function (f) {
        return sheet((f.fixture || {}).id, 2).then(function (tp) {
          var pst = null, ok = !!(tp && tp.length);
          (tp || []).forEach(function (tm) {
            (tm.players || []).forEach(function (pl) {
              if ((pl.player || {}).id === id) pst = (pl.statistics || [])[0] || null;
            });
          });
          return { f: f, st: pst, ok: ok };
        });
      }));
    }).then(function (items) {
      return (items || []).map(function (it) {
        var f = it.f, st = it.st, ok = it.ok;
        var lg = f.league || {}, tt = f.teams || {}, gg = f.goals || {};
        var home = tt.home || {}, away = tt.away || {};
        var side = (teamIds.indexOf(home.id) >= 0) ? 'h' : 'a';
        var hs = (gg.home == null ? 0 : gg.home), as = (gg.away == null ? 0 : gg.away);
        var pf = side === 'h' ? hs : as, pa = side === 'h' ? as : hs;
        var res = pf > pa ? 'V' : (pf < pa ? 'D' : 'N');
        var g = (st && st.games) || {}, go = (st && st.goals) || {};
        var mins = (st ? g.minutes : null);
        return {
          eventId: (f.fixture || {}).id,
          date: (f.fixture || {}).date || '', comp: (window.NS_TRAD_COMPET ? window.NS_TRAD_COMPET(lg.name || '') : (lg.name || '')), compLogo: lg.logo || '',
          homeName: home.name || '', homeLogo: home.logo || '',
          awayName: away.name || '', awayLogo: away.logo || '',
          hs: hs, as: as, side: side, res: res,
          played: !!(ok && st && mins != null),
          unknown: !ok,
          minutes: mins,
          rating: (st && g.rating) ? Math.round(parseFloat(g.rating) * 10) / 10 : null,
          goals: (go.total || 0), assists: (go.assists || 0),
          sub: !!(st && g.substitute)
        };
      });
    }).catch(function () { return []; });
    _pmCache[id] = p;
    return p;
  };

  // Historique de valeur marchande (Transfermarkt, scrape local -> mv-history.json).
  // Chargement paresseux de la carte, cle = id du dataset. Si le fichier n'existe
  // pas encore (scrape pas lance) -> {} -> null -> le chart retombe sur la demo.
  var _mvhMap = null;
  window.NS_MV_HISTORY = function (id) {
    if (!id) return Promise.resolve(null);
    if (!_mvhMap) {
      _mvhMap = fetch('/data/mv-history.json?v=3')
        .then(function (r) { return r.ok ? r.json() : {}; })
        .catch(function () { return {}; });
    }
    return _mvhMap.then(function (m) { return (m && m[String(id)]) || null; });
  };

  // Resout le nom d'une equipe (dataset du site) vers son id API-Football,
  // via data/teams-index.json (6700+ clubs, id extrait du logo). Necessaire
  // car le dataset joueurs/equipes du site n'a pas d'id API-Football natif.
  var _teamIdCache = {};
  window.NS_TEAM_ID = function (nom) {
    if (!nom) return Promise.resolve(null);
    var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var cle = norm(nom);
    if (_teamIdCache[cle] !== undefined) return Promise.resolve(_teamIdCache[cle]);
    return window.NS_ensureTeamsIndex().then(function (idx) {
      var hit = (idx || []).find(function (x) { return norm(x.n) === cle; });
      var id = null;
      if (hit) { var m = String(hit.l || '').match(/\/teams\/(\d+)\.png/); id = m ? +m[1] : null; }
      _teamIdCache[cle] = id;
      return id;
    }).catch(function () { return null; });
  };

  // Agenda REEL d'une equipe (derniers/prochains matchs, avec id de match ->
  // cliquables) via l'id API-Football. Remplace l'ancien NS_TEAM_MATCHES
  // (donnees figees, un seul club renseigne).
  var _teamLiveCache = {};
  window.NS_TEAM_LIVE = function (teamId) {
    if (!teamId) return Promise.resolve(null);
    if (_teamLiveCache[teamId]) return _teamLiveCache[teamId];
    // Meme forme que l'ancien NS_TEAM_MATCHES (dom/ext = noms, sd/sa = score
    // domicile/exterieur, heure = HH:MM) pour rester compatible avec le rendu
    // existant, + eventId pour rendre les lignes cliquables.
    var mapMatch = function (f) {
      var lg = f.league || {}, tt = f.teams || {}, gg = f.goals || {};
      var dt = new Date(f.fixture.date);
      var d2 = function (n) { return String(n).padStart(2, '0'); };
      return {
        eventId: f.fixture.id,
        date: d2(dt.getDate()) + '/' + d2(dt.getMonth() + 1) + '/' + dt.getFullYear(),
        // Horodatage brut : « JJ/MM/AAAA » se trie alphabetiquement par JOUR,
        // ce qui melangeait completement l'ordre des deux listes.
        ts: dt.getTime(),
        heure: d2(dt.getHours()) + ':' + d2(dt.getMinutes()),
        comp: (window.NS_TRAD_COMPET ? window.NS_TRAD_COMPET(lg.name || '') : (lg.name || '')),
        dom: (tt.home || {}).name || '', ext: (tt.away || {}).name || '',
        domLogo: (tt.home || {}).logo || '', extLogo: (tt.away || {}).logo || '',
        sd: gg.home, sa: gg.away,
      };
    };
    var p = Promise.all([
      reponse('path=fixtures&team=' + teamId + '&last=10'),
      reponse('path=fixtures&team=' + teamId + '&next=10'),
    ]).then(function (r) {
      var passes = (r[0] || []).map(mapMatch);
      var avenir = (r[1] || []).map(mapMatch);
      passes.sort(function (a, b) { return b.ts - a.ts; });   // du plus recent au plus ancien
      avenir.sort(function (a, b) { return a.ts - b.ts; });   // du plus proche au plus lointain
      return { passes: passes, avenir: avenir };
    }).catch(function () { return { passes: [], avenir: [] }; });
    _teamLiveCache[teamId] = p;
    return p;
  };

  // Actualites d'un joueur via le proxy Google News (par nom). Slash final
  // obligatoire (trailingSlash) pour eviter la redirection 308.
  var _newsCache = {};
  window.NS_PLAYER_NEWS = function (name) {
    if (!name) return Promise.resolve([]);
    if (_newsCache[name]) return _newsCache[name];
    var p = fetch('/api/news/?q=' + encodeURIComponent(name))
      .then(function (r) { return r.ok ? r.json() : { articles: [] }; })
      .then(function (d) { return (d && d.articles) || []; })
      .catch(function () { return []; });
    _newsCache[name] = p;
    return p;
  };

  // ── Routeur : une URL par ecran ────────────────────────────────────────
  // L'application vivait entierement sur "/" : impossible de partager un
  // ecran, le bouton retour ne faisait rien, et rien n'etait indexable.
  // On pose l'URL a chaque navigation et on restaure l'ecran au retour.
  // ── Onglets de la fiche match : un segment d'URL chacun ─────────────────
  // Doit rester aligne sur la table ONGLETS de api/seo.js : c'est le meme
  // contrat d'URL des deux cotes.
  window.NS_ONGLETS = (function () {
    var T = [
      ['resume', '', 'Résumé'], ['cotes', 'cotes', 'Cotes'],
      ['pronostics', 'pronostics', 'Pronostics'], ['compo', 'compositions', 'Compositions'],
      ['volume', 'volume', 'Volume'], ['stats', 'statistiques', 'Statistiques'],
      ['tat', 'tete-a-tete', 'Tête-à-tête'], ['classements', 'tableau', 'Tableau'],
    ];
    var seg = {}, id = {}, nom = {};
    T.forEach(function (r) { seg[r[0]] = r[1]; nom[r[0]] = r[2]; if (r[1]) id[r[1]] = r[0]; });
    // onglets a canonique auto-referente : ceux dont le contenu est propre
    return { seg: seg, id: id, nom: nom, propre: ['pronostics', 'compo', 'stats', 'tat'] };
  })();

  window.NS_ROUTE = (function () {
    var ECRANS = {
      home:       ['/',            'NinjaScores — Résultats de foot en direct, classements et pronostics'],
      schedule:   ['/calendrier/',  'Calendrier des matchs de football — NinjaScores'],
      standings:  ['/classement/',  'Classements de football — 150 pays | NinjaScores'],
      pronostics: ['/pronostics/',  'Pronostics football du jour — NinjaScores'],
      transfers:  ['/transferts/',  'Derniers transferts et mercato — NinjaScores'],
      favorites:  ['/favoris/',     'Mes favoris — NinjaScores'],
    };
    var DESC = {
      '/calendrier/': 'Tous les matchs de football du jour et des prochains jours : horaires, scores en direct et cotes.',
      '/classement/': 'Classements complets de 150 pays : Ligue 1, Premier League, Liga, Serie A et des centaines de championnats.',
      '/pronostics/': 'Nos pronostics football du jour, avec cotes et indices de confiance.',
      '/transferts/': 'Les derniers transferts et le mercato des grands championnats : Ligue 1, Premier League, Liga, Serie A et plus.',
      '/favoris/':    'Vos équipes et compétitions suivies.',
    };
    // Pages légales : URL publique déep-linkable (exigé par Google Play pour
    // la politique de confidentialité). L'écran applicatif est 'legal:xxx'.
    var LEGAL = {
      '/mentions-legales/': ['legal:mentions',        'Mentions légales — NinjaScores'],
      '/cgu/':              ['legal:cgu',             'Conditions générales d’utilisation — NinjaScores'],
      '/confidentialite/':  ['legal:confidentialite', 'Politique de confidentialité — NinjaScores'],
      '/cookies/':          ['legal:cookies',         'Politique de cookies — NinjaScores'],
      '/cgv/':              ['legal:cgv',             'Conditions générales de vente — NinjaScores'],
    };
    var popCb = null;

    function meta(nom, val) {
      var m = document.querySelector('meta[name="' + nom + '"]');
      if (!m) { m = document.createElement('meta'); m.setAttribute('name', nom); document.head.appendChild(m); }
      m.setAttribute('content', val);
    }
    function canonique(url) {
      var l = document.querySelector('link[rel="canonical"]');
      if (!l) { l = document.createElement('link'); l.setAttribute('rel', 'canonical'); document.head.appendChild(l); }
      l.setAttribute('href', 'https://ninjascores.com' + url);
    }
    function applique(url, titre, desc) {
      document.title = titre;
      if (desc) meta('description', desc);
      canonique(url);
      // /direct/ ne porte aucune valeur SEO : son contenu change en permanence
      // et ce sont les pages de match qui doivent capter les requetes
      meta('robots', url === '/direct/' ? 'noindex, follow' : 'index, follow');
    }

    return {
      // pose l'URL d'un ecran de l'application
      ecran: function (id, live) {
        var e = ECRANS[id]; if (!e) return;
        var url = (id === 'schedule' && live) ? '/direct/' : e[0];
        var titre = (url === '/direct/') ? 'Matchs en direct — NinjaScores' : e[1];
        if (location.pathname !== url) history.pushState({ ecran: id, live: !!live }, '', url);
        applique(url, titre, DESC[url] || null);
      },
      // pose l'URL canonique d'un match ouvert dans l'application
      match: function (m) {
        var url = window.NS_URL_MATCH && window.NS_URL_MATCH(m);
        if (!url) return;
        var t = (m.homeTeam || '') + ' - ' + (m.awayTeam || '') + ' — NinjaScores';
        if (location.pathname !== url) history.pushState({ match: m.eventId }, '', url);
        applique(url, t, null);
      },
      // pose l'URL canonique d'une page equipe ouverte dans l'application
      equipe: function (eq) {
        var url = window.NS_URL_EQUIPE && window.NS_URL_EQUIPE(eq);
        if (!url) return;
        var t = (eq.name || '') + ' — NinjaScores';
        if (location.pathname !== url) history.pushState({ equipe: eq.id }, '', url);
        applique(url, t, null);
      },
      // pose l'URL canonique d'une fiche joueur ouverte dans l'application
      joueur: function (p) {
        var url = window.NS_URL_JOUEUR && window.NS_URL_JOUEUR(p);
        if (!url) return;
        var t = (p.name || '') + ' — NinjaScores';
        if (location.pathname !== url) history.pushState({ joueur: p.id }, '', url);
        applique(url, t, null);
      },
      // pose l'URL d'un onglet de la fiche match. Le resume n'a pas de
      // segment : il EST la fiche, sinon deux URLs porteraient la meme page.
      onglet: function (m, tab, remplace) {
        var base = window.NS_URL_MATCH && window.NS_URL_MATCH(m);
        if (!base) return;
        var seg = window.NS_ONGLETS.seg[tab];
        if (seg === undefined) return;
        var url = base + (seg ? seg + '/' : '');
        var nom = window.NS_ONGLETS.nom[tab] || '';
        var duo = (m.homeTeam || '') + ' - ' + (m.awayTeam || '');
        var t = (tab === 'resume' ? duo : nom + ' ' + duo) + ' — NinjaScores';
        if (location.pathname !== url) {
          history[remplace ? 'replaceState' : 'pushState']({ match: m.eventId, onglet: tab }, '', url);
        }
        applique(url, t, null);
        // seuls les onglets a contenu propre se referencent eux-memes ;
        // les autres pointent la fiche, pour ne pas creer de doublon mince
        if (window.NS_ONGLETS.propre.indexOf(tab) < 0) canonique(base);
      },
      // pose l'URL d'une competition ouverte dans l'ecran classement.
      // Sans ca, l'app affichait le tableau sans changer l'URL : le lien
      // n'etait ni partageable ni coherent avec la page indexee.
      competition: function (pays, ligue) {
        var url = window.NS_URL_COMPET && window.NS_URL_COMPET({ pays: pays, ligue: ligue });
        // competition internationale (C1, C2...) : pas de page pays -> on
        // retombe sur /classement/ plutot que sur une URL qui n'existe pas
        if (!url) { this.ecran('standings'); return; }
        var t = ligue + ' — classement ' + pays + ' | NinjaScores';
        if (location.pathname !== url) history.pushState({ ecran: 'standings', comp: url }, '', url);
        applique(url, t, 'Classement complet de ' + ligue + ' (' + pays + ') : équipes, points, victoires et différence de buts.');
      },
      // pose l'URL d'une page pays (liste des championnats d'un pays)
      pays: function (pays) {
        var url = window.NS_URL_PAYS && window.NS_URL_PAYS(pays);
        if (!url) { this.ecran('standings'); return; }
        var t = 'Football ' + pays + ' — classements et résultats des championnats | NinjaScores';
        if (location.pathname !== url) history.pushState({ ecran: 'standings', pays: url }, '', url);
        applique(url, t, 'Les championnats de ' + pays + ' : classements complets, résultats et calendrier.');
      },
      // pose l'URL d'une page legale (mentions, cgu, confidentialite...)
      legal: function (screenId) {
        for (var u in LEGAL) {
          if (LEGAL[u][0] === screenId) {
            if (location.pathname !== u) history.pushState({ ecran: screenId }, '', u);
            applique(u, LEGAL[u][1], null);
            return;
          }
        }
      },
      // ecran a restaurer au chargement, d'apres l'URL
      initial: function () {
        var p = location.pathname;
        if (LEGAL[p]) return { ecran: LEGAL[p][0] };
        for (var id in ECRANS) if (ECRANS[id][0] === p) return { ecran: id };
        if (p === '/direct/') return { ecran: 'schedule', live: true };
        // /football/match/{slug}-{id}/{onglet}/
        var mm = p.match(/^\/football\/match\/.*?-(\d+)\/(?:([a-z-]+)\/)?$/);
        if (mm) return { match: +mm[1], onglet: mm[2] ? (window.NS_ONGLETS.id[mm[2]] || 'resume') : 'resume' };
        // /football/equipe/{slug}-{id}/
        var em = p.match(/^\/football\/equipe\/.*?-(\d+)\/$/);
        if (em) return { equipe: +em[1] };
        // /football/joueur/{slug}-{id}/
        var jm = p.match(/^\/football\/joueur\/.*?-(\d+)\/$/);
        if (jm) return { joueur: +jm[1] };
        return null;
      },
      // applique titre/description/canonical pour l'URL courante, au chargement
      appliquer: function () {
        var p = location.pathname;
        if (LEGAL[p]) { applique(p, LEGAL[p][1], null); return; }
        for (var id in ECRANS) if (ECRANS[id][0] === p) { applique(p, ECRANS[id][1], DESC[p] || null); return; }
        if (p === '/direct/') applique(p, 'Matchs en direct — NinjaScores', null);
      },
      surRetour: function (cb) { popCb = cb; },
      _pop: function (e) {
        var st = (e && e.state) || window.NS_ROUTE.initial() || { ecran: 'home' };
        window.NS_ROUTE.appliquer();
        // le bouton retour pilote la navigation exposee par l'application
        if (st.ecran && window.__nsNav) { try { window.__nsNav(st.ecran); } catch (x) {} }
        // ... y compris entre deux onglets d'une meme fiche match.
        // L'onglet se lit dans l'URL, pas dans l'etat : l'entree poussee a
        // l'ouverture de la fiche ne porte pas d'onglet, et le retour depuis
        // un onglet restait donc bloque sur l'onglet quitte.
        if (window.__nsTab) {
          var mm = location.pathname.match(/^\/football\/match\/.*?-\d+\/(?:([a-z-]+)\/)?$/);
          if (mm) { try { window.__nsTab(mm[1] ? (window.NS_ONGLETS.id[mm[1]] || 'resume') : 'resume'); } catch (x) {} }
        }
        if (popCb) popCb(st);
      },
    };
  })();
  window.addEventListener('popstate', function (e) { window.NS_ROUTE._pop(e); });

  // ── URLs canoniques, pour un maillage interne en vrais <a href> ─────────
  // Le crawler ne suit pas les onClick : sans ces liens, les 1 805 pages
  // rendues cote serveur ne sont atteignables que par le sitemap, et le
  // maillage interne — qui pese lourd dans le classement — reste nul.
  function slugUrl(x) {
    return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  window.NS_URL_MATCH = function (m) {
    if (!m || !m.eventId) return null;
    return '/football/match/' + slugUrl(m.homeTeam) + '-' + slugUrl(m.awayTeam)
         + '-' + m.eventId + '/';
  };
  window.NS_URL_EQUIPE = function (eq) {
    if (!eq || !eq.id || !eq.name) return null;
    return '/football/equipe/' + slugUrl(eq.name) + '-' + eq.id + '/';
  };
  // id = celui du dataset (Transfermarkt), le meme que player.id utilise
  // partout dans l'appli : stable et disponible pour les 15 680 joueurs,
  // contrairement a l'id API-Football qui ne resout que ~80% d'entre eux.
  window.NS_URL_JOUEUR = function (p) {
    if (!p || !p.id || !p.name) return null;
    return '/football/joueur/' + slugUrl(p.name) + '-' + p.id + '/';
  };

  // ── Bloc « À propos de ce match » ──────────────────────────────────────
  // Le meme bloc que la page serveur, mais genere DANS l'application a partir
  // du match : la version serveur n'existait qu'au premier chargement, donc
  // invisible des qu'on naviguait vers un match depuis le calendrier.
  var MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
                   'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  window.NS_APROPOS_HTML = function (m, t, accent) {
    if (window.NS_IS_NATIVE && window.NS_IS_NATIVE()) return '';
    if (window.innerWidth < 1024) return '';
    if (!m || !m.homeTeam || !m.awayTeam) return '';
    var esc = function (s) { return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var dom = m.homeTeam, ext = m.awayTeam;
    var compet = String(m.competition || '').split(' · ')[0] || m.competition || '';
    var lieu = m.venue ? ' à ' + m.venue : '';
    var d = m.startDate ? new Date(m.startDate) : null;
    var date = d ? (d.getDate() + ' ' + MOIS_LONG[d.getMonth()] + ' ' + d.getFullYear()) : '';
    var fini = m.status === 'ended' || m.apiEnded;
    var hs = m.homeScore, as = m.awayScore;
    var ok = hs != null && as != null && hs !== '' && as !== '';
    var phrase;
    if (fini && ok) {
      var h = parseInt(hs, 10), a = parseInt(as, 10), ec = Math.abs(h - a);
      var sc = Math.max(h, a) + '-' + Math.min(h, a);
      if (h === a) {
        phrase = dom + ' et ' + ext + ' se sont neutralisés ' + h + '-' + a + lieu
          + (compet ? ', en ' + compet : '') + (date ? ', le ' + date : '') + '.';
      } else {
        var vq = h > a ? dom : ext, pd = h > a ? ext : dom;
        var verbe = ec >= 3 ? ' a largement dominé ' : (ec === 1 ? " s'est imposé d'un but face à " : ' a battu ');
        phrase = vq + verbe + pd + ' ' + sc + lieu + (compet ? ', en ' + compet : '')
          + (date ? ', le ' + date : '') + '.';
      }
    } else {
      phrase = dom + ' reçoit ' + ext + lieu + (date ? ' le ' + date : '')
        + (compet ? ", dans le cadre d'un match de " + compet : '') + '.';
    }
    var col = (t && t.text) || '#14121c', sec = (t && t.textSec) || '#5b5870';
    var bord = (t && t.border) || 'rgba(128,128,128,.2)';
    var ac = accent || '#6133E0';
    var base = window.NS_URL_MATCH ? window.NS_URL_MATCH(m) : '';
    var lien = function (href, txt) {
      return '<a href="' + href + '" style="color:' + ac
        + ';text-decoration:none;font-weight:600">' + esc(txt) + '</a>';
    };
    // Liens vers les onglets de la fiche + maillage interne vers les grands
    // championnats, comme la version serveur : ce sont de vrais <a href>.
    var sommaire = 'Retrouvez sur cette page le ' + lien(base, 'résumé') + ' du match, '
      + 'les actualités des deux clubs, les ' + lien(base + 'compositions/', 'compositions') + ', '
      + 'les ' + lien(base + 'cotes/', 'cotes') + ' et les '
      + lien(base + 'tete-a-tete/', 'statistiques tête-à-tête') + ' entre ' + esc(dom) + ' et ' + esc(ext) + '.';
    var pop = [['/football/france/ligue-1/', 'Ligue 1'], ['/football/angleterre/premier-league/', 'Premier League'],
               ['/football/espagne/la-liga/', 'La Liga'], ['/football/italie/serie-a/', 'Serie A'],
               ['/football/allemagne/bundesliga/', 'Bundesliga']].map(function (x) { return lien(x[0], x[1]); }).join(' · ');
    var pied = 'Tous les scores en direct, les classements et les pronostics sur '
      + lien('/', 'NinjaScores') + ' · ' + lien('/calendrier/', 'Calendrier des matchs') + ' · ' + pop;
    return '<div style="max-width:820px;margin:0 auto;padding:22px 16px 34px;'
      + 'border-top:1px solid ' + bord + ';font:14px/1.65 system-ui,-apple-system,sans-serif">'
      + '<h2 style="font-size:16px;font-weight:800;margin:0 0 10px;color:' + col + '">À propos de ce match</h2>'
      + '<p style="margin:0 0 12px;color:' + col + ';opacity:.92">' + esc(phrase) + '</p>'
      + '<p style="margin:0 0 12px;color:' + col + ';opacity:.92">' + sommaire + '</p>'
      + '<p style="margin:0;color:' + sec + ';font-size:13px">' + pied + '</p>'
      + '</div>';
  };
  // n'existe que pour les championnats reellement rendus cote serveur :
  // une competition internationale n'a pas de page pays
  window.NS_URL_COMPET = function (comp) {
    if (!comp || !comp.ligue || !comp.pays) return null;
    try {
      var m = window.NS_MANIFEST; if (!m) return null;
      var lig = comp.ligueVo || comp.ligue;
      var cible = String(comp.pays);
      for (var cle in m.pays) {
        var e = m.pays[cle];
        // le pays peut arriver en nom francais (Angleterre), en cle API
        // (England) ou via un alias : la barre laterale passe le nom API.
        // On accepte les trois, et on construit le slug depuis le NOM
        // francais pour que l'URL soit toujours la forme indexee.
        var match = e.nom === cible || cle === cible
          || cle.replace(/-/g, ' ') === cible
          || (e.alias && e.alias.indexOf(cible) >= 0);
        if (match && (e.ordre || []).indexOf(lig) >= 0) {
          return '/football/' + slugUrl(e.nom) + '/' + slugUrl(lig) + '/';
        }
      }
    } catch (e) {}
    return null;
  };
  // URL d'une page pays. Meme tolerance que NS_URL_COMPET : le pays peut
  // arriver en nom francais, en cle API ou via un alias.
  window.NS_URL_PAYS = function (pays) {
    if (!pays) return null;
    try {
      var m = window.NS_MANIFEST; if (!m) return null;
      var cible = String(pays);
      for (var cle in m.pays) {
        var e = m.pays[cle];
        if (e.nom === cible || cle === cible || cle.replace(/-/g, ' ') === cible
            || (e.alias && e.alias.indexOf(cible) >= 0)) {
          return '/football/' + slugUrl(e.nom) + '/';
        }
      }
    } catch (e) {}
    return null;
  };

  // offset en jours par rapport a aujourd'hui ; 'live' pour les matchs en cours
  // Rouvrir une fiche a partir du seul identifiant de l'URL. L'application ne
  // savait ouvrir qu'un match DEJA charge dans le calendrier : en arrivant
  // depuis Google sur /football/match/..., il n'y avait rien a ouvrir. On
  // repasse par le meme `convertir` que le calendrier, pour que l'objet soit
  // identique a celui d'un clic.
  // ── Derniers transferts ────────────────────────────────────────────────
  // Le balayage des clubs se fait cote serveur (api/transferts.js) : ici on
  // ne fait que recuperer le fil deja constitue et l'habiller aux champs
  // qu'attendent les trois blocs de l'interface.
  var _trCache = null;
  var MOIS_CRT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  window.NS_TRANSFERTS = function () {
    if (_trCache) return _trCache;
    _trCache = fetch('/api/transferts/')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var l = (j && j.transferts) || [];
        return l.map(function (x) {
          var d = new Date(x.date + 'T12:00:00Z');
          return {
            id: x.id,
            date: d.getUTCDate() + ' ' + MOIS_CRT[d.getUTCMonth()] + ' ' + d.getUTCFullYear(),
            iso: x.date,
            player: x.joueur,
            initials: x.initiales,
            from: x.de, fromLogo: x.deLogo, fromId: x.deId,
            to: x.vers, toLogo: x.versLogo, toId: x.versId,
            // Moins de 4 % des mouvements portent un montant chez le
            // fournisseur : on affiche la nature du transfert plutot qu'un
            // chiffre absent, et jamais un montant invente.
            value: x.valeur || (x.type === 'pret' ? 'Prêt'
                  : (x.type === 'libre' ? 'Libre' : 'Transfert')),
            pos: '', type: x.type, sport: '⚽', ligue: x.ligue,
          };
        });
      })
      .catch(function () { return []; });
    return _trCache;
  };

  window.NS_MATCH_PAR_ID = function (id) {
    return window.NS_manifestPret
      .then(function () { return reponse('path=fixtures&id=' + id); })
      .then(function (brut) {
        if (!brut.length) return null;
        var f = brut[0];
        var m = convertir(f);
        m.competition = traduire(f.league.name) + ' · '
          + (f.league.country === 'World' ? (phase(f.league.round) || 'International')
                                          : paysFr(f.league.country));
        m.seriesId = f.league.id;
        m.ligueId = f.league.id;
        m.saison = f.league.season;
        m.season = f.league.season;
        m.leagueLogo = f.league.logo;
        m.sport = 'football';
        // L'en-tete de la fiche lit homeScore/awayScore, que `convertir` n'a
        // jamais ecrits : c'est le calendrier qui les ajoute AU CLIC. Sans eux
        // le score affichait "- -" alors que la donnee etait la, dans
        // apiScore. On refait donc ici le meme enrichissement.
        var p = m.apiScore ? m.apiScore.split('-') : null;
        m.homeScore = p ? p[0] : null;
        m.awayScore = p ? p[1] : null;
        m.minute = null;
        m.homeColor = '#6133E0';
        m.awayColor = '#F59E0B';
        m.badge = '';
        return m;
      })
      .catch(function () { return null; });
  };

  // Deroulement du match : buts, cartons, remplacements. La section existait
  // dans l'UI mais n'etait jamais alimentee — seul le match demo avait des
  // events. On va donc chercher les vrais events (le proxy les autorise deja).
  window.NS_EVENTS = function (id, homeId) {
    return window.NS_manifestPret
      .then(function () { return reponse('path=fixtures/events&fixture=' + id); })
      .then(function (brut) {
        return (brut || []).map(function (e) {
          var t = (e.type || '').toLowerCase(), det = (e.detail || '').toLowerCase(), ty;
          var pen = false, csc = false;
          if (t === 'goal') {
            // Piege du fournisseur : un penalty MANQUE arrive lui aussi en
            // type « Goal » (detail « Missed Penalty »). Sans ce test il
            // s'affichait comme un but marque, et gonflait le score deduit
            // des events (recap buteurs, Live Activity).
            if (det.indexOf('missed') >= 0) ty = 'pen-missed';
            else {
              ty = 'goal';
              pen = det.indexOf('penalty') >= 0;
              csc = det.indexOf('own') >= 0;
            }
          }
          else if (t === 'card') ty = det.indexOf('red') >= 0 ? 'red' : 'yellow';
          else if (t === 'subst') ty = 'sub';
          else return null;   // Var et autres : ignores
          var min = (e.time && e.time.elapsed) || 0;
          if (e.time && e.time.extra) min += e.time.extra;
          var obj = { minute: min, player: (e.player && e.player.name) || '',
                   team: (e.team && e.team.id === homeId) ? 'home' : 'away',
                   type: ty, pen: pen, csc: csc };
          if (ty === 'sub') {
            obj.playerOut = obj.player;
            obj.playerIn = (e.assist && e.assist.name) || '';
          }
          return obj;
        }).filter(Boolean).sort(function (a, b) { return a.minute - b.minute; });
      })
      .catch(function () { return []; });
  };

  // Momentum du match — 90 valeurs [-100, +100] calculees a partir des vrais
  // evenements (buts, cartons, remplacements). Positif = pression domicile,
  // negatif = pression exterieur. Chaque evenement cree une impulsion qui
  // decroit exponentiellement sur ~8 minutes.
  window.NS_MOMENTUM = function (events) {
    var N = 90, d = new Array(N);
    for (var i = 0; i < N; i++) d[i] = 0;
    if (!events || !events.length) return d;

    var impulses = [];
    events.forEach(function (e) {
      var m = Math.max(0, Math.min(89, (e.minute || 0) - 1));
      var sign = e.team === 'home' ? 1 : -1;
      var amp = 0;
      if (e.type === 'goal') amp = 55;
      else if (e.type === 'red') amp = 35;
      else if (e.type === 'yellow' || e.type === 'card') amp = 18;
      else if (e.type === 'sub') amp = 8;
      else if (e.type === 'pen-missed') { amp = 20; sign = -sign; }
      if (amp) impulses.push({ m: m, a: amp * sign });
    });

    for (var t = 0; t < N; t++) {
      var v = 0;
      for (var j = 0; j < impulses.length; j++) {
        var imp = impulses[j];
        var dt = t - imp.m;
        if (dt < 0) continue;
        v += imp.a * Math.exp(-dt / 7);
      }
      d[t] = Math.max(-100, Math.min(100, Math.round(v)));
    }
    return d;
  };

  // Statistiques du match (possession, tirs, xG, corners…), depuis
  // fixtures/statistics. Le fournisseur ne donne que le TOTAL du match, pas le
  // decoupage par mi-temps (verifie) : la phase 2 capturera les mi-temps en
  // direct. Ici, la colonne « MATCH » avec de vraies valeurs.
  window.NS_STATS = function (id) {
    // 4e valeur `cumul` : la stat s'additionne dans le temps (soustractible
    // pour la 2e MT). Possession et précision de passes sont des % : non.
    var MAP = [
      ['expected_goals', 'Expected Goals (xG)', '', true],
      ['Ball Possession', 'Possession de balle', '%', false],
      ['Total Shots', 'Tirs totaux', '', true],
      ['Shots on Goal', 'Tirs cadrés', '', true],
      ['Corner Kicks', 'Corners', '', true],
      ['Total passes', 'Passes', '', true],
      ['Passes %', 'Précision passes', '%', false],
      ['Fouls', 'Fautes', '', true],
      ['Offsides', 'Hors-jeu', '', true],
      ['Yellow Cards', 'Cartons jaunes', '', true],
      ['Goalkeeper Saves', 'Arrêts du gardien', '', true],
    ];
    var num = function (v) {
      if (v == null) return null;
      if (typeof v === 'string') v = v.replace('%', '');
      var n = parseFloat(v);
      return isNaN(n) ? null : n;
    };
    return window.NS_manifestPret
      .then(function () { return reponse('path=fixtures/statistics&fixture=' + id); })
      .then(function (rep) {
        if (!rep || rep.length < 2) return null;
        var A = rep[0].statistics || [], B = rep[1].statistics || [];
        var get = function (arr, type) {
          var x = arr.find(function (s) { return s.type === type; });
          return x ? x.value : null;
        };
        var out = [];
        MAP.forEach(function (m) {
          var h = num(get(A, m[0])), a = num(get(B, m[0]));
          if (h == null && a == null) return;   // stat absente : on ne l'affiche pas
          out.push({ label: m[1], home: h || 0, away: a || 0, unit: m[2], cumul: m[3] });
        });
        return out.length ? out : null;
      })
      .catch(function () { return null; });
  };

  // Infos du stade de l'equipe a domicile (capacite, surface, adresse, photo).
  // L'endpoint teams est mis en cache 24 h par le proxy ; en plus on garde le
  // resultat en memoire cote client : la capacite d'un stade ne change pas.
  var _stadeCache = {};
  window.NS_STADE = function (teamId) {
    if (!teamId) return Promise.resolve(null);
    if (_stadeCache[teamId]) return _stadeCache[teamId];
    _stadeCache[teamId] = window.NS_manifestPret
      .then(function () { return reponse('path=teams&id=' + teamId); })
      .then(function (rep) {
        var v = rep[0] && rep[0].venue;
        return v ? { nom: v.name, capacite: v.capacity || null, surface: v.surface || null,
                     ville: v.city || null, adresse: v.address || null, image: v.image || null } : null;
      })
      .catch(function () { return null; });
    return _stadeCache[teamId];
  };

  // 1re mi-temps captee a la pause (via /api/stats-mt + Redis). `live` : on
  // demande la capture (le serveur ne l'effectue que si le match est a « HT »).
  window.NS_STATS_MT = function (id, live) {
    var u = '/api/stats-mt/?fixture=' + id + (live ? '&capture=1' : '');
    return fetch(u)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.ht) || null; })
      .catch(function () { return null; });
  };

  // Etat live de plusieurs matchs favoris en UN appel (ids joints par '-').
  // Les favoris stockent une copie figee du match (0-0 au moment de l'ajout) ;
  // c'est ce helper qui ramene le vrai score, comme le calendrier.
  window.NS_FAV_LIVE = function (ids) {
    ids = (ids || []).filter(Boolean);
    if (!ids.length) return Promise.resolve({});
    return window.NS_manifestPret
      .then(function () { return reponse('path=fixtures&ids=' + ids.join('-')); })
      .then(function (brut) {
        var map = {};
        brut.forEach(function (f) {
          var m = convertir(f);
          var p = m.apiScore ? m.apiScore.split('-') : null;
          m.homeScore = p ? p[0] : null;
          m.awayScore = p ? p[1] : null;
          map[f.fixture.id] = m;
        });
        return map;
      })
      .catch(function () { return {}; });
  };

  var _tz = window._NS_TZ || 'Europe/Paris';
  window.NS_FIXTURES = function (offset) {
    var cle;
    if (offset === 'live') cle = 'live';
    else {
      var parts = new Date().toLocaleDateString('en-CA', { timeZone: _tz }).split('-');
      var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      d.setDate(d.getDate() + (offset || 0));
      cle = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
          + '-' + String(d.getDate()).padStart(2, '0');
    }
    // le direct change en permanence : jamais de cache local dessus
    if (cle !== 'live' && cache[cle]) return cache[cle];
    var tzParam = _tz ? '&timezone=' + encodeURIComponent(_tz) : '';
    var p = window.NS_manifestPret
      .then(function () {
        return reponse(cle === 'live' ? 'path=fixtures&live=all' + tzParam : 'path=fixtures&date=' + cle + tzParam);
      })
      .then(function (brut) {
        var comps = grouper(brut);
        if (cle === 'live') return comps;
        // le rattrapage des cotes se fait championnat par championnat : il
        // faut donc savoir quels matchs on affiche et dans quelle saison
        var ligues = comps.map(function (c) {
          var s = null;
          brut.some(function (f) {
            if (f.league.id === c.seriesId) { s = f.league.season; return true; }
            return false;
          });
          return { id: c.seriesId, season: s, fixtures: c.matches.map(function (m) { return m.eventId; }) };
        });
        return cotesJour(cle, ligues).then(function (cotes) {
          comps.forEach(function (c) {
            c.matches.forEach(function (m) {
              var k = cotes[m.eventId];
              if (k) { m.cote1 = k.c1; m.coteN = k.cN; m.cote2 = k.c2; m.coteSource = k.source; }
            });
          });
          return comps;
        });
      });
    if (cle !== 'live') cache[cle] = p;
    // Echec ou vide : on ne memorise pas, la prochaine visite retentera.
    // Un jour charge SANS AUCUNE cote compte aussi comme un echec : cotesJour
    // avale ses erreurs en renvoyant {} et le calendrier restait sans cotes
    // jusqu'au redemarrage de l'app (constate le 30/08).
    p.then(function (r) {
      if (!r || !r.length) { delete cache[cle]; return; }
      var uneCote = r.some(function (c) { return c.matches.some(function (m) { return m.cote1; }); });
      var unAvenir = r.some(function (c) { return c.matches.some(function (m) { return m.status === 'upcoming'; }); });
      if (unAvenir && !uneCote) delete cache[cle];
    }, function () { delete cache[cle]; });
    return p;
  };
})();
