// ── Effet de but sur la ligne du match (calendrier, favoris) ─────────────────
// 12/09/2026. Le bandeau plein ecran « GOOOAL » en haut de l'app est desactive
// (demande utilisateur) : l'effet doit rester sur la case precise du match.
// Le bundle emet 'ns-goal' ({home, away, team, hs, as, key}) quand le score
// d'un match en direct augmente (calendrier Aujourd'hui/LIVE et favoris).
// Ici : on retrouve la ou les lignes qui affichent ce match et on les fait
// clignoter 6 s avec une pastille « BUT ». Les notifications push, elles,
// partent du serveur (api/push-goals.js, chaque minute, matchs en favoris).
(function () {
  'use strict';
  var DUREE = 6000;
  function variantes(nom) {
    var out = [nom];
    try { if (window.displayTeamName) { var c = window.displayTeamName(nom); if (c && c !== nom) out.push(c); } } catch (e) {}
    return out.filter(Boolean);
  }
  function lignesDuMatch(home, away) {
    var H = variantes(home), A = variantes(away);
    var racine = document.getElementById('root') || document.body;
    var tous = racine.querySelectorAll('div');
    var cands = [];
    for (var i = 0; i < tous.length; i++) {
      var el = tous[i];
      if (el.children.length === 0) continue;
      var tx = el.textContent || '';
      if (tx.length > 400) continue;
      var okH = false, okA = false;
      for (var a = 0; a < H.length && !okH; a++) if (tx.indexOf(H[a]) >= 0) okH = true;
      for (var b = 0; b < A.length && !okA; b++) if (tx.indexOf(A[b]) >= 0) okA = true;
      if (okH && okA) cands.push(el);
    }
    // Le conteneur cliquable le plus profond = la ligne du match.
    var lignes = [];
    cands.forEach(function (el) {
      if (cands.some(function (o) { return o !== el && el.contains(o) && getComputedStyle(o).cursor === 'pointer'; })) return;
      var cible = el;
      while (cible && cible !== racine && getComputedStyle(cible).cursor !== 'pointer') cible = cible.parentElement;
      if (cible && cible !== racine && lignes.indexOf(cible) < 0) lignes.push(cible);
    });
    return lignes;
  }
  function clignoter(d) {
    if (!d || !d.home || !d.away) return;
    var faits = [];
    var appliquer = function () {
      lignesDuMatch(d.home, d.away).forEach(function (el) {
        if (faits.indexOf(el) >= 0) return;
        faits.push(el);
        el.classList.add('ns-but-flash');
        el.setAttribute('data-ns-but', d.team === d.home ? 'home' : 'away');
        setTimeout(function () { el.classList.remove('ns-but-flash'); el.removeAttribute('data-ns-but'); }, DUREE);
      });
    };
    // La ligne peut etre re-rendue juste apres (fusion du score) : on repasse.
    appliquer(); setTimeout(appliquer, 700); setTimeout(appliquer, 2000);
  }
  window.addEventListener('ns-goal', function (e) { try { clignoter(e.detail || {}); } catch (err) {} });
  window.NS_TEST_BUT = function (home, away, team) { clignoter({ home: home, away: away, team: team || home }); };
})();

// ── Verrou « compte gratuit » sur une partie des pronostics (app iOS) ─────────
// 13/09/2026. L'app iOS est classee 18+ : pas de date de naissance, pas
// d'onboarding, tout est consultable sans compte... sauf une partie des
// pronostics, derriere un verrou qui invite a creer un compte gratuit.
// Regle : onglet Pronostics = le 1er pronostic de chaque championnat reste libre
// (les 3 premiers quand la liste est triee par cote ou frequence) ; fiche match
// = le 1er pronostic libre. Le reste est floute, un clic ouvre l'inscription.
// Web et Android : inchanges (fonctions neutres).
(function () {
  'use strict';
  var R = window.React; if (!R) return;
  var h = R.createElement;
  window.NS_VERROU_ACTIF = function () { return !!(window.NS_IOS_NATIF && !window.NS_AUTH_SESSION); };
  function ouvrirInscription(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try { if (window.NS_showOnboarding) window.NS_showOnboarding(null); else if (window.NS_ouvrirCompte) window.NS_ouvrirCompte(); } catch (err) {}
  }
  function carte(t, accent, cle) {
    t = t || {}; accent = accent || '#6133E0';
    return h('div', { key: cle, onClick: ouvrirInscription, style: { margin: '8px 12px', padding: '14px 14px', borderRadius: 14, background: 'linear-gradient(135deg,' + accent + ',#2E1065)', color: '#fff', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', boxShadow: '0 6px 18px ' + accent + '44' } },
      h('div', { style: { width: 38, height: 38, borderRadius: 11, background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
        h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: '#fff', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('rect', { x: 4, y: 11, width: 16, height: 10, rx: 2 }), h('path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' }))),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontSize: 13, fontWeight: 800, lineHeight: 1.35 } }, 'Création d’un compte gratuit obligatoire pour accéder à tout le contenu'),
        h('div', { style: { marginTop: 8, display: 'inline-block', background: '#fff', color: accent, borderRadius: 9, padding: '6px 12px', fontSize: 12, fontWeight: 800 } }, 'Créer mon compte gratuit')));
  }
  function flou(el, cle) {
    return h('div', { key: cle, onClick: ouvrirInscription, style: { position: 'relative', cursor: 'pointer' } },
      h('div', { 'aria-hidden': true, style: { filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none', WebkitUserSelect: 'none', opacity: 0.85 } }, el));
  }
  // Ligne de l'onglet Pronostics.
  window.NS_VERROU_LIGNE = function (lg, p, pi, t, accent, ligne) {
    if (!window.NS_VERROU_ACTIF()) return ligne;
    var libres = String((lg && lg.lid) || '').indexOf('tri-') === 0 ? 3 : 1;
    if (pi < libres) return ligne;
    var k = 'v-' + ((p && p.id) || pi);
    return h(R.Fragment, { key: k }, pi === libres ? carte(t, accent, k + '-c') : null, flou(ligne, k + '-f'));
  };
  // Carte « Nos pronostics » d'une fiche match (foot et tennis).
  window.NS_VERROU_CARTE = function (i, t, accent, el) {
    if (!window.NS_VERROU_ACTIF() || i < 1) return el;
    var k = 'vc-' + i;
    return h(R.Fragment, { key: k }, i === 1 ? carte(t, accent, k + '-c') : null, flou(el, k + '-f'));
  };
})();
