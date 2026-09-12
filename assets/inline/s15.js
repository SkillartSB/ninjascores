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
        api('method=' + (live ? 'get_livescore' : 'get_fixtures') + '&match_key=' + cle + '&detail=1').then(function (r) {
          if (!vif) return;
          if (r && r.length) setX(r[0]);
          else if (live) api('method=get_fixtures&match_key=' + cle + '&detail=1').then(function (r2) { if (vif && r2 && r2.length) setX(r2[0]); });
        });
      };
      charger();
      var iv = live ? setInterval(charger, 20000) : null;
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

    var classement = useClassement(circuit);
    var rangDe = function (k) { if (!classement || !k) return null; for (var i = 0; i < classement.length; i++) if (String(classement[i].player_key) === String(k)) return classement[i]; return null; };
    var r1 = rangDe(k1), r2 = rangDe(k2);

    var tabs = [['resume', 'Résumé'], ['cotes', 'Cotes'], ['pronostics', 'Pronostics'], ['tat', 'TàT'], ['tableau', 'Tableau']].filter(function (o) { return !(mineur && (o[0] === 'cotes' || o[0] === 'pronostics')); });
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
          rang ? 'N°' + rang.place + ' ' + circuit : '',
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
      var FR = { 'Aces': 'Aces', 'Double Faults': 'Doubles fautes', '1st serve percentage': '% 1re balle', '1st serve points won': 'Points gagnés 1re balle', '2nd serve points won': 'Points gagnés 2e balle', 'Break points saved': 'Balles de break sauvées', 'Break points converted': 'Balles de break converties', 'Winners': 'Coups gagnants', 'Unforced errors': 'Fautes directes', 'Total points won': 'Points gagnés', 'Service games played': 'Jeux de service', 'Return games played': 'Jeux en retour', '1st return points won': 'Retours gagnés 1re balle', '2nd return points won': 'Retours gagnés 2e balle', 'Max points in a row': 'Points d’affilée (max)', 'Service points won': 'Points au service', 'Receiver points won': 'Points en retour', 'Max games in a row': 'Jeux d’affilée (max)' };
      return h(R.Fragment, null, h(Titre, { t: t }, 'Statistiques'),
        h(Carte, { t: t }, ordre.map(function (k, i) {
          var a = parNom[k].a, b = parNom[k].b; var va = a ? a.stat_value : '–', vb = b ? b.stat_value : '–';
          var na = num(va), nb = num(vb), tot = na + nb || 1;
          var moins = /fault|error/i.test(k);
          var aMieux = moins ? na < nb : na > nb;
          return h('div', { key: k, style: { padding: '9px 14px', borderTop: i ? '1px solid ' + t.divider : 'none' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 800, color: t.text, marginBottom: 5 } },
              h('span', { style: { color: aMieux && na !== nb ? accent : t.text } }, va), h('span', { style: { fontSize: 11.5, fontWeight: 700, color: t.textSec } }, FR[k] || k), h('span', { style: { color: !aMieux && na !== nb ? accent : t.text } }, vb)),
            h('div', { style: { display: 'flex', gap: 4, height: 5 } },
              h('div', { style: { flex: 1, background: t.cardAlt, borderRadius: 3, overflow: 'hidden', display: 'flex', justifyContent: 'flex-end' } }, h('div', { style: { width: (na / tot * 100) + '%', background: accent, opacity: aMieux ? 1 : .35 } })),
              h('div', { style: { flex: 1, background: t.cardAlt, borderRadius: 3, overflow: 'hidden' } }, h('div', { style: { width: (nb / tot * 100) + '%', background: accent, opacity: !aMieux ? 1 : .35, height: '100%' } }))));
        })));
    };
    var ouvertsInit = {};
    var ov = R.useState(ouvertsInit), ouverts = ov[0], setOuverts = ov[1];
    var rendrePbp = function () {
      var pbp = (x && x.pointbypoint) || [];
      if (!pbp.length) return null;
      var parSet = {}, ordreSets = [];
      pbp.forEach(function (g) { var k = g.set_number || 'Set'; if (!parSet[k]) { parSet[k] = []; ordreSets.push(k); } parSet[k].push(g); });
      var dernier = ordreSets[ordreSets.length - 1];
      return h(R.Fragment, null, h(Titre, { t: t }, 'Point par point'),
        ordreSets.map(function (k) {
          var ouvert = ouverts[k] != null ? ouverts[k] : (k === dernier);
          var jeux = parSet[k].slice().reverse();
          return h(Carte, { key: k, t: t },
            h('div', { onClick: function () { var o = Object.assign({}, ouverts); o[k] = !ouvert; setOuverts(o); }, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 800, color: t.text } },
              h('span', null, k.replace('Set', 'Set ') .replace(/\s+/g, ' ') + ' · ' + parSet[k].length + ' jeux'), h('span', { style: { color: t.textTer, fontSize: 12 } }, ouvert ? '▲' : '▼')),
            ouvert ? jeux.map(function (g, i) {
              var serv = g.player_served === 'First Player' ? n1 : n2;
              var brk = g.serve_lost && g.serve_lost !== null;
              return h('div', { key: i, style: { padding: '8px 14px', borderTop: '1px solid ' + t.divider } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, color: t.text, marginBottom: 4 } },
                  h('span', null, 'Jeu ' + g.number_game + ' · ' + g.score), h('span', { style: { color: brk ? '#EF4444' : t.textSec, fontWeight: 700 } }, brk ? 'BREAK' : 'Service ' + serv)),
                h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } }, (g.points || []).map(function (p, j) {
                  var special = p.break_point ? 'BP' : p.set_point ? 'SP' : p.match_point ? 'MP' : null;
                  return h('span', { key: j, style: { fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: special ? '#FEE2E2' : t.cardAlt, color: special ? '#B91C1C' : t.textSec } }, p.score + (special ? ' ' + special : ''));
                })));
            }) : null);
        }));
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
        rendreStats(), rendrePbp(),
        !x ? h(Vide, { t: t }, 'Chargement…') : null);
    };

    // ── onglet Cotes ──
    var meilleures = function (marche, cle2) {
      var mk = cotes.d && cotes.d[String(cle)] && cotes.d[String(cle)][marche];
      if (!mk) return null;
      var v = mk[cle2]; if (!v) return null;
      var best = null;
      Object.keys(v).forEach(function (b) { var o = parseFloat(v[b]); if (o > 1 && (!best || o > best.o)) best = { o: o, b: BOOK[b] || b }; });
      return best;
    };
    var meilleuresOU = function (marche, ligne, sens) {
      var mk = cotes.d && cotes.d[String(cle)] && cotes.d[String(cle)][marche];
      if (!mk) return null;
      var v = mk[marche + ' ' + sens] && mk[marche + ' ' + sens][ligne]; if (!v) return null;
      var best = null;
      Object.keys(v).forEach(function (b) { var o = parseFloat(v[b]); if (o > 1 && (!best || o > best.o)) best = { o: o, b: BOOK[b] || b }; });
      return best;
    };
    var ligneCote = function (libelle, best, i) {
      return h('div', { key: i, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: i ? '1px solid ' + t.divider : 'none' } },
        h('div', { style: { minWidth: 0 } }, h('div', { style: { fontSize: 13, fontWeight: 700, color: t.text } }, libelle), best ? h('div', { style: { fontSize: 10.5, color: t.textTer, fontWeight: 600 } }, best.b) : null),
        h('div', { style: { fontSize: 15, fontWeight: 900, color: best ? accent : t.textTer, background: best ? (accent + '18') : 'transparent', borderRadius: 8, padding: '4px 10px' } }, best ? best.o.toFixed(2) : '–'));
    };
    var rendreCotes = function () {
      if (!cotes.ok) return h(Vide, { t: t }, 'Chargement des cotes…');
      var w1 = meilleures('Home/Away', 'Home'), w2 = meilleures('Home/Away', 'Away');
      if (!w1 && !w2) return h(Vide, { t: t }, 'Pas de cotes disponibles pour ce match.');
      var p1 = w1 && w2 ? (1 / w1.o) / (1 / w1.o + 1 / w2.o) : null;
      var s1 = meilleures('Home/Away (1st Set)', 'Home'), s2 = meilleures('Home/Away (1st Set)', 'Away');
      var mkOU = cotes.d[String(cle)]['Over/Under'] || {};
      var lignesOU = Object.keys((mkOU['Over/Under Over'] || {})).slice(0, 2);
      var mkG = cotes.d[String(cle)]['Over/Under by Games in Match'] || {};
      var lignesG = Object.keys((mkG['Over/Under by Games in Match Over'] || {})).filter(function (l) { return /\.5$/.test(l); }).sort(function (a, b) { return Math.abs(a - 22.5) - Math.abs(b - 22.5); }).slice(0, 2);
      return h(R.Fragment, null,
        h(Titre, { t: t }, 'Vainqueur du match'),
        h(Carte, { t: t },
          p1 != null ? h('div', { style: { padding: '12px 14px 4px' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 800, color: t.textSec, marginBottom: 5 } }, h('span', null, n1 + ' ' + Math.round(p1 * 100) + ' %'), h('span', null, Math.round((1 - p1) * 100) + ' % ' + n2)),
            h('div', { style: { height: 8, borderRadius: 4, background: '#EC4899', overflow: 'hidden' } }, h('div', { style: { width: (p1 * 100) + '%', height: '100%', background: accent } }))) : null,
          ligneCote(n1, w1, 0), ligneCote(n2, w2, 1)),
        lignesOU.length ? h(R.Fragment, null, h(Titre, { t: t }, 'Nombre de sets'), h(Carte, { t: t }, lignesOU.map(function (l, i) { return h(R.Fragment, { key: l }, ligneCote('Plus de ' + l.replace('.', ',') + ' sets', meilleuresOU('Over/Under', l, 'Over'), i * 2), ligneCote('Moins de ' + l.replace('.', ',') + ' sets', meilleuresOU('Over/Under', l, 'Under'), i * 2 + 1)); }))) : null,
        lignesG.length ? h(R.Fragment, null, h(Titre, { t: t }, 'Nombre de jeux'), h(Carte, { t: t }, lignesG.map(function (l, i) { return h(R.Fragment, { key: l }, ligneCote('Plus de ' + l.replace('.', ',') + ' jeux', meilleuresOU('Over/Under by Games in Match', l, 'Over'), i * 2), ligneCote('Moins de ' + l.replace('.', ',') + ' jeux', meilleuresOU('Over/Under by Games in Match', l, 'Under'), i * 2 + 1)); }))) : null,
        s1 || s2 ? h(R.Fragment, null, h(Titre, { t: t }, 'Vainqueur du 1er set'), h(Carte, { t: t }, ligneCote(n1, s1, 0), ligneCote(n2, s2, 1))) : null,
        h('div', { style: { fontSize: 10.5, color: t.textTer, lineHeight: 1.5, padding: '0 4px 12px' } }, 'Meilleure cote parmi les bookmakers suivis. Jouer comporte des risques : endettement, isolement, dépendance. Appelez le 09 74 75 13 13 (appel non surtaxé).'));
    };

    // ── onglet Pronostics ──
    var rendrePronos = function () {
      if (!cotes.ok || !h2h.ok) return h(Vide, { t: t }, 'Calcul du pronostic…');
      var w1 = meilleures('Home/Away', 'Home'), w2 = meilleures('Home/Away', 'Away');
      if (!w1 || !w2) return h(Vide, { t: t }, 'Pronostic indisponible sans cotes sur ce match.');
      var pCotes = (1 / w1.o) / (1 / w1.o + 1 / w2.o);
      var bh = bilanH2H();
      var pH2H = bh.n ? (bh.wa + 1) / (bh.n + 2) : 0.5;
      var forme = function (liste, k) { var w = 0, n = 0; (liste || []).slice(0, 10).forEach(function (e) { n++; var aEstK = String(e.first_player_key) === String(k); if ((aEstK && e.event_winner === 'First Player') || (!aEstK && e.event_winner === 'Second Player')) w++; }); return { w: w, n: n }; };
      var f1 = forme(h2h.d.firstPlayerResults, k1), f2 = forme(h2h.d.secondPlayerResults, k2);
      var pForme = (f1.n && f2.n) ? (f1.w / f1.n + 0.5) / ((f1.w / f1.n + 0.5) + (f2.w / f2.n + 0.5)) : 0.5;
      var pRang = (r1 && r2) ? (1 / r1.place) / (1 / r1.place + 1 / r2.place) : 0.5;
      var p = 0.55 * pCotes + 0.2 * pH2H + 0.15 * pForme + 0.10 * pRang;
      var favA = p >= 0.5; var pf = favA ? p : 1 - p;
      var nomFav = favA ? n1 : n2, coteFav = favA ? w1 : w2;
      var freq = Math.max(5, Math.min(10, Math.round(pf * 10)));
      var pick, cotePick, note;
      if (coteFav.o >= 1.3) { pick = 'Vainqueur : ' + nomFav; cotePick = coteFav; }
      else {
        var under = meilleuresOU('Over/Under', '2.5', 'Under');
        if (under && under.o >= 1.3) { pick = nomFav + ' gagne en 2 sets'; cotePick = under; note = 'La cote vainqueur (' + coteFav.o.toFixed(2) + ') est sous notre seuil de 1,30 : on joue le score en sets.'; }
        else { pick = 'Vainqueur : ' + nomFav; cotePick = coteFav; note = 'Cote sous notre seuil de 1,30 : à combiner plutôt qu’à jouer seule.'; }
      }
      var raison = function (lib, val, i) { return h('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', padding: '9px 14px', borderTop: i ? '1px solid ' + t.divider : 'none', fontSize: 12.5 } }, h('span', { style: { color: t.textSec, fontWeight: 600 } }, lib), h('span', { style: { color: t.text, fontWeight: 800 } }, val)); };
      return h(R.Fragment, null,
        h('div', { style: { background: 'linear-gradient(135deg,' + accent + ',#3B1FA8)', color: '#fff', borderRadius: 16, padding: '16px', marginBottom: 14, boxShadow: t.shadowCard } },
          h('div', { style: { fontSize: 10.5, fontWeight: 800, letterSpacing: 1, opacity: .85 } }, 'PICK DU NINJA'),
          h('div', { style: { fontSize: 18, fontWeight: 900, margin: '4px 0 8px' } }, pick),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
            h('span', { style: { background: 'rgba(255,255,255,.18)', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 900 } }, 'Cote ' + cotePick.o.toFixed(2)),
            h('span', { style: { background: 'rgba(255,255,255,.18)', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 900 } }, 'Fréquence ' + freq + '/10'),
            h('span', { style: { fontSize: 11, opacity: .85 } }, cotePick.b)),
          note ? h('div', { style: { fontSize: 11.5, marginTop: 8, opacity: .9, lineHeight: 1.4 } }, note) : null),
        h(Titre, { t: t }, 'Pourquoi'),
        h(Carte, { t: t },
          raison('Probabilité selon les cotes', Math.round(pCotes * 100) + ' % ' + n1, 0),
          raison('Tête-à-tête', bh.n ? bh.wa + ' - ' + bh.wb : 'Première confrontation', 1),
          raison('Forme (10 derniers)', f1.w + '/' + f1.n + ' contre ' + f2.w + '/' + f2.n, 2),
          raison('Classement', (r1 ? 'n°' + r1.place : '–') + ' contre ' + (r2 ? 'n°' + r2.place : '–'), 3)),
        h('div', { style: { fontSize: 10.5, color: t.textTer, lineHeight: 1.5, padding: '0 4px 12px' } }, 'Pronostic calculé automatiquement, sans garantie. Jouer comporte des risques. Réservé aux +18 ans.'));
    };

    // ── onglet Tete-a-tete ──
    var sf = R.useState('tous'), filtre = sf[0], setFiltre = sf[1];
    var rendreTaT = function () {
      if (!h2h.ok) return h(Vide, { t: t }, 'Chargement…');
      var liste = ((h2h.d && h2h.d.H2H) || []).slice().sort(function (a, b) { return String(b.event_date).localeCompare(String(a.event_date)); });
      var surfDe = function (e) { var tt = T[String(e.tournament_key)]; return tt && tt.surface ? tt.surface : null; };
      var filtree = liste.filter(function (e) { if (filtre === 'tous') return true; var s = surfDe(e); return s && SURF_GROUPE[s] === filtre; });
      var wa = 0, wb = 0;
      filtree.forEach(function (e) { var aEstK1 = String(e.first_player_key) === String(k1); var w1 = e.event_winner === 'First Player'; if ((aEstK1 && w1) || (!aEstK1 && !w1)) wa++; else wb++; });
      var ligneForme = function (e, k) {
        var aEstK = String(e.first_player_key) === String(k);
        var adv = aEstK ? e.event_second_player : e.event_first_player;
        var gagne = (aEstK && e.event_winner === 'First Player') || (!aEstK && e.event_winner === 'Second Player');
        return h('div', { key: e.event_key, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderTop: '1px solid ' + t.divider, fontSize: 12 } },
          h('span', { style: { width: 20, height: 20, borderRadius: 6, background: gagne ? '#10B981' : '#EF4444', color: '#fff', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } }, gagne ? 'V' : 'D'),
          h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { style: { fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, adv), h('div', { style: { fontSize: 10.5, color: t.textTer } }, e.tournament_name + ' · ' + tourFr(e.tournament_round))),
          h('span', { style: { fontWeight: 800, color: t.textSec, flexShrink: 0 } }, e.event_final_result));
      };
      return h(R.Fragment, null,
        h(Chips, { t: t, accent: accent, valeur: filtre, onChange: setFiltre, options: [['tous', 'Toutes surfaces'], ['dur', 'Dur'], ['terre', 'Terre battue'], ['gazon', 'Gazon']] }),
        h(Carte, { t: t },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px' } },
            h('div', { style: { flex: 1, textAlign: 'center' } }, h('div', { style: { fontSize: 26, fontWeight: 900, color: wa > wb ? accent : t.text } }, wa), h('div', { style: { fontSize: 11, fontWeight: 700, color: t.textSec } }, n1)),
            h('div', { style: { fontSize: 11, fontWeight: 800, color: t.textTer } }, filtree.length ? filtree.length + ' match' + (filtree.length > 1 ? 's' : '') : 'Aucune confrontation'),
            h('div', { style: { flex: 1, textAlign: 'center' } }, h('div', { style: { fontSize: 26, fontWeight: 900, color: wb > wa ? accent : t.text } }, wb), h('div', { style: { fontSize: 11, fontWeight: 700, color: t.textSec } }, n2))),
          filtree.map(function (e) {
            var aEstK1 = String(e.first_player_key) === String(k1);
            var gagneA = (aEstK1 && e.event_winner === 'First Player') || (!aEstK1 && e.event_winner === 'Second Player');
            var s = surfDe(e); var tt = T[String(e.tournament_key)] || {};
            var tb = function (v) { return String(v).replace(/^(\d+)\.(\d+)$/, '$1($2)'); };
            var score = (e.scores || []).map(function (q) { var a = q.score_first, b = q.score_second; if (a == null || b == null || a === '' || b === '' || (String(a) === '0' && String(b) === '0')) return null; return aEstK1 ? tb(a) + '-' + tb(b) : tb(b) + '-' + tb(a); }).filter(Boolean).join('\u2002');
            return h('div', { key: e.event_key, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: '1px solid ' + t.divider } },
              h('div', { style: { width: 34, fontSize: 11, fontWeight: 800, color: t.textSec, flexShrink: 0 } }, annee(e.event_date)),
              tt.pays ? h('span', { style: { fontSize: 16, fontFamily: EMOJI, flexShrink: 0 } }, U.drapeau(tt.pays)) : null,
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { style: { fontSize: 12.5, fontWeight: 800, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, (gagneA ? n1 : n2) + ' gagne'),
                h('div', { style: { fontSize: 10.5, color: t.textTer } }, [e.tournament_name, tourFr(e.tournament_round), s ? SURF_FR[s] : null].filter(Boolean).join(' · '))),
              h('div', { style: { fontSize: 12, fontWeight: 800, color: t.textSec, flexShrink: 0 } }, score || e.event_final_result));
          })),
        h(Titre, { t: t }, 'Forme récente'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 } },
          [[n1, h2h.d && h2h.d.firstPlayerResults, k1], [n2, h2h.d && h2h.d.secondPlayerResults, k2]].map(function (col, i) {
            return h(Carte, { key: i, t: t, style: { marginBottom: 0 } },
              h('div', { style: { padding: '8px 12px', fontSize: 12, fontWeight: 800, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, col[0]),
              (col[1] || []).slice(0, 8).map(function (e) { return ligneForme(e, col[2]); }));
          })));
    };

    // ── onglet Tableau ──
    var sr = R.useState(null), rondeSel = sr[0], setRonde = sr[1];
    var rendreTableau = function () {
      if (!tableau.ok) return h(Vide, { t: t }, 'Chargement du tableau…');
      var br = (tableau.d && tableau.d.brackets) || [];
      var principal = br.filter(function (b) { return !b.qualification; })[0] || br[0];
      if (!principal || !principal.rounds || !principal.rounds.length) return h(Vide, { t: t }, 'Tableau indisponible pour ce tournoi.');
      var rondes = principal.rounds;
      var idxMatch = -1;
      rondes.forEach(function (r, i) { if ((r.matches || []).some(function (mm) { return String(mm.match_key) === String(cle); })) idxMatch = i; });
      var idx = rondeSel != null ? rondeSel : (idxMatch >= 0 ? idxMatch : rondes.length - 1);
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
            h('div', { style: { fontSize: 11, fontWeight: 600, color: t.textSec } }, [sousTitre[2], circuit + (tx.cat ? ' · ' + ({ GS: 'Grand Chelem', FINALS: 'Finals', OLY: 'JO', M1000: circuit === 'WTA' ? 'WTA 1000' : 'Masters 1000', '500': circuit + ' 500', TEAM: 'Par équipes', '250': circuit + ' 250', CH: circuit === 'WTA' ? 'WTA 125' : 'Challenger' })[tx.cat] : '')].filter(Boolean).join(' · '))))),
      h('div', { style: { padding: '0 16px' } },
        h(Carte, { t: t, style: { border: '2px solid ' + (statut === 'live' ? '#EF4444' : accent) } },
          h('div', { style: { display: 'flex', alignItems: 'center', padding: '16px 12px', gap: 6 } }, joueur(n1, photo1, r1, 'a'), centre, joueur(n2, photo2, r2, 'b'))),
        h('div', { style: { display: 'flex', gap: 4, background: t.cardAlt, borderRadius: 12, padding: 3, marginBottom: 14 } },
          tabs.map(function (o) {
            var on = o[0] === tab;
            return h('button', { key: o[0], className: o[0] === 'cotes' ? 'ns-odds' : o[0] === 'pronostics' ? 'ns-prono' : undefined, onClick: function () { setTab(o[0]); }, style: { flex: 1, border: 'none', borderRadius: 10, padding: '7px 4px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: on ? t.card : 'transparent', color: on ? accent : t.textSec, boxShadow: on ? t.shadowCard : 'none' } }, o[1]);
          })),
        tab === 'resume' ? rendreResume() : tab === 'cotes' ? rendreCotes() : tab === 'pronostics' ? rendrePronos() : tab === 'tat' ? rendreTaT() : rendreTableau(),
        h('div', { style: { height: 24 } })));
  };
})();
