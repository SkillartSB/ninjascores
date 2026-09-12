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

  // Lien profond : /calendrier/?sport=tennis ouvre directement l'onglet tennis
  // (ScheduleScreen lit window._ninjaScheduleSport a l'initialisation).
  try { if (/[?&]sport=tennis\b/.test(location.search)) window._ninjaScheduleSport = 'tennis'; } catch (e) {}

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
