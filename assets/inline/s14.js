// ── Mode tennis : accueil, pronostics, classements ──────────────────────────
// 12/09/2026. Le sport choisi dans le header de l'accueil (window.NS_SPORT, s13.js)
// pilote toute l'app : quand il vaut 'tennis', le bundle rend ces ecrans a la
// place des ecrans football. Donnees : window.NinjaTennisAPI (s13.js) et le
// proxy /api/tennis/ (cache Redis).
(function () {
  'use strict';
  var R = window.React; if (!R) return;
  var h = R.createElement;
  var EMOJI = window.NS_POLICE_EMOJI || 'inherit';

  // Pays (libelle API-Tennis) -> ISO2, pour les drapeaux des classements.
  var PAYS_ISO = { 'Italy': 'IT', 'Spain': 'ES', 'Germany': 'DE', 'Serbia': 'RS', 'USA': 'US', 'United States': 'US', 'Russia': 'RU',
    'Norway': 'NO', 'Denmark': 'DK', 'Greece': 'GR', 'Poland': 'PL', 'Australia': 'AU', 'Canada': 'CA', 'France': 'FR',
    'Great Britain': 'GB', 'United Kingdom': 'GB', 'Czech Republic': 'CZ', 'Czechia': 'CZ', 'Kazakhstan': 'KZ', 'Argentina': 'AR',
    'Chile': 'CL', 'Brazil': 'BR', 'Japan': 'JP', 'China': 'CN', 'Netherlands': 'NL', 'Belgium': 'BE', 'Switzerland': 'CH',
    'Austria': 'AT', 'Croatia': 'HR', 'Bulgaria': 'BG', 'Hungary': 'HU', 'Romania': 'RO', 'Ukraine': 'UA', 'Belarus': 'BY',
    'Latvia': 'LV', 'Estonia': 'EE', 'Lithuania': 'LT', 'Finland': 'FI', 'Sweden': 'SE', 'Portugal': 'PT', 'Slovakia': 'SK',
    'Slovenia': 'SI', 'Bosnia and Herzegovina': 'BA', 'Georgia': 'GE', 'Turkey': 'TR', 'Tunisia': 'TN', 'Egypt': 'EG',
    'South Africa': 'ZA', 'India': 'IN', 'Colombia': 'CO', 'Peru': 'PE', 'Mexico': 'MX', 'Ecuador': 'EC', 'Uruguay': 'UY',
    'Bolivia': 'BO', 'Venezuela': 'VE', 'Korea, Republic of': 'KR', 'South Korea': 'KR', 'Taiwan': 'TW', 'Chinese Taipei': 'TW',
    'Thailand': 'TH', 'Indonesia': 'ID', 'Israel': 'IL', 'Moldova': 'MD', 'Cyprus': 'CY', 'Monaco': 'MC', 'Luxembourg': 'LU',
    'Ireland': 'IE', 'New Zealand': 'NZ', 'Uzbekistan': 'UZ', 'Armenia': 'AM', 'Azerbaijan': 'AZ', 'Dominican Republic': 'DO',
    'Puerto Rico': 'PR', 'Morocco': 'MA', 'Philippines': 'PH', 'Hong Kong': 'HK', 'Malaysia': 'MY', 'Pakistan': 'PK',
    'Zimbabwe': 'ZW', 'Nigeria': 'NG', 'Kenya': 'KE', 'Paraguay': 'PY', 'Costa Rica': 'CR', 'Guatemala': 'GT', 'Jamaica': 'JM',
    'Barbados': 'BB', 'Vietnam': 'VN', 'Montenegro': 'ME', 'North Macedonia': 'MK', 'Albania': 'AL', 'Kosovo': 'XK', 'Liechtenstein': 'LI' };
  function drapeau(iso) {
    if (!iso || iso.length !== 2) return '';
    try { return String.fromCodePoint.apply(null, iso.toUpperCase().split('').map(function (c) { return 0x1F1E6 + c.charCodeAt(0) - 65; })); } catch (e) { return ''; }
  }
  function drapeauPays(nom) { return drapeau(PAYS_ISO[nom] || ''); }

  var CAT = { GS: 'Grand Chelem', FINALS: 'Finals', OLY: 'JO', M1000: 'Masters 1000', '500': 'ATP 500', TEAM: 'Par équipes', '250': 'ATP 250', CH: 'Challenger' };
  function catLabel(m) {
    var tx = m.tennis || {}; var w = m.competition === 'WTA';
    if (w) return ({ GS: 'Grand Chelem', FINALS: 'Finals', OLY: 'JO', M1000: 'WTA 1000', '500': 'WTA 500', '250': 'WTA 250', CH: 'WTA 125' })[tx.cat] || 'WTA';
    return CAT[tx.cat] || 'ATP';
  }
  function surfaceLabel(m) { var s = m.tennis && m.tennis.surfaceFr; return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function tournoiDe(m) { return (m.tennis && m.tennis.tournoi) || String(m.homeTeam || '').split(': ')[0]; }
  function joueur1(m) { return (m.tennis && m.tennis.j1 && m.tennis.j1.nom) || String(m.homeTeam || '').split(': ').slice(1).join(': '); }
  function joueur2(m) { return (m.tennis && m.tennis.j2 && m.tennis.j2.nom) || m.awayTeam || ''; }
  function estDouble(m) { return /\//.test(joueur1(m)); }
  function heure(m) {
    try { return new Date(m.startDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: window._NS_TZ || 'Europe/Paris' }); } catch (e) { return '--:--'; }
  }
  function sets(m) { return String(m.apiScore || '').split(',').filter(Boolean).map(function (s) { return s.split('-'); }); }
  function tourCourt(m) {
    var r = String((m.tennis && m.tennis.tour) || '');
    if (/final/i.test(r) && !/semi|quarter/i.test(r)) return 'Finale';
    if (/semi/i.test(r)) return 'Demi-finale';
    if (/quarter/i.test(r)) return 'Quart de finale';
    var n = /(\d+)(?:st|nd|rd|th)?\s*round/i.exec(r); if (n) return n[1] + 'e tour';
    if (/qualif/i.test(r)) return 'Qualifications';
    return '';
  }

  // Photo ronde d'un joueur, initiales en secours.
  function Avatar(props) {
    var nom = props.nom || '?', taille = props.taille || 44, photo = props.photo;
    var st = R.useState(false), ko = st[0], setKo = st[1];
    var init = nom.split(/[\s\/]+/).map(function (x) { return x.replace(/\./g, '').charAt(0); }).filter(Boolean).slice(0, 2).join('').toUpperCase();
    if (photo && !ko) return h('img', { src: photo, alt: nom, onError: function () { setKo(true); },
      style: { width: taille, height: taille, borderRadius: '50%', objectFit: 'cover', background: props.t.cardAlt || '#eee', flexShrink: 0, border: '1px solid ' + (props.t.border || '#e5e7eb') } });
    return h('div', { style: { width: taille, height: taille, borderRadius: '50%', background: props.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: Math.round(taille * 0.34), flexShrink: 0 } }, init || '?');
  }

  // Colonne droite d'une ligne de match : heure, sets ou statut.
  function Etat(props) {
    var m = props.m, t = props.t;
    if (m.status === 'live') {
      var ss = sets(m);
      return h('div', { style: { textAlign: 'right', flexShrink: 0 } },
        h('div', { style: { fontSize: 15, fontWeight: 900, color: '#EF4444', letterSpacing: 1 } }, ss.length ? ss.map(function (x) { return x.join('-'); }).join(' ') : 'LIVE'),
        h('div', { style: { fontSize: 10, fontWeight: 800, color: '#EF4444' } }, m.apiPeriod || 'En cours'));
    }
    if (m.status === 'ended') {
      var s2 = sets(m);
      return h('div', { style: { textAlign: 'right', flexShrink: 0 } },
        h('div', { style: { fontSize: 14, fontWeight: 800, color: t.text, letterSpacing: 1 } }, s2.map(function (x) { return x.join('-'); }).join(' ') || '—'),
        h('div', { style: { fontSize: 10, fontWeight: 600, color: t.textTer } }, 'Terminé'));
    }
    return h('div', { style: { fontSize: 14, fontWeight: 800, color: t.text, flexShrink: 0 } }, heure(m));
  }

  function LigneMatch(props) {
    var m = props.m, t = props.t, accent = props.accent;
    var nom = function (p) { return h('div', { style: { fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p); };
    return h('div', { onClick: function () { props.onMatchClick && props.onMatchClick(Object.assign({}, m, { sport: 'tennis' })); },
      style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: props.premier ? 'none' : '1px solid ' + t.divider, cursor: 'pointer' } },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 } },
        h(Avatar, { nom: joueur1(m), photo: m.tennis && m.tennis.j1 && m.tennis.j1.photo, taille: 30, t: t, accent: accent }),
        h(Avatar, { nom: joueur2(m), photo: m.tennis && m.tennis.j2 && m.tennis.j2.photo, taille: 30, t: t, accent: accent })),
      h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' } },
        h('div', { style: { height: 30, display: 'flex', alignItems: 'center' } }, nom(joueur1(m))),
        h('div', { style: { height: 30, display: 'flex', alignItems: 'center' } }, nom(joueur2(m)))),
      h(Etat, { m: m, t: t }));
  }

  function EnteteTournoi(props) {
    var m = props.m, t = props.t, tx = m.tennis || {};
    var sous = [tx.paysNom, surfaceLabel(m), catLabel(m)].filter(Boolean).join(' · ');
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid ' + t.divider } },
      tx.pays ? h('span', { style: { fontSize: 20, lineHeight: 1, fontFamily: EMOJI } }, drapeau(tx.pays)) : null,
      h('div', { style: { minWidth: 0 } },
        h('div', { style: { fontSize: 13, fontWeight: 800, color: t.text } }, tournoiDe(m) + (props.tour ? ' · ' + props.tour : '')),
        sous ? h('div', { style: { fontSize: 11, fontWeight: 600, color: t.textSec } }, sous) : null));
  }

  function titre(t, accent, texte, action, lien) {
    return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
      h('span', { style: { fontSize: 15, fontWeight: 800, color: t.text } }, texte),
      lien ? h('span', { onClick: action, style: { fontSize: 12, fontWeight: 600, color: accent, cursor: 'pointer' } }, lien) : null);
  }
  function carte(t, enfants, style) {
    return h('div', { style: Object.assign({ background: t.card, borderRadius: 14, boxShadow: t.shadowCard, border: '1px solid ' + t.border, overflow: 'hidden', marginBottom: 18 }, style || {}) }, enfants);
  }
  function versCalendrier(live) {
    try { window.__nsNav && window.__nsNav('schedule'); } catch (e) {}
    try { window.NS_ROUTE && window.NS_ROUTE.ecran && window.NS_ROUTE.ecran('schedule', !!live); } catch (e) {}
  }

  // Chargement des matchs du jour (partage par les trois ecrans).
  function useMatchsDuJour() {
    var st = R.useState({ matchs: [], chargement: true, erreur: null });
    var etat = st[0], setEtat = st[1];
    R.useEffect(function () {
      var vif = true;
      var charger = function () {
        if (!window.NinjaTennisAPI) { setEtat({ matchs: [], chargement: false, erreur: 'Module tennis indisponible' }); return; }
        window.NinjaTennisAPI.fetchComps('today').then(function (comps) {
          if (!vif) return;
          var ms = [];
          (comps || []).forEach(function (c) { (c.matches || []).forEach(function (m) { ms.push(m); }); });
          setEtat({ matchs: ms, chargement: false, erreur: null });
        }).catch(function (e) { if (vif) setEtat({ matchs: [], chargement: false, erreur: e && e.message }); });
      };
      charger();
      var iv = setInterval(charger, 60000);
      return function () { vif = false; clearInterval(iv); };
    }, []);
    return etat;
  }

  function classer(a, b) {
    var ordre = { live: 0, upcoming: 1, ended: 2 };
    return (ordre[a.status] - ordre[b.status]) || (a.apiTier - b.apiTier) || String(a.startDate).localeCompare(String(b.startDate));
  }

  // ── Accueil tennis ────────────────────────────────────────────────────────
  window.NS_AccueilTennis = function (props) {
    var t = props.t, accent = props.accent;
    var etat = useMatchsDuJour();
    var simples = etat.matchs.filter(function (m) { return !estDouble(m); }).sort(classer);
    var vedette = simples.filter(function (m) { return m.status !== 'ended'; })[0] || simples[0] || null;
    var aVenir = simples.filter(function (m) { return m.status === 'upcoming' && m !== vedette; }).slice(0, 6);
    var enDirect = simples.filter(function (m) { return m.status === 'live' && m !== vedette; }).slice(0, 6);

    // Tournois du jour : regroupement par tournoi, ordonne par niveau.
    var tournois = {};
    etat.matchs.forEach(function (m) {
      var k = (m.tennis && m.tennis.tournoiCle) || tournoiDe(m);
      var g = tournois[k] || (tournois[k] = { m: m, n: 0, live: 0 });
      g.n++; if (m.status === 'live') g.live++;
    });
    var listeTournois = Object.keys(tournois).map(function (k) { return tournois[k]; })
      .sort(function (a, b) { return (a.m.apiTier - b.m.apiTier) || (b.n - a.n); }).slice(0, 10);

    var vide = h('div', { style: { padding: 32, textAlign: 'center', color: t.textSec, fontSize: 13 } }, etat.chargement ? 'Chargement…' : (etat.erreur || 'Aucun match aujourd’hui'));

    return h('div', { style: { padding: '0 16px', display: 'flex', flexDirection: 'column' } },
      titre(t, accent, 'Le Match du Ninja', function () { versCalendrier(false); }, 'Voir tout'),
      vedette ? h('div', { style: { borderRadius: 16, border: '2px solid ' + accent, boxShadow: t.shadowCard, overflow: 'hidden', marginBottom: 18, background: t.card } },
        h('div', { style: { background: accent, color: '#fff', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontWeight: 800, letterSpacing: 1 } },
          h('span', null, '忍 NINJASCORES'), h('span', { style: { letterSpacing: 0, fontWeight: 700, opacity: .95 } }, vedette.status === 'live' ? '● En direct' : '✦ Sélection du jour')),
        h(EnteteTournoi, { m: vedette, t: t, tour: tourCourt(vedette) }),
        h('div', { onClick: function () { props.onMatchClick && props.onMatchClick(Object.assign({}, vedette, { sport: 'tennis' })); }, style: { display: 'flex', alignItems: 'center', padding: '16px 14px', gap: 8, cursor: 'pointer' } },
          h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 0 } },
            h(Avatar, { nom: joueur1(vedette), photo: vedette.tennis && vedette.tennis.j1 && vedette.tennis.j1.photo, taille: 56, t: t, accent: accent }),
            h('div', { style: { fontSize: 13, fontWeight: 800, color: t.text, textAlign: 'center' } }, joueur1(vedette))),
          h('div', { style: { flexShrink: 0, textAlign: 'center', minWidth: 90 } },
            vedette.status === 'upcoming'
              ? h('div', { style: { fontSize: 26, fontWeight: 900, color: accent, letterSpacing: 2 } }, heure(vedette))
              : h('div', null,
                  h('div', { style: { fontSize: 20, fontWeight: 900, color: vedette.status === 'live' ? '#EF4444' : t.text, letterSpacing: 1 } }, sets(vedette).map(function (x) { return x.join('-'); }).join('  ') || (vedette.status === 'live' ? 'LIVE' : '—')),
                  h('div', { style: { fontSize: 11, fontWeight: 800, color: vedette.status === 'live' ? '#EF4444' : t.textTer, marginTop: 2 } }, vedette.status === 'live' ? (vedette.apiPeriod || 'En cours') : 'Terminé'))),
          h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 0 } },
            h(Avatar, { nom: joueur2(vedette), photo: vedette.tennis && vedette.tennis.j2 && vedette.tennis.j2.photo, taille: 56, t: t, accent: accent }),
            h('div', { style: { fontSize: 13, fontWeight: 800, color: t.text, textAlign: 'center' } }, joueur2(vedette))))
      ) : carte(t, vide),

      listeTournois.length ? h(R.Fragment, null,
        titre(t, accent, 'Tournois du jour', function () { versCalendrier(false); }, 'Calendrier'),
        h('div', { style: { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, marginBottom: 12, scrollbarWidth: 'none' } },
          listeTournois.map(function (g) {
            var tx = g.m.tennis || {};
            return h('div', { key: (tx.tournoiCle || tournoiDe(g.m)) + (g.m.competition || ''), onClick: function () { versCalendrier(false); },
              style: { flex: '0 0 auto', width: 150, background: t.card, borderRadius: 14, border: '1px solid ' + t.border, boxShadow: t.shadowCard, padding: '12px 12px', cursor: 'pointer',
                borderLeft: '4px solid ' + (g.m.competition === 'WTA' ? '#EC4899' : (g.m.apiTier >= 5 ? '#F59E0B' : accent)) } },
              h('div', { style: { fontSize: 26, lineHeight: 1, marginBottom: 8, fontFamily: EMOJI } }, tx.pays ? drapeau(tx.pays) : '🎾'),
              h('div', { style: { fontSize: 13, fontWeight: 800, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, tournoiDe(g.m)),
              h('div', { style: { fontSize: 11, fontWeight: 600, color: t.textSec, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [catLabel(g.m), surfaceLabel(g.m)].filter(Boolean).join(' · ')),
              h('div', { style: { fontSize: 11, fontWeight: 700, color: g.live ? '#EF4444' : t.textTer, marginTop: 6 } }, g.live ? g.live + ' en direct' : g.n + (g.n > 1 ? ' matchs' : ' match')));
          }))) : null,

      enDirect.length ? h(R.Fragment, null,
        titre(t, accent, 'En direct', function () { versCalendrier(true); }, 'Tout le live'),
        carte(t, enDirect.map(function (m, i) { return h('div', { key: m.id }, h(EnteteTournoi, { m: m, t: t, tour: tourCourt(m) }), h(LigneMatch, { m: m, t: t, accent: accent, premier: true, onMatchClick: props.onMatchClick })); }))) : null,

      aVenir.length ? h(R.Fragment, null,
        titre(t, accent, 'Prochains matchs', function () { versCalendrier(false); }, 'Voir tout'),
        carte(t, aVenir.map(function (m, i) { return h(LigneMatch, { key: m.id, m: m, t: t, accent: accent, premier: i === 0, onMatchClick: props.onMatchClick }); }))) : null,

      h('div', { onClick: function () { versCalendrier(false); }, style: { marginBottom: 24, padding: '13px 16px', borderRadius: 14, background: accent, color: '#fff', textAlign: 'center', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: t.shadowCard } }, 'Tout le calendrier tennis')
    );
  };

  // ── Pronostics tennis (cotes a venir : etape 3) ───────────────────────────
  window.NS_PronosTennis = function (props) {
    var t = props.t, accent = props.accent;
    var etat = useMatchsDuJour();
    var tops = etat.matchs.filter(function (m) { return !estDouble(m) && m.status !== 'ended' && m.apiTier <= 3; }).sort(classer).slice(0, 12);
    return h('div', { style: { flex: 1, overflowY: 'auto', padding: '12px 16px 24px' } },
      h('h1', { style: { fontSize: 18, fontWeight: 800, color: t.text, margin: '0 0 12px' } }, 'Pronostics tennis'),
      h('div', { style: { background: 'linear-gradient(135deg,' + accent + ',#3B1FA8)', color: '#fff', borderRadius: 16, padding: '16px 16px', marginBottom: 18, boxShadow: t.shadowCard } },
        h('div', { style: { fontSize: 11, fontWeight: 800, letterSpacing: 1, opacity: .85, marginBottom: 4 } }, 'BIENTÔT'),
        h('div', { style: { fontSize: 16, fontWeight: 800, marginBottom: 4 } }, 'Cotes et pronostics tennis'),
        h('div', { style: { fontSize: 12.5, lineHeight: 1.45, opacity: .92 } }, 'Vainqueur, sets, jeux : les pronostics du Ninja arrivent sur les grands tournois. En attendant, voici les affiches du jour.')),
      titre(t, accent, 'Affiches du jour', function () { versCalendrier(false); }, 'Calendrier'),
      tops.length ? carte(t, tops.map(function (m, i) { return h('div', { key: m.id }, h(EnteteTournoi, { m: m, t: t, tour: tourCourt(m) }), h(LigneMatch, { m: m, t: t, accent: accent, premier: true, onMatchClick: props.onMatchClick })); }))
        : carte(t, h('div', { style: { padding: 32, textAlign: 'center', color: t.textSec, fontSize: 13 } }, etat.chargement ? 'Chargement…' : 'Pas d’affiche ATP/WTA aujourd’hui')));
  };

  // ── Classements ATP / WTA ─────────────────────────────────────────────────
  var cacheClassement = {};
  window.NS_ClassementTennis = function (props) {
    var t = props.t, accent = props.accent;
    var ct = R.useState('ATP'), circuit = ct[0], setCircuit = ct[1];
    var nb = R.useState(100), limite = nb[0], setLimite = nb[1];
    var st = R.useState({ liste: cacheClassement[circuit] || null, chargement: !cacheClassement[circuit], erreur: null });
    var etat = st[0], setEtat = st[1];
    R.useEffect(function () {
      var vif = true; setLimite(100);
      if (cacheClassement[circuit]) { setEtat({ liste: cacheClassement[circuit], chargement: false, erreur: null }); return; }
      setEtat({ liste: null, chargement: true, erreur: null });
      fetch('/api/tennis/?method=get_standings&event_type=' + circuit).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!vif) return;
          var l = (j && j.result) || [];
          cacheClassement[circuit] = l;
          setEtat({ liste: l, chargement: false, erreur: l.length ? null : 'Classement indisponible' });
        }).catch(function (e) { if (vif) setEtat({ liste: [], chargement: false, erreur: e.message }); });
      return function () { vif = false; };
    }, [circuit]);
    var liste = (etat.liste || []).slice(0, limite);
    var fleche = function (mv) { return mv === 'up' ? h('span', { style: { color: '#10B981', fontWeight: 800 } }, '▲') : mv === 'down' ? h('span', { style: { color: '#EF4444', fontWeight: 800 } }, '▼') : h('span', { style: { color: t.textTer } }, '–'); };
    return h('div', { style: { flex: 1, overflowY: 'auto', padding: '12px 16px 24px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
        h('h1', { style: { fontSize: 18, fontWeight: 800, color: t.text, margin: 0 } }, 'Classement ' + circuit),
        h('div', { style: { display: 'flex', gap: 3, background: t.cardAlt, borderRadius: 12, padding: 3 } },
          ['ATP', 'WTA'].map(function (c) {
            var on = c === circuit;
            return h('button', { key: c, onClick: function () { setCircuit(c); }, style: { border: 'none', borderRadius: 10, padding: '5px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: on ? (c === 'WTA' ? '#EC4899' : accent) : 'transparent', color: on ? '#fff' : t.textSec } }, c);
          }))),
      etat.chargement ? h('div', { style: { padding: 32, textAlign: 'center', color: t.textSec, fontSize: 13 } }, 'Chargement…')
        : etat.erreur ? h('div', { style: { padding: 32, textAlign: 'center', color: t.textSec, fontSize: 13 } }, etat.erreur)
        : h(R.Fragment, null,
          carte(t, liste.map(function (j, i) {
            return h('div', { key: j.player_key || i, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: i ? '1px solid ' + t.divider : 'none' } },
              h('div', { style: { width: 28, fontSize: 13, fontWeight: 800, color: i < 3 ? accent : t.textSec, textAlign: 'right', flexShrink: 0 } }, j.place),
              h('span', { style: { fontSize: 18, lineHeight: 1, width: 24, textAlign: 'center', flexShrink: 0, fontFamily: EMOJI } }, drapeauPays(j.country)),
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { style: { fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, j.player),
                h('div', { style: { fontSize: 10.5, fontWeight: 600, color: t.textTer } }, j.country || '')),
              h('div', { style: { fontSize: 13, fontWeight: 800, color: t.text, flexShrink: 0 } }, String(j.points || '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' pts'),
              h('div', { style: { width: 14, textAlign: 'center', fontSize: 11, flexShrink: 0 } }, fleche(j.movement)));
          })),
          (etat.liste && etat.liste.length > limite) ? h('div', { onClick: function () { setLimite(limite + 100); }, style: { textAlign: 'center', padding: '12px', borderRadius: 12, border: '1px solid ' + t.border, background: t.card, color: accent, fontSize: 13, fontWeight: 800, cursor: 'pointer' } }, 'Afficher 100 joueurs de plus') : null));
  };
})();
