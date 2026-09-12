// ── Fiche match tennis ───────────────────────────────────────────────────────
// 12/09/2026. Rendue par l'App a la place de MatchDetailScreen quand le match
// ouvert vient du tennis (match.sport === 'tennis', objets produits par s13.js).
// Onglets : Resume, Cotes, Pronostics, Tete-a-tete, Tableau. Donnees : proxy
// /api/tennis/ (get_fixtures&match_key&detail=1, get_H2H, get_odds, get_draw,
// get_standings) — tout est cache cote Redis/CDN.
(function () {
  'use strict';
  var R = window.React; if (!R) return;
  var h = R.createElement;
  var EMOJI = window.NS_POLICE_EMOJI || 'inherit';
  var U = window.NS_TENNIS_UTIL || { drapeau: function () { return ''; }, drapeauPays: function () { return ''; }, PAYS_ISO: {} };
  // Logos des bookmakers FR (memes visuels que la fiche foot) : Unibet, bet365, Winamax, Betclic.
  window.NS_BKMS_FR = [{logo:'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMTAgNDQiPgogIDx0ZXh0IHg9IjU1IiB5PSIxNiIgZm9udC1mYW1pbHk9IkFyaWFsIEJsYWNrLEltcGFjdCxzYW5zLXNlcmlmIiBmb250LXdlaWdodD0iOTAwIiBmb250LXNpemU9IjE4IiBmaWxsPSIjRkZGRkZGIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0iY2VudHJhbCIgdGV4dExlbmd0aD0iMTAwIiBsZW5ndGhBZGp1c3Q9InNwYWNpbmdBbmRHbHlwaHMiPlVOSUJFVDwvdGV4dD4KICA8Y2lyY2xlIGN4PSIzMCIgY3k9IjM0IiByPSI1IiBmaWxsPSIjQzhGMDdBIi8+CiAgPGNpcmNsZSBjeD0iNDIiIGN5PSIzNCIgcj0iNSIgZmlsbD0iI0E4RDg1QSIvPgogIDxjaXJjbGUgY3g9IjU0IiBjeT0iMzQiIHI9IjUiIGZpbGw9IiM4OEMwNDAiLz4KICA8Y2lyY2xlIGN4PSI2NiIgY3k9IjM0IiByPSI1IiBmaWxsPSIjNjhBODI4Ii8+CiAgPGNpcmNsZSBjeD0iNzgiIGN5PSIzNCIgcj0iNSIgZmlsbD0iIzQ4OTAxMCIvPgogIDxjaXJjbGUgY3g9IjkwIiBjeT0iMzQiIHI9IjUiIGZpbGw9IiMyODY4MDAiLz4KPC9zdmc+',url:'https://www.unibet.fr',color:'#3DB33D',size:44,w:110},{logo:'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcng9IjE4IiBmaWxsPSIjMDI3QjVCIi8+PHRleHQgeD0iNTAiIHk9IjM4IiBmb250LWZhbWlseT0iQXJpYWwgQmxhY2ssQXJpYWwsc2Fucy1zZXJpZiIgZm9udC13ZWlnaHQ9IjkwMCIgZm9udC1zaXplPSIzOCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJjZW50cmFsIj5iZXQ8L3RleHQ+PHRleHQgeD0iNTAiIHk9IjcyIiBmb250LWZhbWlseT0iQXJpYWwgQmxhY2ssQXJpYWwsc2Fucy1zZXJpZiIgZm9udC13ZWlnaHQ9IjkwMCIgZm9udC1zaXplPSIzOCIgZmlsbD0iI0Y1QzUxOCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9ImNlbnRyYWwiPjM2NTwvdGV4dD48L3N2Zz4=',url:'https://www.bet365.fr',color:'#027B5B',size:44},{logo:'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMTAgNDQiPgogIDxyZWN0IHdpZHRoPSIxMTAiIGhlaWdodD0iNDQiIHJ4PSI4IiBmaWxsPSIjMTExMTExIi8+CiAgPHRleHQgeD0iNTUiIHk9IjIyIiBmb250LWZhbWlseT0iQXJpYWwgQmxhY2ssSW1wYWN0LHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI5MDAiIGZvbnQtc2l6ZT0iMjYiIGZpbGw9IiNFODAwMEQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJjZW50cmFsIiB0ZXh0TGVuZ3RoPSIxMDIiIGxlbmd0aEFkanVzdD0ic3BhY2luZ0FuZEdseXBocyI+V0lOQU1BWDwvdGV4dD4KPC9zdmc+',url:'https://www.winamax.fr',color:'#111111',size:44,w:110},{logo:'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMTAgNDQiPgogIDxkZWZzPjxjbGlwUGF0aCBpZD0iYyI+PHJlY3Qgd2lkdGg9IjExMCIgaGVpZ2h0PSI0NCIgcng9IjgiLz48L2NsaXBQYXRoPjwvZGVmcz4KICA8cmVjdCB3aWR0aD0iMTEwIiBoZWlnaHQ9IjQ0IiByeD0iOCIgZmlsbD0iI0U4MTkyQyIvPgogIDxnIGNsaXAtcGF0aD0idXJsKCNjKSI+CiAgICA8bGluZSB4MT0iNjAiIHkxPSItNSIgeDI9IjExMCIgeTI9IjQ1IiBzdHJva2U9IiNGRjMzNDQiIHN0cm9rZS13aWR0aD0iNiIgb3BhY2l0eT0iMC41Ii8+CiAgICA8bGluZSB4MT0iNzIiIHkxPSItNSIgeDI9IjEyMiIgeTI9IjQ1IiBzdHJva2U9IiNGRjMzNDQiIHN0cm9rZS13aWR0aD0iNiIgb3BhY2l0eT0iMC41Ii8+CiAgICA8bGluZSB4MT0iODQiIHkxPSItNSIgeDI9IjEzNCIgeTI9IjQ1IiBzdHJva2U9IiNGRjMzNDQiIHN0cm9rZS13aWR0aD0iNiIgb3BhY2l0eT0iMC41Ii8+CiAgICA8cmVjdCB4PSIwIiB5PSI5IiB3aWR0aD0iMTEwIiBoZWlnaHQ9IjI2IiBmaWxsPSIjQjgxMDFGIi8+CiAgICA8dGV4dCB4PSI1NSIgeT0iMjIiIGZvbnQtZmFtaWx5PSJBcmlhbCBCbGFjayxBcmlhbCxzYW5zLXNlcmlmIiBmb250LXdlaWdodD0iOTAwIiBmb250LXNpemU9IjIwIiBmb250LXN0eWxlPSJpdGFsaWMiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0iY2VudHJhbCIgdGV4dExlbmd0aD0iOTYiIGxlbmd0aEFkanVzdD0ic3BhY2luZ0FuZEdseXBocyI+QmV0Y2xpYzwvdGV4dD4KICA8L2c+Cjwvc3ZnPg==',url:'https://www.betclic.fr',color:'#E8192C',size:44,w:110}];

  var SURF_FR = { 'Hard': 'Dur', 'Hard (Indoor)': 'Dur indoor', 'Clay': 'Terre battue', 'Grass': 'Gazon', 'Carpet': 'Moquette', 'Carpet (Indoor)': 'Moquette' };
  var SURF_GROUPE = { 'Hard': 'dur', 'Hard (Indoor)': 'dur', 'Carpet': 'dur', 'Carpet (Indoor)': 'dur', 'Clay': 'terre', 'Grass': 'gazon' };
  var BOOK = { Pncl: 'Pinnacle', '1xBet': '1xBet', bet365: 'bet365', Bwin: 'Bwin', Unibet: 'Unibet', Betway: 'Betway', 'William Hill': 'William Hill', 'Marathon': 'Marathonbet', '10Bet': '10Bet', 'Betfair': 'Betfair', 'Sbobet': 'Sbobet', 'Betsson': 'Betsson' };

  function api(qs) {
    return fetch('/api/tennis/?' + qs).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.success === 1 ? j.result : null; }).catch(function () { return null; });
  }
  function tourFr(r) {
    r = String(r || '');
    if (/final/i.test(r) && !/semi|quarter/i.test(r)) return 'Finale';
    if (/semi/i.test(r)) return 'Demi-finale';
    if (/quarter/i.test(r)) return 'Quart de finale';
    var n = /(\d+)(?:st|nd|rd|th)?\s*round/i.exec(r); if (n) return n[1] + 'e tour';
    if (/qualif/i.test(r)) return 'Qualifications';
    return r.replace(/^(ATP|WTA)\s+[^-]+-\s*/i, '');
  }
  window.NS_TOUR_FR = tourFr; // utilise par la carte « Match suivi » (favoris) du bundle
  function nomRonde(nom, idx, total) {
    var depuisFin = total - 1 - idx;
    if (depuisFin === 0) return 'Finale';
    if (depuisFin === 1) return 'Demi-finales';
    if (depuisFin === 2) return 'Quarts de finale';
    if (depuisFin === 3) return 'Huitièmes';
    return idx === 0 ? '1er tour' : (idx + 1) + 'e tour';
  }
  function setsDe(x) {
    return (x.scores || []).map(function (s) {
      var a = s.score_first, b = s.score_second;
      if (a == null || b == null || a === '' || b === '') return null;
      var p = function (v) { var m = /^(\d+)\.(\d+)$/.exec(String(v)); return m ? { j: +m[1], tb: +m[2] } : { j: +v, tb: null }; };
      return { a: p(a), b: p(b) };
    }).filter(Boolean);
  }
  function statutDe(x) {
    var st = String(x.event_status || '');
    if (!st) return 'upcoming';
    if (/finished|retired|walkover|w\.?o\.?|cancel|abandon|postponed/i.test(st)) return 'ended';
    if (String(x.event_live) === '1' || /set|live|break|delay|interrupt/i.test(st)) return 'live';
    return 'upcoming';
  }
  function heureLocale(date, time) {
    try { return new Date(date + 'T' + (time || '00:00') + ':00Z').toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: window._NS_TZ || 'Europe/Paris' }); } catch (e) { return time || ''; }
  }
  function dateFr(iso) {
    try { return new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return iso; }
  }
  function annee(iso) { return String(iso || '').slice(0, 4); }

  // ── hooks de donnees ──────────────────────────────────────────────────────
  function useFixture(cle, live) {
    var st = R.useState(null), x = st[0], setX = st[1];
    R.useEffect(function () {
      if (!cle) return;
      var vif = true;
      var charger = function () {
        // En direct : get_livescore (20 s) ; sinon get_fixtures (5 min). Le detail
        // (stats, point par point) n'est jamais cache pour la liste, seulement ici.
        // En direct : method=live (WebSocket -> Redis, 3 s de cache CDN), sinon get_fixtures.
        api(live ? 'method=live&match_key=' + cle : 'method=get_fixtures&match_key=' + cle + '&detail=1').then(function (r) {
          if (!vif) return;
          if (r && r.length) setX(r[0]);
          else if (live) api('method=get_fixtures&match_key=' + cle + '&detail=1').then(function (r2) { if (vif && r2 && r2.length) setX(r2[0]); });
        });
      };
      charger();
      var iv = live ? setInterval(charger, 4000) : null;
      return function () { vif = false; if (iv) clearInterval(iv); };
    }, [cle, live]);
    return x;
  }
  function useApi(qs, actif) {
    var st = R.useState({ d: null, ok: false }), e = st[0], setE = st[1];
    R.useEffect(function () {
      if (!actif || !qs) return;
      var vif = true;
      api(qs).then(function (r) { if (vif) setE({ d: r, ok: true }); });
      return function () { vif = false; };
    }, [qs, actif]);
    return e;
  }
  var cacheStd = {};
  function useClassement(circuit) {
    var st = R.useState(cacheStd[circuit] || null), l = st[0], setL = st[1];
    R.useEffect(function () {
      if (cacheStd[circuit]) { setL(cacheStd[circuit]); return; }
      var vif = true;
      api('method=get_standings&event_type=' + circuit).then(function (r) { if (r) { cacheStd[circuit] = r; if (vif) setL(r); } });
      return function () { vif = false; };
    }, [circuit]);
    return l;
  }
  function useTournois() {
    var st = R.useState({}), T = st[0], setT = st[1];
    R.useEffect(function () { var vif = true; if (window.NinjaTennisAPI && window.NinjaTennisAPI.tournois) window.NinjaTennisAPI.tournois().then(function (r) { if (vif) setT(r || {}); }); return function () { vif = false; }; }, []);
    return T;
  }

  // ── petits composants ─────────────────────────────────────────────────────
  function Avatar(props) {
    var st = R.useState(false), ko = st[0], setKo = st[1];
    var nom = props.nom || '?', taille = props.taille || 56;
    var init = nom.split(/[\s\/]+/).map(function (x) { return x.replace(/\./g, '').charAt(0); }).filter(Boolean).slice(0, 2).join('').toUpperCase();
    if (props.photo && !ko) return h('img', { src: props.photo, alt: nom, onError: function () { setKo(true); }, style: { width: taille, height: taille, borderRadius: '50%', objectFit: 'cover', background: props.t.cardAlt, border: '2px solid ' + props.t.border, flexShrink: 0 } });
    return h('div', { style: { width: taille, height: taille, borderRadius: '50%', background: props.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: Math.round(taille * 0.34), flexShrink: 0 } }, init || '?');
  }
  function Carte(props) {
    return h('div', { style: Object.assign({ background: props.t.card, borderRadius: 14, boxShadow: props.t.shadowCard, border: '1px solid ' + props.t.border, overflow: 'hidden', marginBottom: 14 }, props.style || {}) }, props.children);
  }
  function Titre(props) {
    return h('div', { style: { fontSize: 14, fontWeight: 800, color: props.t.text, margin: '4px 0 8px' } }, props.children);
  }
  function Vide(props) { return h('div', { style: { padding: 28, textAlign: 'center', color: props.t.textSec, fontSize: 13 } }, props.children); }
  function Chips(props) {
    return h('div', { style: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 10, scrollbarWidth: 'none' } },
      props.options.map(function (o) {
        var on = o[0] === props.valeur;
        return h('button', { key: o[0], onClick: function () { props.onChange(o[0]); }, style: { flexShrink: 0, border: '1px solid ' + (on ? props.accent : props.t.border), background: on ? props.accent : props.t.card, color: on ? '#fff' : props.t.textSec, borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' } }, o[1]);
      }));
  }

  // ── composant principal ───────────────────────────────────────────────────
  window.NS_FicheTennis = function (props) {
    var m = props.match, t = props.t, accent = props.accent;
    var tx = m.tennis || {};
    var cle = tx.cle || m.eventId;
    var k1 = tx.j1 && tx.j1.cle, k2 = tx.j2 && tx.j2.cle;
    var circuit = m.competition === 'WTA' ? 'WTA' : 'ATP';
    var mineur = !!window.NS_HIDE_ODDS;

    var etatInit = m.status || 'upcoming';
    var x = useFixture(cle, etatInit === 'live');
    var statut = x ? statutDe(x) : etatInit;
    // Si le match passe en direct apres ouverture, on rebranche le polling court.
    var xLive = useFixture(statut === 'live' && etatInit !== 'live' ? cle : null, true);
    if (xLive) x = xLive;

    var n1 = (x && x.event_first_player) || (tx.j1 && tx.j1.nom) || String(m.homeTeam || '').split(': ').slice(1).join(': ');
    var n2 = (x && x.event_second_player) || (tx.j2 && tx.j2.nom) || m.awayTeam || '';
    var photo1 = (x && x.event_first_player_logo) || (tx.j1 && tx.j1.photo);
    var photo2 = (x && x.event_second_player_logo) || (tx.j2 && tx.j2.photo);
    var T = useTournois();
    var infoT = T[String(tx.tournoiCle)] || {};
    var surface = tx.surface || infoT.surface || null;
    var pays = tx.pays || infoT.pays || null;
    var tournoi = tx.tournoi || (x && x.tournament_name) || String(m.homeTeam || '').split(': ')[0];
    var tour = tourFr((x && x.tournament_round) || tx.tour);

    // Classement : on cherche dans les deux circuits (un match ouvert depuis les favoris ou les
    // pronostics n'a pas toujours son circuit renseigne) et on affiche celui ou le joueur figure.
    var clATP = useClassement('ATP'), clWTA = useClassement('WTA');
    var rangDe = function (k) {
      if (!k) return null;
      var cherche = function (l, c) { if (!l) return null; for (var i = 0; i < l.length; i++) if (String(l[i].player_key) === String(k)) return Object.assign({ circuit: c }, l[i]); return null; };
      return (circuit === 'WTA' ? (cherche(clWTA, 'WTA') || cherche(clATP, 'ATP')) : (cherche(clATP, 'ATP') || cherche(clWTA, 'WTA')));
    };
    var r1 = rangDe(k1), r2 = rangDe(k2);

    var tabs = [['resume', 'Résumé'], ['pbp', 'Point par point'], ['cotes', 'Cotes'], ['pronostics', 'Pronostics'], ['tat', 'TàT'], ['tableau', 'Tableau']].filter(function (o) { return !(mineur && (o[0] === 'cotes' || o[0] === 'pronostics')); });
    var tb = R.useState('resume'), tab = tb[0], setTab = tb[1];

    var h2h = useApi(k1 && k2 ? 'method=get_H2H&first_player_key=' + k1 + '&second_player_key=' + k2 : null, true);
    var cotes = useApi(!mineur && cle ? 'method=get_odds&match_key=' + cle : null, tab === 'cotes' || tab === 'pronostics' || tab === 'resume');
    var tableau = useApi(tx.tournoiCle ? 'method=get_draw&tournament_key=' + tx.tournoiCle : null, tab === 'tableau');

    var sets = x ? setsDe(x) : [];
    var serveur = x && statut === 'live' ? x.event_serve : null;
    var jeu = x && statut === 'live' && x.event_game_result && x.event_game_result !== '-' ? x.event_game_result : null;
    var gagnant = x && statut === 'ended' ? x.event_winner : null;
    var setsGagnes = function (cote) { return sets.filter(function (s) { return cote === 'a' ? s.a.j > s.b.j : s.b.j > s.a.j; }).length; };

    // ── en-tete ──
    var joueur = function (nom, photo, rang, cote) {
      var vainqueur = gagnant === (cote === 'a' ? 'First Player' : 'Second Player');
      return h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 } },
        h('div', { style: { position: 'relative' } },
          h(Avatar, { nom: nom, photo: photo, taille: 64, t: t, accent: accent }),
          serveur === (cote === 'a' ? 'First Player' : 'Second Player') ? h('span', { title: 'Au service', style: { position: 'absolute', right: -4, bottom: -2, fontSize: 16, fontFamily: EMOJI } }, '🎾') : null),
        h('div', { style: { fontSize: 14, fontWeight: 800, color: t.text, textAlign: 'center', lineHeight: 1.2 } }, nom),
        h('div', { style: { fontSize: 11, fontWeight: 700, color: vainqueur ? '#10B981' : t.textSec, display: 'flex', gap: 4, alignItems: 'center' } },
          rang && rang.country ? h('span', { style: { fontFamily: EMOJI } }, U.drapeauPays(rang.country)) : null,
          rang ? 'N°' + rang.place + ' ' + (rang.circuit || circuit) : '',
          vainqueur ? ' · Vainqueur' : ''));
    };
    var centre = (function () {
      if (statut === 'upcoming') return h('div', { style: { textAlign: 'center', flexShrink: 0, minWidth: 84 } },
        h('div', { style: { fontSize: 26, fontWeight: 900, color: accent, letterSpacing: 1 } }, x ? heureLocale(x.event_date, x.event_time) : ''),
        h('div', { style: { fontSize: 11, fontWeight: 700, color: t.textSec } }, x ? dateFr(x.event_date) : ''));
      var couleur = statut === 'live' ? '#EF4444' : t.text;
      return h('div', { style: { textAlign: 'center', flexShrink: 0, minWidth: 84 } },
        h('div', { style: { fontSize: 30, fontWeight: 900, color: couleur, letterSpacing: 2 } }, setsGagnes('a') + ' - ' + setsGagnes('b')),
        h('div', { style: { fontSize: 11, fontWeight: 800, color: couleur } }, statut === 'live' ? ((x && x.event_status) || 'En cours') + (jeu ? ' · ' + jeu : '') : 'Terminé'));
    })();

    var sousTitre = [pays ? U.drapeau(pays) : null, tournoi + (tour ? ' · ' + tour : ''), surface ? SURF_FR[surface] || surface : null].filter(Boolean);

    // ── onglet Resume ──
    var rendreScore = function () {
      if (statut === 'upcoming' || (!sets.length && !jeu)) return null;
      var cellule = function (txt, fort, cle2) { return h('div', { key: cle2, style: { width: 30, textAlign: 'center', fontSize: 15, fontWeight: fort ? 900 : 600, color: fort ? t.text : t.textSec, position: 'relative' } }, txt); };
      var ligne = function (nom, cote) {
        return h('div', { style: { display: 'flex', alignItems: 'center', padding: '9px 14px', borderTop: cote === 'b' ? '1px solid ' + t.divider : 'none' } },
          h('div', { style: { flex: 1, fontSize: 13, fontWeight: 700, color: t.text, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } },
            h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, nom),
            serveur === (cote === 'a' ? 'First Player' : 'Second Player') ? h('span', { style: { fontSize: 12, fontFamily: EMOJI } }, '🎾') : null),
          sets.map(function (s, i) {
            var moi = s[cote], lui = s[cote === 'a' ? 'b' : 'a'];
            return h('div', { key: i, style: { width: 30, textAlign: 'center' } },
              h('span', { style: { fontSize: 15, fontWeight: moi.j > lui.j ? 900 : 600, color: moi.j > lui.j ? t.text : t.textSec } }, moi.j),
              moi.tb != null ? h('sup', { style: { fontSize: 9, color: t.textTer, marginLeft: 1 } }, moi.tb) : null);
          }),
          jeu ? cellule(jeu.split('-')[cote === 'a' ? 0 : 1].trim(), true, 'jeu') : null);
      };
      return h(Carte, { t: t },
        h('div', { style: { display: 'flex', padding: '6px 14px 0', justifyContent: 'flex-end', gap: 0 } },
          sets.map(function (s, i) { return h('div', { key: i, style: { width: 30, textAlign: 'center', fontSize: 10, fontWeight: 800, color: t.textTer } }, 'S' + (i + 1)); }),
          jeu ? h('div', { style: { width: 30, textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#EF4444' } }, 'Jeu') : null),
        ligne(n1, 'a'), ligne(n2, 'b'));
    };
    var rendreStats = function () {
      var stats = (x && x.statistics) || [];
      if (!stats.length) return null;
      var parNom = {}, ordre = [];
      stats.forEach(function (s) {
        if (s.stat_period && s.stat_period !== 'match') return;
        var k = s.stat_name; if (!parNom[k]) { parNom[k] = {}; ordre.push(k); }
        parNom[k][String(s.player_key) === String(k1) ? 'a' : 'b'] = s;
      });
      var num = function (v) { var mm = /([\d.]+)\s*%/.exec(String(v || '')); if (mm) return +mm[1]; var n = parseFloat(String(v || '').replace(',', '.')); return isNaN(n) ? 0 : n; };
      var FR = { 'aces': 'Aces', 'double faults': 'Doubles fautes', '1st serve percentage': '% 1re balle', '1st serve points won': 'Points gagnés 1re balle', '2nd serve points won': 'Points gagnés 2e balle', 'break points saved': 'Balles de break sauvées', 'break points converted': 'Balles de break converties', 'winners': 'Coups gagnants', 'unforced errors': 'Fautes directes', 'total points won': 'Points gagnés', 'service games played': 'Jeux de service', 'return games played': 'Jeux en retour', '1st return points won': 'Retours gagnés 1re balle', '2nd return points won': 'Retours gagnés 2e balle', 'max points in a row': 'Points d’affilée (max)', 'service points won': 'Points gagnés au service', 'return points won': 'Points gagnés en retour', 'receiver points won': 'Points gagnés en retour', 'max games in a row': 'Jeux d’affilée (max)', 'last 10 balls': '10 derniers points', 'match points saved': 'Balles de match sauvées', 'service games won': 'Jeux de service gagnés', 'return games won': 'Jeux en retour gagnés', 'total games won': 'Jeux gagnés', 'break points won': 'Balles de break gagnées', 'tiebreaks won': 'Tie-breaks gagnés', 'points won': 'Points gagnés', 'service games lost': 'Jeux de service perdus', 'games won': 'Jeux gagnés', 'sets won': 'Sets gagnés' };
      var FRold = { 'Aces': 'Aces', 'Double Faults': 'Doubles fautes', '1st serve percentage': '% 1re balle', '1st serve points won': 'Points gagnés 1re balle', '2nd serve points won': 'Points gagnés 2e balle', 'Break points saved': 'Balles de break sauvées', 'Break points converted': 'Balles de break converties', 'Winners': 'Coups gagnants', 'Unforced errors': 'Fautes directes', 'Total points won': 'Points gagnés', 'Service games played': 'Jeux de service', 'Return games played': 'Jeux en retour', '1st return points won': 'Retours gagnés 1re balle', '2nd return points won': 'Retours gagnés 2e balle', 'Max points in a row': 'Points d’affilée (max)', 'Service points won': 'Points au service', 'Receiver points won': 'Points en retour', 'Max games in a row': 'Jeux d’affilée (max)' };
      return h(R.Fragment, null, h(Titre, { t: t }, 'Statistiques'),
        h(Carte, { t: t }, ordre.map(function (k, i) {
          var a = parNom[k].a, b = parNom[k].b; var va = a ? a.stat_value : '–', vb = b ? b.stat_value : '–';
          var na = num(va), nb = num(vb), tot = na + nb || 1;
          var moins = /fault|error/i.test(k);
          var aMieux = moins ? na < nb : na > nb;
          return h('div', { key: k, style: { padding: '9px 14px', borderTop: i ? '1px solid ' + t.divider : 'none' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 800, color: t.text, marginBottom: 5 } },
              h('span', { style: { color: aMieux && na !== nb ? accent : t.text } }, va), h('span', { style: { fontSize: 11.5, fontWeight: 700, color: t.textSec } }, FR[String(k).toLowerCase()] || k), h('span', { style: { color: !aMieux && na !== nb ? accent : t.text } }, vb)),
            h('div', { style: { display: 'flex', gap: 4, height: 5 } },
              h('div', { style: { flex: 1, background: t.cardAlt, borderRadius: 3, overflow: 'hidden', display: 'flex', justifyContent: 'flex-end' } }, h('div', { style: { width: (na / tot * 100) + '%', background: accent, opacity: aMieux ? 1 : .35 } })),
              h('div', { style: { flex: 1, background: t.cardAlt, borderRadius: 3, overflow: 'hidden' } }, h('div', { style: { width: (nb / tot * 100) + '%', background: accent, opacity: !aMieux ? 1 : .35, height: '100%' } }))));
        })));
    };
    var sp = R.useState(null), setChoisi = sp[0], setSetChoisi = sp[1];
    var rendrePbp = function () {
      var pbp = (x && x.pointbypoint) || [];
      if (!pbp.length) return h(Vide, { t: t }, statut === 'upcoming' ? 'Le point par point apparaîtra au coup d’envoi.' : (x ? 'Point par point indisponible pour ce match.' : 'Chargement…'));
      var parSet = {}, ordre = [];
      pbp.forEach(function (g) { var k = String(g.set_number || 'Set 1'); if (!parSet[k]) { parSet[k] = []; ordre.push(k); } parSet[k].push(g); });
      var courant = (setChoisi != null && parSet[setChoisi]) ? setChoisi : ordre[ordre.length - 1];
      var numSet = (/(\d+)/.exec(courant) || [])[1] || (ordre.indexOf(courant) + 1);
      var jeux = parSet[courant];
      var badge = function (txt, fond, couleur) { return h('span', { style: { fontSize: 9, fontWeight: 900, letterSpacing: .6, textTransform: 'uppercase', color: couleur || '#fff', background: fond, borderRadius: 6, padding: '3px 7px', flexShrink: 0 } }, txt); };
      var balle = h('span', { style: { fontSize: 14, lineHeight: 1, fontFamily: EMOJI } }, '🎾');
      return h(R.Fragment, null,
        h(Chips, { t: t, accent: accent, valeur: courant, onChange: setSetChoisi, options: ordre.map(function (k, i) { return [k, ((/(\d+)/.exec(k) || [])[1] || (i + 1)) + '. SET']; }) }),
        h(Carte, { t: t },
          h('div', { style: { padding: '10px 14px', fontSize: 14, fontWeight: 800, color: t.text, borderBottom: '1px solid ' + t.divider } }, 'Point par point · ' + numSet + '. set'),
          jeux.map(function (g, i) {
            var servA = g.player_served === 'First Player';
            var brk = !!g.serve_lost;
            var sc = String(g.score || '').split('-').map(function (v) { return v.trim(); });
            var pts = g.points || [];
            return h('div', { key: i, style: { padding: '10px 12px', borderTop: i ? '1px solid ' + t.divider : 'none', background: brk ? (accent + '12') : 'transparent', borderLeft: brk ? '3px solid ' + accent : '3px solid transparent' } },
              h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 } },
                servA ? (brk ? badge('Service perdu', accent) : null) : null,
                servA ? balle : h('span', { style: { width: 14 } }),
                h('span', { style: { fontSize: 20, fontWeight: 900, letterSpacing: 1, fontVariantNumeric: 'tabular-nums' } },
                  h('span', { style: { color: servA ? '#EF4444' : t.text } }, sc[0] || ''), h('span', { style: { color: t.textTer } }, '-'), h('span', { style: { color: !servA ? '#EF4444' : t.text } }, sc[1] || '')),
                !servA ? balle : h('span', { style: { width: 14 } }),
                !servA ? (brk ? badge('Service perdu', accent) : null) : null),
              h('div', { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 5 } }, pts.map(function (p, j) {
                var special = p.match_point ? 'BM' : p.set_point ? 'BS' : p.break_point ? 'BB' : null;
                return h('span', { key: j, style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 7, border: '1px solid ' + (special ? accent : t.border), background: special ? (accent + '14') : t.card, color: special ? accent : t.text, fontVariantNumeric: 'tabular-nums' } },
                  String(p.score || '').replace(/\s/g, '').replace('-', ':'),
                  special ? h('span', { style: { fontSize: 9, fontWeight: 900, background: accent, color: '#fff', borderRadius: 4, padding: '1px 4px' } }, special) : null);
              })));
          })),
        h('div', { style: { fontSize: 10.5, color: t.textTer, padding: '0 4px 12px', lineHeight: 1.5 } }, 'La balle marque le serveur. BB balle de break, BS balle de set, BM balle de match.'));
    };
    var bilanH2H = function () {
      var l = (h2h.d && h2h.d.H2H) || [];
      var wa = 0, wb = 0;
      l.forEach(function (e) { var aEstK1 = String(e.first_player_key) === String(k1); var w1 = e.event_winner === 'First Player'; if ((aEstK1 && w1) || (!aEstK1 && !w1)) wa++; else wb++; });
      return { wa: wa, wb: wb, n: l.length };
    };
    var rendreResume = function () {
      var bh = bilanH2H();
      return h(R.Fragment, null,
        rendreScore(),
        statut === 'upcoming' ? h(Carte, { t: t }, h('div', { style: { padding: '14px', fontSize: 13, color: t.textSec, lineHeight: 1.5 } },
          h('div', { style: { fontWeight: 800, color: t.text, marginBottom: 4 } }, 'Avant-match'),
          h('div', null, bh.n ? 'Tête-à-tête : ' + n1 + ' mène ' + bh.wa + ' - ' + bh.wb + '.' : (h2h.ok ? 'Première confrontation.' : 'Chargement du tête-à-tête…')),
          r1 && r2 ? h('div', null, 'Classement : n°' + r1.place + ' contre n°' + r2.place + '.') : null,
          h('div', null, 'Coup d’envoi ' + (x ? 'à ' + heureLocale(x.event_date, x.event_time) : (m.startDate ? 'à ' + new Date(m.startDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: window._NS_TZ || 'Europe/Paris' }) : '')) + '.'))) : null,
        rendreStats(),
        !x ? h(Vide, { t: t }, 'Chargement…') : null);
    };

    // ── outils communs aux onglets Cotes / Pronostics / TàT (meme structure que le foot) ──
    var estFR = !(window.NS_GEO && window.NS_GEO.actif && window.NS_GEO.actif().code && window.NS_GEO.actif().code !== 'FR');
    var bandeauANJ = function () {
      if (!estFR) return null;
      return h('div', { style: { background: '#FFE24D', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, marginBottom: 14 } },
        h('p', { style: { flex: 1, minWidth: 0, margin: 0, fontSize: 10.5, lineHeight: 1.42, fontWeight: 800, color: '#111', textTransform: 'uppercase' } }, 'Les jeux d’argent et de hasard peuvent être dangereux : pertes d’argent, conflits familiaux, addiction… Retrouvez nos conseils sur joueurs-info-service.fr (09 74 75 13 13 - appel non surtaxé)'),
        h('div', { style: { width: 34, height: 34, borderRadius: '50%', border: '3px solid #E11D48', color: '#E11D48', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#fff' } }, '-18'));
    };
    // Partenaires : logos du foot (NS_BKMS_FR) + offres (NS_BONUS_LIST) ; hors France, partenaires du pays.
    var partenaires = (function () {
      var geo = window.NS_GEO && window.NS_GEO.actif ? window.NS_GEO.actif() : null;
      if (geo && geo.code !== 'FR' && window.NS_BKMS_GEO) {
        try { var l = window.NS_BKMS_GEO() || []; if (l.length) return l.map(function (b) { return { logo: b.logo, url: b.url, color: b.color, nom: b.nom, offre: b.offre || 'Bonus de bienvenue', w: b.w, size: b.size }; }); } catch (e) {}
      }
      var liste = (window.NS_BONUS_LIST ? window.NS_BONUS_LIST() : (window.NS_BOOKMAKERS || []));
      var COURT = { winamax: '100€ EN CASH', unibet: '100€ OFFERTS', betclic: '100€ OFFERTS', pmu: '100€ REMBOURSÉS' };
      var logos = window.NS_BKMS_FR || [];
      return liste.map(function (b) {
        var dom = (b.slug || '').toLowerCase();
        var lg = logos.filter(function (x) { return String(x.url || '').indexOf(dom) >= 0; })[0];
        return { logo: lg && lg.logo, url: b.url, color: b.couleur || (lg && lg.color) || accent, nom: b.nom, offre: COURT[b.slug] || b.offre || 'Bonus de bienvenue', w: lg && lg.w, size: lg && lg.size };
      });
    })();
    var bandeOffre = function (i) {
      if (!partenaires.length) return null;
      var bk = partenaires[i % partenaires.length];
      return h('a', { href: bk.url, target: '_blank', rel: 'noopener sponsored', style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: t.bg, borderRadius: 12, border: '1px solid ' + t.border, textDecoration: 'none', marginBottom: 16 } },
        h('span', { style: { fontSize: 18, fontFamily: EMOJI } }, '🎁'),
        bk.logo ? h('img', { src: bk.logo, alt: bk.nom, style: { height: 26, width: 'auto', maxWidth: 74, borderRadius: 6, flexShrink: 0, display: 'block' } }) : h('span', { style: { fontSize: 15, fontWeight: 900, color: bk.color, whiteSpace: 'nowrap' } }, bk.nom),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { style: { fontSize: 9, fontWeight: 700, color: t.textSec, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 } }, 'Offre de bienvenue'),
          h('div', { style: { fontSize: 15, fontWeight: 900, color: accent, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, bk.offre)),
        h('div', { style: { background: bk.color, borderRadius: 8, padding: '7px 10px', color: window.NS_TXTON ? window.NS_TXTON(bk.color) : '#fff', fontSize: 9, fontWeight: 800, letterSpacing: 0.5, flexShrink: 0, whiteSpace: 'nowrap' } }, "S'INSCRIRE"));
    };
    var bandeParier = function (i) {
      if (!partenaires.length) return null;
      var bk = partenaires[i % partenaires.length];
      var txt = window.NS_TXTON ? window.NS_TXTON(bk.color) : '#fff';
      return h('a', { href: bk.url, target: '_blank', rel: 'noopener sponsored', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '10px 16px', background: bk.color, borderTop: '1px solid rgba(0,0,0,0.1)', textDecoration: 'none', width: '100%', boxSizing: 'border-box' } },
        bk.logo ? h('img', { src: bk.logo, alt: bk.nom, style: { width: bk.w || bk.size || 28, height: bk.size || 28, borderRadius: 6, flexShrink: 0, objectFit: 'contain' } }) : h('span', { style: { fontSize: 16, fontWeight: 900, color: txt, letterSpacing: 0.5 } }, bk.nom),
        h('span', { style: { fontSize: 12, fontWeight: 700, color: txt, letterSpacing: 0.3 } }, 'Je parie'),
        h('span', { style: { fontSize: 13, color: txt } }, '›'));
    };
    var titreMarche = function (txt) { return h('div', { style: { fontSize: 11, fontWeight: 700, color: t.textSec, letterSpacing: 1.2, textTransform: 'uppercase', margin: '0 0 10px' } }, txt); };

    var marche = function (nom) { return (cotes.d && cotes.d[String(cle)] && cotes.d[String(cle)][nom]) || null; };
    var meilleureDe = function (obj) {
      if (!obj) return null; var best = null;
      Object.keys(obj).forEach(function (b) { var o = parseFloat(obj[b]); if (o > 1 && (!best || o > best.o)) best = { o: o, b: BOOK[b] || b }; });
      return best;
    };
    var meilleures = function (nom, cle2) { var mk = marche(nom); return mk ? meilleureDe(mk[cle2]) : null; };
    var meilleuresOU = function (nom, ligne, sens) { var mk = marche(nom); if (!mk) return null; var v = mk[nom + ' ' + sens]; return v ? meilleureDe(v[ligne]) : null; };
    var pctImplicite = function (o, autres) { var inv = 1 / o; var tot = inv; (autres || []).forEach(function (x) { if (x) tot += 1 / x.o; }); return Math.round(inv / tot * 100); };

    // Carte de cote « foot » : libelle, sous-libelle, cote, % implicite, barre.
    var carteCote = function (lib, sous, best, pct, cle2) {
      return h('div', { key: cle2, style: { flex: 1, minWidth: 0, background: t.card, borderRadius: 12, border: '1px solid ' + t.border, padding: '10px 10px 8px', textAlign: 'center' } },
        h('div', { style: { fontSize: 11.5, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, lib),
        sous ? h('div', { style: { fontSize: 9.5, color: t.textTer, marginBottom: 4 } }, sous) : h('div', { style: { height: 4 } }),
        h('div', { style: { fontSize: 20, fontWeight: 900, color: best ? accent : t.textTer, lineHeight: 1.1 } }, best ? best.o.toFixed(2) : '–'),
        h('div', { style: { fontSize: 9.5, fontWeight: 700, color: t.textSec, marginTop: 2 } }, best ? (pct != null ? pct + ' %' : best.b) : ''),
        h('div', { style: { height: 3, background: t.cardAlt, borderRadius: 2, marginTop: 6, overflow: 'hidden' } }, h('div', { style: { width: (pct || 0) + '%', height: '100%', background: accent } })));
    };
    var tableauOU = function (nom, lignes, unite) {
      if (!lignes.length) return null;
      return h(Carte, { t: t },
        h('div', { style: { display: 'flex', padding: '8px 12px 4px', fontSize: 9.5, fontWeight: 700, color: t.textTer, textTransform: 'uppercase', letterSpacing: .5 } }, h('div', { style: { flex: 1 } }, '+'), h('div', { style: { width: 70, textAlign: 'center' } }, 'Ligne'), h('div', { style: { flex: 1, textAlign: 'right' } }, 'Moins')),
        lignes.map(function (l, i) {
          var o = meilleuresOU(nom, l, 'Over'), u = meilleuresOU(nom, l, 'Under');
          var po = o && u ? pctImplicite(o.o, [u]) : null, pu = o && u ? 100 - po : null;
          var cel = function (b, p, droite) { return h('div', { style: { flex: 1, textAlign: droite ? 'right' : 'left' } }, h('div', { style: { fontSize: 16, fontWeight: 900, color: b ? accent : t.textTer } }, b ? b.o.toFixed(2) : '–'), h('div', { style: { fontSize: 9.5, fontWeight: 700, color: t.textSec } }, p != null ? p + ' %' : (b ? b.b : ''))); };
          return h('div', { key: l, style: { display: 'flex', alignItems: 'center', padding: '9px 12px', borderTop: '1px solid ' + t.divider } },
            cel(o, po, false), h('div', { style: { width: 70, textAlign: 'center', fontSize: 12, fontWeight: 800, color: t.text } }, l.replace('.', ',') + (unite ? ' ' + unite : '')), cel(u, pu, true));
        }));
    };

    // ── onglet Cotes ──
    var rendreCotes = function () {
      if (!cotes.ok) return h(Vide, { t: t }, 'Chargement des cotes…');
      var w1 = meilleures('Home/Away', 'Home'), w2 = meilleures('Home/Away', 'Away');
      if (!w1 && !w2) return h(R.Fragment, null, bandeauANJ(), h(Vide, { t: t }, 'Pas de cotes disponibles pour ce match.'));
      var p1 = w1 && w2 ? pctImplicite(w1.o, [w2]) : null;
      var s1 = meilleures('Home/Away (1st Set)', 'Home'), s2 = meilleures('Home/Away (1st Set)', 'Away');
      var ps1 = s1 && s2 ? pctImplicite(s1.o, [s2]) : null;
      var mkS = marche('Over/Under') || {}; var lignesS = Object.keys(mkS['Over/Under Over'] || {}).filter(function (l) { return /\.5$/.test(l); }).slice(0, 2);
      var mkG = marche('Over/Under by Games in Match') || {}; var lignesG = Object.keys(mkG['Over/Under by Games in Match Over'] || {}).filter(function (l) { return /\.5$/.test(l); }).sort(function (a, b) { return a - b; });
      if (lignesG.length > 5) { var mid = lignesG.length / 2; lignesG = lignesG.slice(Math.max(0, Math.floor(mid) - 2), Math.floor(mid) + 3); }
      var scoreExact = marche('Correct Score') || marche('Set Betting') || marche('Correct Score (Sets)');
      var lignesSE = scoreExact ? Object.keys(scoreExact).filter(function (k) { return /^\d\s*[-:]\s*\d$/.test(k); }) : [];
      var i = 0;
      return h(R.Fragment, null,
        bandeauANJ(),
        bandeOffre(i++),
        titreMarche('Vainqueur du match'),
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 20 } }, carteCote(n1, 'Vainqueur', w1, p1, 'w1'), carteCote(n2, 'Vainqueur', w2, p1 != null ? 100 - p1 : null, 'w2')),
        (s1 || s2) ? h(R.Fragment, null, bandeOffre(i++), titreMarche('Vainqueur du 1er set'), h('div', { style: { display: 'flex', gap: 8, marginBottom: 20 } }, carteCote(n1, '1er set', s1, ps1, 's1'), carteCote(n2, '1er set', s2, ps1 != null ? 100 - ps1 : null, 's2'))) : null,
        lignesS.length ? h(R.Fragment, null, bandeOffre(i++), titreMarche('Nombre de sets'), tableauOU('Over/Under', lignesS, 'sets')) : null,
        lignesG.length ? h(R.Fragment, null, bandeOffre(i++), titreMarche('Nombre de jeux'), tableauOU('Over/Under by Games in Match', lignesG, 'jeux')) : null,
        lignesSE.length ? h(R.Fragment, null, bandeOffre(i++), titreMarche('Score exact (sets)'), h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 } }, lignesSE.map(function (k) { var b = meilleureDe(scoreExact[k]); return h('div', { key: k, style: { background: t.card, borderRadius: 12, border: '1px solid ' + t.border, padding: '10px 6px', textAlign: 'center' } }, h('div', { style: { fontSize: 12, fontWeight: 800, color: t.text } }, k.replace(/\s/g, '').replace(':', '-')), h('div', { style: { fontSize: 15, fontWeight: 900, color: accent, marginTop: 2 } }, b ? b.o.toFixed(2) : '–')); }))) : null,
        h('div', { style: { fontSize: 10.5, color: t.textTer, lineHeight: 1.5, padding: '0 4px 12px' } }, 'Meilleure cote parmi les bookmakers suivis (source ' + ((w1 && w1.b) || 'Pinnacle') + ', 45 min de délai possible). Jouer comporte des risques : endettement, isolement, dépendance. Appelez le 09 74 75 13 13 (appel non surtaxé).'));
    };

    // ── tendances des 2 joueurs (10 derniers matchs) ──
    var analyser = function (liste, k) {
      return (liste || []).slice(0, 10).map(function (e) {
        var aEstK = String(e.first_player_key) === String(k);
        var gagne = (aEstK && e.event_winner === 'First Player') || (!aEstK && e.event_winner === 'Second Player');
        var sets = (e.scores || []).map(function (q) { var a = String(q.score_first || ''), b = String(q.score_second || ''); if (!a || !b || (a === '0' && b === '0')) return null; return { a: parseInt(a, 10) || 0, b: parseInt(b, 10) || 0, tb: /\./.test(a) || /\./.test(b) || (parseInt(a, 10) >= 6 && parseInt(b, 10) >= 6) }; }).filter(Boolean);
        var moi = function (s) { return aEstK ? s.a : s.b; }, lui = function (s) { return aEstK ? s.b : s.a; };
        var jeux = sets.reduce(function (acc, s) { return acc + s.a + s.b; }, 0);
        var premierSet = sets.length ? moi(sets[0]) > lui(sets[0]) : null;
        var setsPerdus = sets.filter(function (s) { return lui(s) > moi(s); }).length;
        var tt = T[String(e.tournament_key)] || {};
        return { gagne: gagne, nbSets: sets.length, jeux: jeux, tb: sets.some(function (s) { return s.tb; }), premierSet: premierSet, concede: setsPerdus > 0, surface: tt.surface || null, adv: aEstK ? e.event_second_player : e.event_first_player, tournoi: e.tournament_name, date: e.event_date };
      });
    };
    var EVENEMENTS = [
      { id: 'gagne', label: 'Gagne le match', f: function (m) { return m.gagne; } },
      { id: 'set1', label: 'Gagne le 1er set', f: function (m) { return m.premierSet === true; } },
      { id: 'sets3', label: 'Match en 3 sets', f: function (m) { return m.nbSets >= 3; } },
      { id: 'sets2', label: 'Match en 2 sets', f: function (m) { return m.nbSets === 2; } },
      { id: 'tb', label: 'Tie-break disputé', f: function (m) { return m.tb; } },
      { id: 'jeux', label: 'Plus de 21,5 jeux', f: function (m) { return m.jeux > 21.5; } },
      { id: 'concede', label: 'Concède un set', f: function (m) { return m.concede; } }
    ];
    var freq = function (L, ev) { var n = L.length; if (!n) return { n: 0, x: 0, p: 0 }; var x = L.filter(ev.f).length; return { n: n, x: x, p: Math.round(x / n * 100) }; };
    var chipsForme = function (L, nb) {
      return h('div', { style: { display: 'flex', gap: 3, flexWrap: 'wrap' } }, L.slice(0, nb || 10).map(function (m, i) {
        return h('span', { key: i, style: { width: 22, height: 22, borderRadius: 5, background: m.gagne ? '#22C55E' : '#EF4444', color: '#fff', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, m.gagne ? 'V' : 'D');
      }));
    };
    var carteTendances = function (LA, LB) {
      var enTete = function (nom, L, couleur) {
        var v = L.filter(function (m) { return m.gagne; }).length;
        var jm = L.length ? (L.reduce(function (a, m) { return a + m.jeux; }, 0) / L.length).toFixed(1).replace('.', ',') : '–';
        return h('div', { style: { padding: '10px 14px 6px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: t.text } }, h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: couleur } }), nom),
            h('div', { style: { fontSize: 10.5, fontWeight: 700, color: t.textSec } }, v + 'V ' + (L.length - v) + 'D · ' + jm + ' jeux/match')),
          chipsForme(L));
      };
      var ligne = function (ev, i) {
        var a = freq(LA, ev), b = freq(LB, ev);
        var badge = function (r, couleur) { return h('div', { style: { width: 44, flexShrink: 0, background: couleur, color: '#fff', borderRadius: 7, padding: '3px 0', textAlign: 'center', lineHeight: 1.05 } }, h('div', { style: { fontSize: 11, fontWeight: 900 } }, r.p + '%'), h('div', { style: { fontSize: 8.5, fontWeight: 700, opacity: .9 } }, r.x + '/' + r.n)); };
        return h('div', { key: ev.id, style: { padding: '8px 14px', borderTop: '1px solid ' + t.divider } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } }, badge(a, accent), h('div', { style: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: t.text } }, ev.label), badge(b, '#F59E0B')),
          h('div', { style: { display: 'flex', gap: 6, marginTop: 6 } },
            h('div', { style: { flex: 1, height: 4, background: t.cardAlt, borderRadius: 2, overflow: 'hidden', display: 'flex', justifyContent: 'flex-end' } }, h('div', { style: { width: a.p + '%', background: accent } })),
            h('div', { style: { flex: 1, height: 4, background: t.cardAlt, borderRadius: 2, overflow: 'hidden' } }, h('div', { style: { width: b.p + '%', height: '100%', background: '#F59E0B' } }))));
      };
      return h(Carte, { t: t },
        h('div', { style: { padding: '12px 14px 4px' } },
          h('div', { style: { fontSize: 10, fontWeight: 800, color: accent, letterSpacing: 1.1, textTransform: 'uppercase' } }, 'Tendances des 2 joueurs'),
          h('div', { style: { fontSize: 11, color: t.textSec, marginTop: 3, lineHeight: 1.4 } }, 'Fréquence de chaque événement sur les ', h('span', { style: { fontWeight: 800, color: t.text } }, '10 derniers matchs'), ' de chaque joueur.')),
        enTete(n1, LA, accent), enTete(n2, LB, '#F59E0B'),
        EVENEMENTS.map(ligne),
        h('div', { style: { padding: '8px 14px 12px', fontSize: 9.5, color: t.textTer, lineHeight: 1.4 } }, h('span', { style: { color: '#22C55E', fontWeight: 800 } }, 'V'), ' Victoire · ', h('span', { style: { color: '#EF4444', fontWeight: 800 } }, 'D'), ' Défaite. Une fréquence élevée ne garantit pas le résultat.'));
    };

    // ── onglet Pronostics ──
    var rendrePronos = function () {
      if (!cotes.ok || !h2h.ok) return h(R.Fragment, null, bandeauANJ(), h(Vide, { t: t }, 'Calcul des pronostics…'));
      var LA = analyser(h2h.d && h2h.d.firstPlayerResults, k1), LB = analyser(h2h.d && h2h.d.secondPlayerResults, k2);
      var w1 = meilleures('Home/Away', 'Home'), w2 = meilleures('Home/Away', 'Away');
      var pCotes = w1 && w2 ? (1 / w1.o) / (1 / w1.o + 1 / w2.o) : null;
      var bh = bilanH2H();
      var pH2H = bh.n ? (bh.wa + 1) / (bh.n + 2) : 0.5;
      var fa = freq(LA, EVENEMENTS[0]), fb = freq(LB, EVENEMENTS[0]);
      var pForme = (fa.n && fb.n) ? (fa.p + 50) / ((fa.p + 50) + (fb.p + 50)) : 0.5;
      var pRang = (r1 && r2) ? (1 / r1.place) / (1 / r1.place + 1 / r2.place) : 0.5;
      var p = pCotes != null ? 0.55 * pCotes + 0.2 * pH2H + 0.15 * pForme + 0.10 * pRang : 0.4 * pH2H + 0.35 * pForme + 0.25 * pRang;
      var favA = p >= 0.5, nomFav = favA ? n1 : n2, nomOut = favA ? n2 : n1;
      var surfaceFr = surface ? (SURF_FR[surface] || surface) : null;
      var surSurface = function (L) { if (!surface) return null; var g = SURF_GROUPE[surface]; var s = L.filter(function (m) { return m.surface && SURF_GROUPE[m.surface] === g; }); return s.length ? s.filter(function (m) { return m.gagne; }).length + '/' + s.length : null; };
      var sa = surSurface(LA), sb = surSurface(LB);

      // Candidats : cote >= 1,30 et frequence >= 7/10 (regle NinjaScores), tries par frequence.
      var s1 = meilleures('Home/Away (1st Set)', 'Home'), s2 = meilleures('Home/Away (1st Set)', 'Away');
      var over25 = meilleuresOU('Over/Under', '2.5', 'Over'), under25 = meilleuresOU('Over/Under', '2.5', 'Under');
      var mkG = marche('Over/Under by Games in Match') || {}; var lignesG = Object.keys(mkG['Over/Under by Games in Match Over'] || {}).filter(function (l) { return /\.5$/.test(l); }).sort(function (a, b) { return a - b; });
      var ligneG = lignesG.filter(function (l) { return Math.abs(l - 21.5) < 1; })[0] || lignesG[Math.floor(lignesG.length / 2)];
      var fusion = function (ev) { var a = freq(LA, ev), b = freq(LB, ev); return { x: a.x + b.x, n: a.n + b.n }; };
      var cand = [];
      var ajouter = function (label, sousLabel, cote, x, n) { if (!cote || !n) return; cand.push({ label: label, sous: sousLabel, cote: cote, x: x, n: n, r: x / n }); };
      var fav = favA ? fa : fb, favCote = favA ? w1 : w2;
      ajouter(nomFav + ' gagne', fav.x + '/' + fav.n + ' — 10 derniers matchs', favCote, fav.x, fav.n);
      // Un seul vainqueur propose (le favori de nos indicateurs) : pas de picks contradictoires.
      var f1s = favA ? freq(LA, EVENEMENTS[1]) : freq(LB, EVENEMENTS[1]); ajouter(nomFav + ' gagne le 1er set', f1s.x + '/' + f1s.n + ' — 10 derniers matchs', favA ? s1 : s2, f1s.x, f1s.n);
      var f3 = fusion(EVENEMENTS[2]); ajouter('Plus de 2,5 sets', f3.x + '/' + f3.n + ' — 10 derniers matchs de chaque joueur', over25, f3.x, f3.n);
      var f2 = fusion(EVENEMENTS[3]); ajouter('Moins de 2,5 sets', f2.x + '/' + f2.n + ' — 10 derniers matchs de chaque joueur', under25, f2.x, f2.n);
      if (ligneG) {
        var evG = { f: function (m) { return m.jeux > parseFloat(ligneG); } }, evGm = { f: function (m) { return m.nbSets && m.jeux < parseFloat(ligneG); } };
        var fg = fusion(evG); ajouter('Plus de ' + ligneG.replace('.', ',') + ' jeux', fg.x + '/' + fg.n + ' — 10 derniers matchs de chaque joueur', meilleuresOU('Over/Under by Games in Match', ligneG, 'Over'), fg.x, fg.n);
        var fgm = fusion(evGm); ajouter('Moins de ' + ligneG.replace('.', ',') + ' jeux', fgm.x + '/' + fgm.n + ' — 10 derniers matchs de chaque joueur', meilleuresOU('Over/Under by Games in Match', ligneG, 'Under'), fgm.x, fgm.n);
      }
      var retenus = cand.filter(function (c) { return c.cote.o >= 1.3 && c.r >= 0.7; }).sort(function (a, b) { return (b.r - a.r) || (b.cote.o - a.cote.o); }).slice(0, 4);
      var note = function (r) { return Math.round(r * 20) / 2; };
      var badgeCote = function (o) { return h('div', { style: { background: accent, borderRadius: 10, padding: '10px 16px', textAlign: 'center', minWidth: 80, flexShrink: 0, boxShadow: '0 2px 8px ' + accent + '55' } }, h('div', { style: { fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1 } }, o.toFixed(2))); };
      var barreConfiance = function (score) { return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 } }, h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 1 } }, h('span', { style: { fontSize: 18, fontWeight: 900, color: t.text } }, String(score).replace('.', ',')), h('span', { style: { fontSize: 11, color: t.textSec } }, '/10')), h('div', { style: { display: 'flex', gap: 2 } }, Array.apply(null, Array(10)).map(function (_, i) { return h('div', { key: i, style: { width: 6, height: 8, borderRadius: 2, background: i < Math.round(score) ? accent : t.border } }); })), h('div', { style: { fontSize: 8, fontWeight: 700, color: t.textTer, textTransform: 'uppercase', letterSpacing: .5 } }, 'Fréquence')); };

      return h(R.Fragment, null,
        bandeauANJ(),
        carteTendances(LA, LB),
        h(Carte, { t: t },
          h('div', { style: { padding: '12px 14px' } },
            h('div', { style: { fontSize: 10, fontWeight: 800, color: accent, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6 } }, 'Analyse du match'),
            h('div', { style: { fontSize: 12.5, color: t.text, lineHeight: 1.5, marginBottom: 10 } },
              pCotes != null ? nomFav + ' part favori avec ' + Math.round((favA ? pCotes : 1 - pCotes) * 100) + ' % de probabilité implicite. ' : nomFav + ' part favori selon nos indicateurs. ',
              bh.n ? 'Le tête-à-tête est ' + (bh.wa === bh.wb ? 'équilibré (' + bh.wa + ' - ' + bh.wb + ')' : 'en faveur de ' + (bh.wa > bh.wb ? n1 : n2) + ' (' + Math.max(bh.wa, bh.wb) + ' - ' + Math.min(bh.wa, bh.wb) + ')') + '. ' : 'Première confrontation entre les deux joueurs. ',
              (surfaceFr && (sa || sb)) ? 'Sur ' + surfaceFr.toLowerCase() + ', ' + n1 + ' est à ' + (sa || '–') + ' et ' + n2 + ' à ' + (sb || '–') + ' sur les 10 derniers matchs.' : ''),
            [['🎾', 'Surface', surfaceFr ? surfaceFr + (tour ? ' · ' + tour : '') : (tour || 'Tournoi ' + tournoi)],
             ['📊', 'Probabilités', pCotes != null ? n1 + ' ' + Math.round(pCotes * 100) + ' % · ' + n2 + ' ' + Math.round((1 - pCotes) * 100) + ' %' : 'Cotes indisponibles'],
             ['🏆', 'Classement', (r1 ? 'n°' + r1.place : '–') + ' contre ' + (r2 ? 'n°' + r2.place : '–') + ' ' + circuit]].map(function (b, i) {
              return h('div', { key: i, style: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0', borderTop: i ? '1px solid ' + t.divider : 'none' } },
                h('span', { style: { fontSize: 16, fontFamily: EMOJI, flexShrink: 0 } }, b[0]),
                h('div', null, h('div', { style: { fontSize: 12, fontWeight: 800, color: t.text } }, b[1]), h('div', { style: { fontSize: 11.5, color: t.textSec } }, b[2])));
            }))),
        h('div', { style: { background: 'linear-gradient(135deg,' + accent + ',#2E1065)', borderRadius: '14px 14px 0 0', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
          h('div', { style: { fontSize: 15, fontWeight: 900, color: '#fff', letterSpacing: .5, textTransform: 'uppercase' } }, 'Nos pronostics'),
          h('div', { style: { fontSize: 9.5, color: 'rgba(255,255,255,.75)', textAlign: 'right' } }, 'cote ≥ 1,30', h('br'), 'fréquence ≥ 7/10')),
        retenus.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10, marginBottom: 14 } }, retenus.map(function (c, i) {
          return h('div', { key: i, style: { background: t.card, borderRadius: 14, border: '1px solid ' + t.border, boxShadow: t.shadowCard, overflow: 'hidden' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px' } },
              h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { style: { fontSize: 14, fontWeight: 800, color: t.text } }, c.label), h('div', { style: { fontSize: 11, color: t.textSec, marginTop: 3 } }, c.sous), h('div', { style: { fontSize: 10, color: t.textTer, marginTop: 2 } }, c.cote.b)),
              badgeCote(c.cote.o), barreConfiance(note(c.r))),
            bandeParier(i));
        })) : h(Carte, { t: t, style: { borderRadius: '0 0 14px 14px', borderTop: 'none' } }, h('div', { style: { padding: '16px 14px', fontSize: 12.5, color: t.textSec, lineHeight: 1.5 } }, 'Aucun pronostic ne remplit nos critères sur ce match (cote ≥ 1,30 et fréquence ≥ 7/10 sur les 10 derniers matchs).')),
        h('div', { style: { fontSize: 10.5, color: t.textTer, lineHeight: 1.5, padding: '0 4px 12px' } }, 'Pronostics calculés automatiquement à partir des cotes, du tête-à-tête, de la forme et du classement, sans garantie. Jouer comporte des risques. Réservé aux +18 ans.'));
    };

    // ── onglet Tete-a-tete ──
    var sf = R.useState('tous'), filtre = sf[0], setFiltre = sf[1];
    var sj = R.useState('a'), joueurTend = sj[0], setJoueurTend = sj[1];
    var rendreTaT = function () {
      if (!h2h.ok) return h(Vide, { t: t }, 'Chargement…');
      var LA = analyser(h2h.d && h2h.d.firstPlayerResults, k1), LB = analyser(h2h.d && h2h.d.secondPlayerResults, k2);
      var liste = ((h2h.d && h2h.d.H2H) || []).slice().sort(function (a, b) { return String(b.event_date).localeCompare(String(a.event_date)); });
      var surfDe = function (e) { var tt = T[String(e.tournament_key)]; return tt && tt.surface ? tt.surface : null; };
      var filtree = liste.filter(function (e) { if (filtre === 'tous') return true; var s = surfDe(e); return s && SURF_GROUPE[s] === filtre; });
      var wa = 0, wb = 0;
      filtree.forEach(function (e) { var aEstK1 = String(e.first_player_key) === String(k1); var w1 = e.event_winner === 'First Player'; if ((aEstK1 && w1) || (!aEstK1 && !w1)) wa++; else wb++; });
      var L = joueurTend === 'a' ? LA : LB, nomT = joueurTend === 'a' ? n1 : n2, photoT = joueurTend === 'a' ? photo1 : photo2;
      var pilule = function (id, nom) { var on = joueurTend === id; return h('button', { key: id, onClick: function () { setJoueurTend(id); }, style: { border: 'none', borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: on ? accent : t.cardAlt, color: on ? '#fff' : t.textSec, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, nom); };
      var dateCourte = function (iso) { try { var d = new Date(iso + 'T12:00:00Z'); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCFullYear()).slice(2); } catch (e) { return iso; } };
      return h(R.Fragment, null,
        h(Carte, { t: t },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 14px 8px' } },
            h('div', null, h('div', { style: { fontSize: 13.5, fontWeight: 800, color: t.text } }, 'Tendances en cours'), h('div', { style: { fontSize: 10.5, color: t.textSec } }, 'Sur les 10 derniers matchs')),
            h('div', { style: { display: 'flex', gap: 4 } }, pilule('a', n1), pilule('b', n2))),
          EVENEMENTS.map(function (ev, i) {
            var r = freq(L, ev);
            return h('div', { key: ev.id, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid ' + t.divider } },
              h(Avatar, { nom: nomT, photo: photoT, taille: 22, t: t, accent: accent }),
              h('div', { style: { flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: t.text } }, ev.label),
              h('div', { style: { fontSize: 13, fontWeight: 900, color: r.p >= 70 ? accent : t.text, minWidth: 34, textAlign: 'right' } }, r.x + '/' + r.n));
          })),
        h(Carte, { t: t },
          h('div', { style: { padding: '12px 14px 4px', fontSize: 10, fontWeight: 800, color: accent, letterSpacing: 1.1, textTransform: 'uppercase' } }, 'Forme récente'),
          [[n1, photo1, LA], [n2, photo2, LB]].map(function (c, i) {
            return h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 10px' } }, h(Avatar, { nom: c[0], photo: c[1], taille: 30, t: t, accent: accent }), chipsForme(c[2], 8));
          })),
        h('div', { style: { display: 'flex', gap: 6, background: t.card, border: '1px solid ' + t.border, borderRadius: 12, padding: 4, marginBottom: 14 } },
          [['tous', 'Global'], ['dur', 'Dur'], ['terre', 'Terre battue'], ['gazon', 'Gazon']].map(function (o) {
            var on = o[0] === filtre;
            return h('button', { key: o[0], onClick: function () { setFiltre(o[0]); }, style: { flex: 1, border: 'none', borderRadius: 9, padding: '8px 4px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: on ? accent : 'transparent', color: on ? '#fff' : t.textSec } }, o[1]);
          })),
        h(Carte, { t: t },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 6px' } },
            h('div', { style: { fontSize: 10, fontWeight: 800, color: accent, letterSpacing: 1.1, textTransform: 'uppercase' } }, 'Confrontations directes'),
            h('div', { style: { fontSize: 11.5, fontWeight: 800, color: t.textSec } }, filtree.length ? wa + ' - ' + wb : '')),
          filtree.length ? filtree.map(function (e) {
            var aEstK1 = String(e.first_player_key) === String(k1);
            var gagneA = (aEstK1 && e.event_winner === 'First Player') || (!aEstK1 && e.event_winner === 'Second Player');
            var s = surfDe(e);
            var sets = (e.scores || []).filter(function (q) { var a = String(q.score_first || ''), b = String(q.score_second || ''); return a && b && !(a === '0' && b === '0'); });
            var sA = sets.filter(function (q) { var a = parseInt(q.score_first, 10), b = parseInt(q.score_second, 10); return aEstK1 ? a > b : b > a; }).length;
            var scoreSets = sA + '-' + (sets.length - sA);
            var tb = function (v) { return String(v).replace(/^(\d+)\.(\d+)$/, '$1($2)'); };
            var detail = sets.map(function (q) { return aEstK1 ? tb(q.score_first) + '-' + tb(q.score_second) : tb(q.score_second) + '-' + tb(q.score_first); }).join(' ');
            return h('div', { key: e.event_key, style: { padding: '9px 14px', borderTop: '1px solid ' + t.divider } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { style: { fontSize: 10, color: t.textTer, width: 52, flexShrink: 0 } }, dateCourte(e.event_date)),
                h('span', { style: { flex: 1, textAlign: 'right', fontSize: 12, fontWeight: gagneA ? 800 : 500, color: gagneA ? t.text : t.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, n1),
                h(Avatar, { nom: n1, photo: photo1, taille: 18, t: t, accent: accent }),
                h('span', { style: { background: t.cardAlt, borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 900, color: t.text, flexShrink: 0 } }, scoreSets),
                h(Avatar, { nom: n2, photo: photo2, taille: 18, t: t, accent: accent }),
                h('span', { style: { flex: 1, fontSize: 12, fontWeight: !gagneA ? 800 : 500, color: !gagneA ? t.text : t.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, n2)),
              h('div', { style: { fontSize: 10.5, color: t.textTer, marginTop: 3, paddingLeft: 60 } }, [e.tournament_name, tourFr(e.tournament_round), s ? SURF_FR[s] : null, detail].filter(Boolean).join(' · ')));
          }) : h(Vide, { t: t }, filtre === 'tous' ? 'Aucune confrontation directe' : 'Aucune confrontation sur cette surface')));
    };

    // ── onglet Tableau ──
    var sr = R.useState(null), rondeSel = sr[0], setRonde = sr[1];
    var rendreTableau = function () {
      if (!tableau.ok) return h(Vide, { t: t }, 'Chargement du tableau…');
      var br = (tableau.d && tableau.d.brackets) || [];
      var principal = br.filter(function (b) { return !b.qualification; })[0] || br[0];
      if (!principal || !principal.rounds || !principal.rounds.length) return h(Vide, { t: t }, 'Tableau indisponible pour ce tournoi.');
      var rondes = principal.rounds;
      var estNousM = function (mm) { var a = mm.first_player && mm.first_player.player_key, b = mm.second_player && mm.second_player.player_key; return (String(a) === String(k1) && String(b) === String(k2)) || (String(a) === String(k2) && String(b) === String(k1)); };
      var idxMatch = -1, idxJoue = -1;
      rondes.forEach(function (r, i) {
        var ms = r.matches || [];
        if (ms.some(function (mm) { return String(mm.match_key) === String(cle) || estNousM(mm); })) idxMatch = i;
        if (ms.some(function (mm) { return mm.live || (mm.result && mm.result !== '-') || (mm.first_player && mm.first_player.name && mm.second_player && mm.second_player.name); })) idxJoue = i;
      });
      // Par defaut : le tour de CE match ; sinon le dernier tour deja rempli (pas une finale vide).
      var idx = rondeSel != null ? rondeSel : (idxMatch >= 0 ? idxMatch : (idxJoue >= 0 ? idxJoue : 0));
      var ronde = rondes[idx];
      var estNous = function (pk) { return String(pk) === String(k1) || String(pk) === String(k2); };
      return h(R.Fragment, null,
        h(Chips, { t: t, accent: accent, valeur: idx, onChange: setRonde, options: rondes.map(function (r, i) { return [i, nomRonde(r.round_name, i, rondes.length)]; }) }),
        h(Carte, { t: t }, (ronde.matches || []).map(function (mm, i) {
          var p1 = mm.first_player || {}, p2 = mm.second_player || {};
          var w = mm.winner_player_key;
          var nous = estNous(p1.player_key) || estNous(p2.player_key);
          var lig = function (p) {
            var gagne = w && String(w) === String(p.player_key);
            return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: gagne ? 900 : 600, color: gagne || !w ? t.text : t.textTer } },
              h('span', { style: { width: 22, fontSize: 10, color: t.textTer, textAlign: 'right', flexShrink: 0 } }, p.seed ? '[' + p.seed + ']' : ''),
              h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p.name || 'À déterminer'));
          };
          return h('div', { key: mm.match_key || i, style: { padding: '8px 12px', borderTop: i ? '1px solid ' + t.divider : 'none', borderLeft: nous ? '4px solid ' + accent : '4px solid transparent', display: 'flex', alignItems: 'center', gap: 8 } },
            h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 } }, lig(p1), lig(p2)),
            h('div', { style: { fontSize: 12, fontWeight: 800, color: mm.live ? '#EF4444' : t.textSec, flexShrink: 0, minWidth: 40, textAlign: 'right' } }, mm.live ? 'LIVE' : (mm.result && mm.result !== '-' ? mm.result : '')));
        })));
    };

    return h('div', { style: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: t.bg } },
      h('div', { style: { padding: '12px 16px 0', position: 'sticky', top: 0, zIndex: 5, background: t.bg } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } },
          h('button', { onClick: props.onBack, 'aria-label': 'Retour', style: { width: 36, height: 36, borderRadius: '50%', border: '1px solid ' + t.border, background: t.card, color: t.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: t.shadowCard } },
            h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('polyline', { points: '15 18 9 12 15 6' }))),
          h('div', { style: { minWidth: 0 } },
            h('div', { style: { fontSize: 15, fontWeight: 800, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, sousTitre[0] ? h('span', { style: { fontFamily: EMOJI, marginRight: 6 } }, sousTitre[0]) : null, sousTitre[1]),
            h('div', { style: { fontSize: 11, fontWeight: 600, color: t.textSec } }, [sousTitre[2], tx.cat ? ({ GS: 'Grand Chelem', FINALS: 'Finals', OLY: 'JO', M1000: circuit === 'WTA' ? 'WTA 1000' : 'Masters 1000', '500': circuit + ' 500', TEAM: 'Par équipes', '250': circuit + ' 250', CH: circuit === 'WTA' ? 'WTA 125' : 'Challenger' })[tx.cat] : circuit].filter(Boolean).join(' · '))))),
      h('div', { style: { padding: '0 16px' } },
        h(Carte, { t: t, style: { border: '2px solid ' + (statut === 'live' ? '#EF4444' : accent) } },
          h('div', { style: { display: 'flex', alignItems: 'center', padding: '16px 12px', gap: 6 } }, joueur(n1, photo1, r1, 'a'), centre, joueur(n2, photo2, r2, 'b'))),
        h('div', { style: { display: 'flex', gap: 4, background: t.cardAlt, borderRadius: 12, padding: 3, marginBottom: 14, overflowX: 'auto', scrollbarWidth: 'none' } },
          tabs.map(function (o) {
            var on = o[0] === tab;
            return h('button', { key: o[0], className: o[0] === 'cotes' ? 'ns-odds' : o[0] === 'pronostics' ? 'ns-prono' : undefined, onClick: function () { setTab(o[0]); }, style: { flex: '1 0 auto', border: 'none', borderRadius: 10, padding: '7px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', background: on ? t.card : 'transparent', color: on ? accent : t.textSec, boxShadow: on ? t.shadowCard : 'none' } }, o[1]);
          })),
        tab === 'resume' ? rendreResume() : tab === 'pbp' ? rendrePbp() : tab === 'cotes' ? rendreCotes() : tab === 'pronostics' ? rendrePronos() : tab === 'tat' ? rendreTaT() : rendreTableau(),
        h('div', { style: { height: 24 } })));
  };
})();
