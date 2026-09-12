// Pronostics du jour : remplace les 52 pronostics ECRITS EN DUR de l'ecran
// /pronostics/ par ceux reellement generes chaque matin.
//
// Meme mecanique que le Match du Ninja : on depose la donnee AVANT le bundle
// pour que le premier rendu soit deja juste, et on rafraichit ensuite.
(function () {
  var CLE = 'ns_pronos_jour';

  function publier(data) {
    if (!data || !data.foot) return;
    // Garde-fou : l'ecran fait `odds.toFixed(2)` sur chaque ligne. Une cote
    // absente (pronostic calcule sans cote, 12/09) faisait planter tout
    // l'ecran /pronostics/ — page blanche — et la copie en sessionStorage
    // rejouait le plantage a chaque visite. On ne garde que les lignes avec
    // une vraie cote, et on jette les groupes vides.
    data.foot = data.foot.map(function (g) {
      var picks = (g.picks || []).filter(function (p) {
        var c = Number(p && p.odds);
        if (!(c > 1)) return false;
        p.odds = c; return true;
      });
      return Object.assign({}, g, { picks: picks });
    }).filter(function (g) { return g.picks.length; });
    // Fusion (13/09/2026) : ne pas ecraser les pronostics tennis deposes par l'autre appel.
    window._NS_PRONOS_JOUR = Object.assign({}, window._NS_PRONOS_JOUR || {}, data);
    window._NS_PRONOS_PRETS = true;
    window.dispatchEvent(new Event('pronosJourReady'));
  }

  // Cache de session : evite un ecran vide au retour sur l'onglet.
  try {
    var brut = sessionStorage.getItem(CLE);
    if (brut) publier(JSON.parse(brut));
  } catch (e) {}

  fetch('/api/pronostics-jour/')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j || !j.foot) return;
      try { sessionStorage.setItem(CLE, JSON.stringify(j)); } catch (e) {}
      publier(j);
    })
    .catch(function () {});

  // Tennis (12/09/2026) : meme ecran /pronostics/, seuls les pronostics changent.
  // Deposes dans _NS_PRONOS_JOUR.tennis ; le bundle lit foot ou tennis selon NS_SPORT.
  function publierTennis(groupes) {
    var propres = (groupes || []).map(function (g) {
      var picks = (g.picks || []).filter(function (p) { var c = Number(p && p.odds); if (!(c > 1)) return false; p.odds = c; return true; });
      return Object.assign({}, g, { picks: picks });
    }).filter(function (g) { return g.picks.length; });
    window._NS_PRONOS_JOUR = Object.assign({}, window._NS_PRONOS_JOUR || {}, { tennis: propres });
    window.dispatchEvent(new Event('pronosJourReady'));
  }
  try { var brutT = sessionStorage.getItem(CLE + '_tennis'); if (brutT) publierTennis(JSON.parse(brutT)); } catch (e) {}
  fetch('/api/pronostics-tennis/')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j || !j.tennis) return;
      try { sessionStorage.setItem(CLE + '_tennis', JSON.stringify(j.tennis)); } catch (e) {}
      publierTennis(j.tennis);
    })
    .catch(function () {});
})();
