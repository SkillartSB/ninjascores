/* ══ Barre de sports du site (desktop) — 21/09/2026 ══
   Jusqu'ici le tennis n'avait aucune porte d'entree sur le site : il fallait
   connaitre ?sport=tennis. La pilule de bascule n'existait que sur l'accueil
   mobile, donc un visiteur du site ne pouvait pas savoir que NinjaScores fait
   du tennis.

   On ajoute la barre de sports en haut, comme Flashscore et Sofascore : le
   visiteur sait ou regarder, et le choix pilote TOUTE l'app (accueil,
   calendrier, pronostics, classements) via NS_SPORT — la regle posee le
   12/09 : « on choisit le sport une fois, tout suit ».

   Hors React : le header vient du bundle, on se contente d'inserer la barre
   juste avant `header.ns-head` et de suivre ses couleurs pour rester
   coherent avec le theme clair/sombre.

   Sur mobile, rien : la pilule « ⚽ Foot ▾ » du header d'accueil fait deja
   le travail (NS_SelecteurSport, s13.js). */
(function () {
  var LARGEUR_MIN = 1000;   // en dessous, c'est la pilule mobile qui s'affiche
  var ACCENT = '#6133E0';
  var ID = 'ns-sportbar';

  function chemin(sport) { return sport === 'tennis' ? '/tennis/' : '/'; }

  // L'adresse suit le sport : /tennis/ est partageable, indexable, et c'est
  // la destination qui manquait aux notifications tennis. On ne recharge pas
  // la page — l'app bascule toute seule.
  function majURL(sport) {
    try {
      var p = location.pathname;
      // On ne touche pas aux pages profondes (fiche match, article…) :
      // seules l'accueil et /tennis/ portent le sport.
      if (p !== '/' && !/^\/tennis\/?$/.test(p)) return;
      var url = chemin(sport) + location.search.replace(/[?&]sport=(football|tennis)\b/, '').replace(/^&/, '?');
      history.replaceState(null, '', url);
    } catch (e) {}
  }

  function construire(header) {
    if (document.getElementById(ID)) return;
    var barre = document.createElement('nav');
    barre.id = ID;
    barre.setAttribute('aria-label', 'Choix du sport');
    barre.style.cssText = 'display:flex;align-items:center;gap:2px;padding:0 20px;height:38px;'
      + 'font-size:13px;box-sizing:border-box;';

    window.NS_SPORT.liste.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.sport = s.id;
      b.style.cssText = 'display:inline-flex;align-items:center;gap:6px;border:none;background:none;'
        + 'cursor:pointer;font:inherit;font-weight:500;padding:5px 12px;border-radius:8px;'
        + 'line-height:1;transition:background .12s;';
      var e = document.createElement('span');
      e.textContent = s.emoji;
      e.style.cssText = 'font-family:' + (window.NS_POLICE_EMOJI || 'inherit') + ';font-size:14px;';
      var n = document.createElement('span');
      n.textContent = s.nom;
      b.appendChild(e); b.appendChild(n);
      b.addEventListener('click', function () {
        window.NS_SPORT.set(s.id);
        majURL(s.id);
      });
      barre.appendChild(b);
    });

    header.parentNode.insertBefore(barre, header);
    peindre();
    window.NS_SPORT.abonner(peindre);
    // Le theme se voit sur le header : on recopie ses couleurs et on
    // resynchronise s'il change (bascule clair/sombre).
    try {
      new MutationObserver(peindre).observe(header, { attributes: true, attributeFilter: ['style', 'class'] });
    } catch (e) {}
  }

  function peindre() {
    var barre = document.getElementById(ID);
    var header = document.querySelector('header.ns-head');
    if (!barre || !header) return;
    var cs = getComputedStyle(header);
    var sombre = !!window.ninjaDark;
    barre.style.background = cs.backgroundColor;
    barre.style.borderBottom = '1px solid ' + (sombre ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.08)');
    var courant = window.NS_SPORT.get();
    [].forEach.call(barre.querySelectorAll('button'), function (b) {
      var actif = b.dataset.sport === courant;
      b.style.background = actif ? (sombre ? 'rgba(160,130,255,.18)' : 'rgba(97,51,224,.10)') : 'transparent';
      b.style.color = actif ? (sombre ? '#C4B5FD' : ACCENT) : (sombre ? 'rgba(255,255,255,.62)' : 'rgba(20,18,28,.62)');
      b.setAttribute('aria-current', actif ? 'true' : 'false');
    });
  }

  function demarrer() {
    if (innerWidth < LARGEUR_MIN || !window.NS_SPORT) return;
    var header = document.querySelector('header.ns-head');
    if (header) return construire(header);
    // Le header est rendu par React, donc pas forcement la au chargement.
    var obs = new MutationObserver(function () {
      var h = document.querySelector('header.ns-head');
      if (h) { obs.disconnect(); construire(h); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 20000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
