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
  // Libelles API-Tennis (anglais) -> francais, pour les classements.
  var PAYS_FR = { 'Andorra': 'Andorre', 'Argentina': 'Argentine', 'Armenia': 'Arménie', 'Australia': 'Australie', 'Austria': 'Autriche', 'Belgium': 'Belgique', 'Bolivia': 'Bolivie',
    'Bosnia and Herzegovina': 'Bosnie-Herzégovine', 'Brazil': 'Brésil', 'Bulgaria': 'Bulgarie', 'Burundi': 'Burundi', 'Canada': 'Canada', 'Chile': 'Chili', 'China': 'Chine', 'Colombia': 'Colombie',
    'Croatia': 'Croatie', 'Cyprus': 'Chypre', 'Czech Republic': 'Tchéquie', 'Czechia': 'Tchéquie', 'Denmark': 'Danemark', 'Dominican Republic': 'République dominicaine', 'Ecuador': 'Équateur', 'Egypt': 'Égypte',
    'Estonia': 'Estonie', 'Finland': 'Finlande', 'France': 'France', 'Georgia': 'Géorgie', 'Germany': 'Allemagne', 'Greece': 'Grèce', 'Hong Kong': 'Hong Kong', 'Hungary': 'Hongrie', 'India': 'Inde',
    'Indonesia': 'Indonésie', 'Italy': 'Italie', 'Ivory Coast': 'Côte d’Ivoire', 'Jamaica': 'Jamaïque', 'Japan': 'Japon', 'Jordan': 'Jordanie', 'Kazakhstan': 'Kazakhstan', 'Latvia': 'Lettonie',
    'Liechtenstein': 'Liechtenstein', 'Lithuania': 'Lituanie', 'Luxembourg': 'Luxembourg', 'Malta': 'Malte', 'Mexico': 'Mexique', 'Monaco': 'Monaco', 'Morocco': 'Maroc', 'Netherlands': 'Pays-Bas',
    'New Zealand': 'Nouvelle-Zélande', 'North Macedonia': 'Macédoine du Nord', 'Norway': 'Norvège', 'Paraguay': 'Paraguay', 'Peru': 'Pérou', 'Philippines': 'Philippines', 'Poland': 'Pologne',
    'Portugal': 'Portugal', 'Romania': 'Roumanie', 'Serbia': 'Serbie', 'Slovakia': 'Slovaquie', 'Slovenia': 'Slovénie', 'South Africa': 'Afrique du Sud', 'South Korea': 'Corée du Sud', 'Korea, Republic of': 'Corée du Sud',
    'Spain': 'Espagne', 'Sweden': 'Suède', 'Switzerland': 'Suisse', 'Taiwan': 'Taïwan', 'Chinese Taipei': 'Taïwan', 'Thailand': 'Thaïlande', 'Tunisia': 'Tunisie', 'Turkey': 'Turquie', 'USA': 'États-Unis',
    'United States': 'États-Unis', 'Ukraine': 'Ukraine', 'United Kingdom': 'Royaume-Uni', 'Great Britain': 'Royaume-Uni', 'Uruguay': 'Uruguay', 'Uzbekistan': 'Ouzbékistan', 'Russia': 'Russie', 'Belarus': 'Biélorussie',
    'Israel': 'Israël', 'Ireland': 'Irlande', 'Moldova': 'Moldavie', 'Venezuela': 'Venezuela', 'Vietnam': 'Viêt Nam', 'Montenegro': 'Monténégro', 'Albania': 'Albanie', 'Kosovo': 'Kosovo', 'Nigeria': 'Nigeria',
    'Kenya': 'Kenya', 'Zimbabwe': 'Zimbabwe', 'Pakistan': 'Pakistan', 'Malaysia': 'Malaisie', 'Costa Rica': 'Costa Rica', 'Guatemala': 'Guatemala', 'Barbados': 'Barbade', 'Puerto Rico': 'Porto Rico', 'Azerbaijan': 'Azerbaïdjan',
    'World': 'Athlète neutre' };
  function paysFr(nom) { return PAYS_FR[nom] || nom || ''; }
  window.NS_TENNIS_UTIL_PAYS_FR = paysFr;
  window.NS_TENNIS_UTIL = { drapeau: drapeau, drapeauPays: drapeauPays, PAYS_ISO: PAYS_ISO };

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
      var iv = setInterval(charger, 20000);
      return function () { vif = false; clearInterval(iv); };
    }, []);
    return etat;
  }

  var TIER = { GS: 1, FINALS: 1, OLY: 1, M1000: 2, '500': 3, TEAM: 3, '250': 4, CH: 5 };
  var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function dateCourte(iso) { var d = new Date(iso + 'T12:00:00Z'); return JOURS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MOIS[d.getUTCMonth()]; }
  function plusJours(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  // Tournois de la semaine (aujourd'hui + 6 jours), via le resume du proxy.
  function useSemaine() {
    var st = R.useState({ liste: [], chargement: true, auj: null });
    var etat = st[0], setEtat = st[1];
    R.useEffect(function () {
      var vif = true;
      if (!window.NinjaTennisAPI || !window.NinjaTennisAPI.dateDe) { setEtat({ liste: [], chargement: false, auj: null }); return; }
      var auj = window.NinjaTennisAPI.dateDe('today')[0];
      var fin = plusJours(auj, 6);
      Promise.all([
        fetch('/api/tennis/?method=get_fixtures&date_start=' + auj + '&date_stop=' + fin + '&resume=1').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return (j && j.result) || []; }).catch(function () { return []; }),
        window.NinjaTennisAPI.tournois ? window.NinjaTennisAPI.tournois() : Promise.resolve({})
      ]).then(function (r) {
        if (!vif) return;
        var T = r[1] || {};
        var liste = r[0].filter(function (x) { return /^(Atp|Wta|Challenger (Men|Women)) Singles$/i.test(x.type || ''); })
          .map(function (x) {
            var t = T[String(x.cle)] || {};
            var circuit = /wta|women/i.test(x.type) ? 'WTA' : 'ATP';
            var cat = t.cat || (/Challenger/i.test(x.type) ? 'CH' : '250');
            return { cle: x.cle, nom: String(x.nom || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+-\s+Qualification.*$/i, '').trim(),
              circuit: circuit, cat: cat, tier: TIER[cat] || 4, surface: t.surface || null, pays: t.pays || null, debut: x.debut, fin: x.fin, n: x.n, live: x.live,
              enCours: x.debut <= auj };
          })
          .sort(function (a, b) { return (a.tier - b.tier) || (b.n - a.n); });
        // L'API separe ATP et WTA d'un meme tournoi (US Open x2) : une seule carte « ATP · WTA ».
        var parNom = {}, fusion = [];
        liste.forEach(function (g) {
          var k = g.nom.toLowerCase() + '|' + g.cat;
          var e = parNom[k];
          if (!e) { parNom[k] = g; fusion.push(g); return; }
          if (e.circuit !== g.circuit) e.circuit = 'ATP · WTA';
          if (g.debut < e.debut) e.debut = g.debut; if (g.fin > e.fin) e.fin = g.fin;
          e.n += g.n; e.live += g.live; e.enCours = e.enCours || g.enCours;
        });
        setEtat({ liste: fusion.slice(0, 12), chargement: false, auj: auj });
      });
      return function () { vif = false; };
    }, []);
    return etat;
  }

  // Actualites tennis (Google News via /api/news, cache CDN 30 min).
  function useActus() {
    var st = R.useState({ liste: [], chargement: true });
    var etat = st[0], setEtat = st[1];
    R.useEffect(function () {
      var vif = true;
      // « tennis » seul ramene du tennis de table et des clubs locaux : on cible le circuit.
      fetch('/api/news/?sport=tennis&q=' + encodeURIComponent('tennis (ATP OR WTA OR "Grand Chelem" OR "Roland-Garros" OR "US Open" OR Wimbledon)')).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (vif) setEtat({ liste: (d && d.articles) || [], chargement: false }); })
        .catch(function () { if (vif) setEtat({ liste: [], chargement: false }); });
      return function () { vif = false; };
    }, []);
    return etat;
  }
  function ilYA(dateStr) {
    var d = new Date(dateStr); if (isNaN(d)) return '';
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 60) return 'il y a ' + Math.max(1, m) + ' min';
    var hh = Math.round(m / 60); if (hh < 24) return 'il y a ' + hh + ' h';
    var j = Math.round(hh / 24); return 'il y a ' + j + ' j';
  }

  function classer(a, b) {
    var ordre = { live: 0, upcoming: 1, ended: 2 };
    return (ordre[a.status] - ordre[b.status]) || (a.apiTier - b.apiTier) || String(a.startDate).localeCompare(String(b.startDate));
  }

  // ── Ligne de match tennis du calendrier (13/09/2026, style Flashscore) ───────
  // Appelee par renderTennisTournaments (bundle) pour chaque match ayant m.tennis :
  // etoile | drapeau + nom (2 lignes) | S1 / heure / Termine | balle du serveur |
  // points du jeu (live) | une colonne par set (set en cours en rouge, vainqueur en gras).
  window.NS_LIGNE_TENNIS = function (m, ctx) {
    var t = ctx.t, accent = ctx.accent, tx = m.tennis || {};
    var live = m.status === 'live', ended = m.status === 'ended';
    var lire = function (v) { var mm = /^(\d+)\((\d+)\)$/.exec(String(v || '').trim()); return mm ? { j: +mm[1], tb: +mm[2] } : { j: parseInt(v, 10) || 0, tb: null }; };
    var sets = (live || ended) ? String(m.apiScore || '').split(',').filter(Boolean).map(function (x) { var p = x.split('-'); return { a: lire(p[0]), b: lire(p[1]) }; }) : [];
    // Un set est termine a 6 jeux avec 2 d'ecart, a 7, ou au tie-break ; sinon c'est le set en cours.
    var complet = function (x) { var M = Math.max(x.a.j, x.b.j); return (M >= 6 && Math.abs(x.a.j - x.b.j) >= 2) || M === 7 || x.a.tb != null || x.b.tb != null; };
    sets.forEach(function (x) { x.fini = complet(x) || (ended && (x.a.j || x.b.j)); });
    if (live && sets.length && sets[sets.length - 1].a.j === 0 && sets[sets.length - 1].b.j === 0 && sets.length > 1 && !sets[sets.length - 2].fini) sets.pop();
    if (!live) sets = sets.filter(function (x) { return x.a.j || x.b.j; });
    // Sets gagnes (colonne rouge en direct, comme Flashscore) : uniquement les sets termines.
    var gagnesA = 0, gagnesB = 0;
    sets.forEach(function (x) { if (!x.fini) return; if (x.a.j > x.b.j) gagnesA++; else if (x.b.j > x.a.j) gagnesB++; });
    var nomA = (tx.j1 && tx.j1.nom) || String(m.homeTeam || '').split(': ').slice(1).join(': ') || '?';
    var nomB = (tx.j2 && tx.j2.nom) || m.awayTeam || '?';
    var flagA = (tx.j1 && tx.j1.pays) ? drapeau(tx.j1.pays) : (ctx.gf ? ctx.gf(nomA) : '');
    var flagB = (tx.j2 && tx.j2.pays) ? drapeau(tx.j2.pays) : (ctx.gf ? ctx.gf(nomB) : '');
    var servA = live && tx.serveur === 'First Player', servB = live && tx.serveur === 'Second Player';
    var jeu = (live && tx.jeu && tx.jeu !== '-') ? String(tx.jeu).split('-').map(function (x) { return x.trim(); }) : null;
    var setNum = live ? ((/set\s*(\d)/i.exec(tx.statutBrut || '') || [])[1] || null) : null;
    var gagneA = ended && gagnesA > gagnesB, gagneB = ended && gagnesB > gagnesA;
    var H = 22;
    var col = function (haut, bas, opts) {
      opts = opts || {};
      var cell = function (v, fort, rouge) { return h('div', { style: { height: H, lineHeight: H + 'px', fontSize: 13, fontWeight: fort ? 900 : 600, color: rouge ? '#EF4444' : ((fort || opts.sombre) ? t.text : t.textSec), textAlign: 'center', fontVariantNumeric: 'tabular-nums' } }, v); };
      return h('div', { style: { width: opts.width || 20, flexShrink: 0 } }, cell(haut, opts.fortA, opts.rouge), cell(bas, opts.fortB, opts.rouge));
    };
    var ligneNom = function (nom, flag, fort, serveur) {
      return h('div', { style: { height: H, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } },
        flag ? h('span', { style: { fontSize: 14, lineHeight: 1, fontFamily: EMOJI, flexShrink: 0, width: 18, textAlign: 'center' } }, flag) : h('span', { style: { width: 18, flexShrink: 0 } }),
        h('span', { style: { fontSize: 13, fontWeight: fort ? 800 : 600, color: (ended && !fort) ? t.textSec : t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, nom));
    };
    var balle = function (on) { return h('div', { style: { height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, on ? h('span', { style: { fontSize: 11, lineHeight: 1, fontFamily: EMOJI } }, '🎾') : null); };
    var heure = (function () { try { return new Date(m.startDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: window._NS_TZ || 'Europe/Paris' }); } catch (e) { return '--:--'; } })();
    var estFav = !!(window.FavMatchesStore && window.FavMatchesStore.has && window.FavMatchesStore.has(m));
    return h('div', { key: m.eventId || m.id, onClick: function () { ctx.onMatchClick && ctx.onMatchClick(Object.assign({}, m, { sport: 'tennis' })); },
      style: { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px 7px 6px', borderTop: ctx.premier ? 'none' : '1px solid ' + t.divider, cursor: 'pointer', background: live ? 'rgba(239,68,68,0.05)' : 'transparent' } },
      h('button', { onClick: function (e) { e.stopPropagation(); if (window.FavMatchesStore) window.FavMatchesStore.toggle(m); }, 'aria-label': estFav ? 'Retirer des favoris' : 'Ajouter aux favoris',
        style: { width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 17, color: estFav ? '#F59E0B' : t.textTer, flexShrink: 0, padding: 0, fontFamily: 'inherit' } }, estFav ? '★' : '☆'),
      h('div', { style: { flex: 1, minWidth: 0 } }, ligneNom(nomA, flagA, gagneA || (live && servA), servA), ligneNom(nomB, flagB, gagneB || (live && servB), servB)),
      live ? h('div', { style: { width: 26, flexShrink: 0, textAlign: 'center', fontSize: 10.5, fontWeight: 900, color: '#EF4444' } }, setNum ? 'S' + setNum : 'LIVE')
        : ended ? h('div', { style: { width: 48, flexShrink: 0, textAlign: 'center', fontSize: 10, fontWeight: 600, color: t.textTer } }, 'Terminé')
        : h('div', { style: { width: 48, flexShrink: 0, textAlign: 'center', fontSize: 12.5, fontWeight: 800, color: t.text } }, heure),
      live ? h('div', { style: { width: 16, flexShrink: 0 } }, balle(servA), balle(servB)) : null,
      (live && jeu && jeu.length === 2) ? col(jeu[0], jeu[1], { width: 26 }) : null,
      (live || (ended && sets.length)) ? col(gagnesA, gagnesB, { width: 22, rouge: live, fortA: true, fortB: true }) : null,
      sets.map(function (x, i) {
        var enCours = live && !x.fini;
        var c = col(x.a.j, x.b.j, { width: 20, fortA: x.fini && x.a.j > x.b.j, fortB: x.fini && x.b.j > x.a.j, sombre: enCours });
        return h('div', { key: i, style: { position: 'relative' } }, c,
          (x.a.tb != null || x.b.tb != null) ? h('span', { style: { position: 'absolute', right: -3, top: (x.a.j < x.b.j ? 0 : H) + 1, fontSize: 7.5, color: t.textTer, fontWeight: 700 } }, x.a.j < x.b.j ? x.a.tb : x.b.tb) : null);
      }),
      // Cotes vainqueur, meme pastille que le foot : violet sur fond clair, et apres le match
      // l'issue sortie en blanc sur violet. Masquees pendant le direct, comme au foot.
      (ctx.cotes && !live && m.cote1 && m.cote2 && !window.NS_HIDE_ODDS) ? h('div', { className: 'ns-odds', style: { width: 34, flexShrink: 0, marginLeft: 6 } },
        [[m.cote1, gagneA], [m.cote2, gagneB]].map(function (c, i) {
          var sorti = ended && c[1];
          return h('div', { key: i, style: { height: H, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' } },
            h('span', { style: { fontSize: 11, fontWeight: 800, color: sorti ? '#fff' : accent, background: sorti ? accent : t.cardAlt, borderRadius: 5, padding: '2px 4px', minWidth: 28, textAlign: 'center', display: 'block', fontVariantNumeric: 'tabular-nums' } }, Number(c[0]).toFixed(2)));
        })) : null,
      h('div', { style: { width: 2 } }));
  };

  // ── Accueil tennis ────────────────────────────────────────────────────────
  window.NS_AccueilTennis = function (props) {
    var t = props.t, accent = props.accent;
    var etat = useMatchsDuJour();
    var semaine = useSemaine();
    var actus = useActus();
    var simples = etat.matchs.filter(function (m) { return !estDouble(m); }).sort(classer);
    // Affiche du jour : le tournoi le plus haut d'abord (US Open avant un Challenger),
    // puis le direct avant l'a-venir, puis l'heure.
    var parNiveau = function (a, b) { return (a.apiTier - b.apiTier) || classer(a, b); };
    var vedette = simples.filter(function (m) { return m.status !== 'ended'; }).sort(parNiveau)[0] || simples[0] || null;

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

      titre(t, accent, 'Tournois cette semaine', function () { versCalendrier(false); }, 'Calendrier'),
      semaine.chargement ? carte(t, h('div', { style: { padding: 24, textAlign: 'center', color: t.textSec, fontSize: 13 } }, 'Chargement…'))
      : semaine.liste.length ? h('div', { style: { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, marginBottom: 12, scrollbarWidth: 'none' } },
          semaine.liste.map(function (g) {
            var surf = g.surface ? ({ 'Hard': 'Dur', 'Hard (Indoor)': 'Dur indoor', 'Clay': 'Terre battue', 'Grass': 'Gazon', 'Carpet': 'Moquette', 'Carpet (Indoor)': 'Moquette' })[g.surface] || g.surface : '';
            var cat = g.circuit === 'ATP · WTA' ? ({ GS: 'Grand Chelem', FINALS: 'Finals', OLY: 'JO', M1000: 'ATP · WTA 1000', '500': 'ATP · WTA 500', '250': 'ATP · WTA 250', CH: 'Challenger' })[g.cat] || 'ATP · WTA' : g.circuit === 'WTA' ? ({ GS: 'Grand Chelem', FINALS: 'Finals', OLY: 'JO', M1000: 'WTA 1000', '500': 'WTA 500', '250': 'WTA 250', CH: 'WTA 125' })[g.cat] || 'WTA' : (CAT[g.cat] || 'ATP');
            var quand = g.live ? g.live + ' en direct' : g.enCours ? (g.fin === semaine.auj ? 'Dernier jour' : 'Jusqu’au ' + dateCourte(g.fin)) : 'Dès ' + dateCourte(g.debut);
            return h('div', { key: g.cle + g.circuit, onClick: function () { versCalendrier(false); },
              style: { flex: '0 0 auto', width: 156, background: t.card, borderRadius: 14, border: '1px solid ' + t.border, boxShadow: t.shadowCard, padding: '12px 12px', cursor: 'pointer',
                borderLeft: '4px solid ' + (g.circuit === 'WTA' ? '#EC4899' : (g.tier >= 5 ? '#F59E0B' : accent)) } },
              h('div', { style: { fontSize: 26, lineHeight: 1, marginBottom: 8, fontFamily: EMOJI } }, g.pays ? drapeau(g.pays) : '🎾'),
              h('div', { style: { fontSize: 13, fontWeight: 800, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, g.nom),
              h('div', { style: { fontSize: 11, fontWeight: 600, color: t.textSec, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [cat, surf].filter(Boolean).join(' · ')),
              h('div', { style: { fontSize: 11, fontWeight: 700, color: g.live ? '#EF4444' : (g.enCours ? accent : t.textTer), marginTop: 6 } }, quand));
          }))
      : carte(t, h('div', { style: { padding: 24, textAlign: 'center', color: t.textSec, fontSize: 13 } }, 'Aucun tournoi cette semaine')),

      titre(t, accent, 'Actualités tennis', null, null),
      actus.chargement ? carte(t, h('div', { style: { padding: 24, textAlign: 'center', color: t.textSec, fontSize: 13 } }, 'Chargement…'))
      : actus.liste.length ? carte(t, actus.liste.slice(0, 8).map(function (a, i) {
          return h('a', { key: i, href: a.link, target: '_blank', rel: 'noopener', style: { display: 'block', padding: '11px 14px', borderTop: i ? '1px solid ' + t.divider : 'none', textDecoration: 'none' } },
            h('div', { style: { fontSize: 13, fontWeight: 700, color: t.text, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, a.title),
            h('div', { style: { fontSize: 11, fontWeight: 600, color: t.textTer, marginTop: 4 } }, [a.source, ilYA(a.date)].filter(Boolean).join(' · ')));
        }))
      : carte(t, h('div', { style: { padding: 24, textAlign: 'center', color: t.textSec, fontSize: 13 } }, 'Pas d’actualité pour le moment')),

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
    // Photos (13/09/2026) : une requete pour les lignes affichees (hash Redis alimente par les fixtures), images lazy.
    var ph = R.useState({}), photos = ph[0], setPhotos = ph[1];
    R.useEffect(function () {
      var manquantes = liste.map(function (j) { return String(j.player_key); }).filter(function (k) { return photos[k] === undefined; });
      if (!manquantes.length) return;
      var vif = true;
      fetch('/api/tennis/?method=photos&keys=' + manquantes.join(',')).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (!vif) return;
        var maj = Object.assign({}, photos);
        manquantes.forEach(function (k) { maj[k] = (j && j.result && j.result[k]) || null; });
        setPhotos(maj);
      }).catch(function () {});
      return function () { vif = false; };
    }, [etat.liste, limite]);
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
              h('div', { style: { width: 24, fontSize: 13, fontWeight: 800, color: i < 3 ? accent : t.textSec, textAlign: 'right', flexShrink: 0 } }, j.place),
              photos[String(j.player_key)] ? h('img', { src: photos[String(j.player_key)], alt: '', loading: 'lazy', width: 30, height: 30, style: { width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', background: t.cardAlt, border: '1px solid ' + t.border, flexShrink: 0 } })
                : h('div', { style: { width: 30, height: 30, borderRadius: '50%', background: t.cardAlt, color: t.textSec, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } }, String(j.player || '?').split(' ').map(function (x) { return x.charAt(0); }).join('').slice(0, 2).toUpperCase()),
              h('span', { style: { fontSize: 16, lineHeight: 1, width: 20, textAlign: 'center', flexShrink: 0, fontFamily: EMOJI } }, drapeauPays(j.country)),
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { style: { fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, j.player),
                h('div', { style: { fontSize: 10.5, fontWeight: 600, color: t.textTer } }, paysFr(j.country))),
              h('div', { style: { fontSize: 13, fontWeight: 800, color: t.text, flexShrink: 0 } }, String(j.points || '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' pts'),
              h('div', { style: { width: 14, textAlign: 'center', fontSize: 11, flexShrink: 0 } }, fleche(j.movement)));
          })),
          (etat.liste && etat.liste.length > limite) ? h('div', { onClick: function () { setLimite(limite + 100); }, style: { textAlign: 'center', padding: '12px', borderRadius: 12, border: '1px solid ' + t.border, background: t.card, color: accent, fontSize: 13, fontWeight: 800, cursor: 'pointer' } }, 'Afficher 100 joueurs de plus') : null));
  };
})();
