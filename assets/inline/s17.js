/* ══ Barre de sports du site (desktop) — 21/09/2026 ══
   Jusqu'ici le tennis n'avait aucune porte d'entree sur le site : il fallait
   connaitre ?sport=tennis. La pilule de bascule n'existait que sur l'accueil
   mobile, donc un visiteur du site ne pouvait pas savoir que NinjaScores fait
   du tennis.

   Forme retenue par l'utilisateur apres comparaison de quatre propositions :
   deux pastilles centrees sur le gris du site, libelles en capitales, l'actif
   en violet plein. C'est le meme langage que la pilule de l'application
   mobile, et le violet ressort sans ecraser le logo juste en dessous.

   Le choix pilote TOUTE l'app (accueil, calendrier, pronostics, classements)
   via NS_SPORT — la regle posee le 12/09 : « on choisit le sport une fois,
   tout suit ».

   Hors React : le header vient du bundle, on se contente d'inserer la barre
   juste avant `header.ns-head`.

   Sur mobile, rien : la pilule « ⚽ Foot ▾ » du header d'accueil fait deja
   le travail (NS_SelecteurSport, s13.js). */
(function () {
  var LARGEUR_MIN = 1000;   // en dessous, c'est la pilule mobile qui s'affiche
  var ID = 'ns-sportbar';
  var ACCENT = '#6133E0';

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
      var q = location.search.replace(/[?&]sport=(football|tennis)\b/, '');
      history.replaceState(null, '', chemin(sport) + q.replace(/^&/, '?'));
    } catch (e) {}
  }

  function construire(header) {
    if (document.getElementById(ID)) return;
    var barre = document.createElement('nav');
    barre.id = ID;
    barre.setAttribute('aria-label', 'Choix du sport');
    barre.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;height:62px;'
      + 'box-sizing:border-box;position:relative;z-index:21;font-family:inherit;';

    window.NS_SPORT.liste.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.sport = s.id;
      // Capitales : les deux mots sont courts et la barre est large, autant
      // qu'ils se lisent de loin.
      b.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;gap:11px;height:44px;'
        + 'padding:0 32px;border-radius:14px;cursor:pointer;font-family:inherit;font-size:15px;font-weight:800;'
        + 'letter-spacing:1.1px;text-transform:uppercase;transition:background .12s,color .12s,box-shadow .12s;';
      var e = document.createElement('span');
      e.textContent = s.emoji;
      e.style.cssText = 'font-family:' + (window.NS_POLICE_EMOJI || 'inherit') + ';font-size:20px;line-height:1;';
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
    // Le theme se lit sur le header : on le suit plutot que de le deviner.
    try {
      new MutationObserver(peindre).observe(header, { attributes: true, attributeFilter: ['style', 'class'] });
    } catch (e) {}
  }

  function peindre() {
    var barre = document.getElementById(ID);
    if (!barre) return;
    var sombre = !!window.ninjaDark;
    barre.style.background = sombre ? '#15131d' : '#F4F4F8';
    barre.style.borderBottom = '1px solid ' + (sombre ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)');
    var courant = window.NS_SPORT.get();
    [].forEach.call(barre.querySelectorAll('button'), function (b) {
      var actif = b.dataset.sport === courant;
      b.style.background = actif ? ACCENT : (sombre ? '#221F2E' : '#fff');
      b.style.color = actif ? '#fff' : (sombre ? 'rgba(255,255,255,.66)' : 'rgba(20,18,28,.62)');
      b.style.border = '1px solid ' + (actif ? ACCENT : (sombre ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.10)'));
      b.style.boxShadow = actif ? '0 4px 12px rgba(97,51,224,.28)' : (sombre ? 'none' : '0 1px 2px rgba(0,0,0,.04)');
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
