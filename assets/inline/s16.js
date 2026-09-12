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
