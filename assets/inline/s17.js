/* ══ Barre de sports du site (desktop) — 21/09/2026 ══
   Jusqu'ici le tennis n'avait aucune porte d'entree sur le site : il fallait
   connaitre ?sport=tennis. La pilule de bascule n'existait que sur l'accueil
   mobile, donc un visiteur du site ne pouvait pas savoir que NinjaScores fait
   du tennis.

   Barre de marque, comme Flashscore et Sofascore : bandeau sombre en haut de
   page, toujours sombre meme en theme clair — c'est ce qui la fait lire comme
   un element de la marque et non comme un ajout. Le choix pilote TOUTE l'app
   (accueil, calendrier, pronostics, classements) via NS_SPORT — la regle
   posee le 12/09 : « on choisit le sport une fois, tout suit ».

   Hors React : le header vient du bundle, on se contente d'inserer la barre
   juste avant `header.ns-head`.

   Sur mobile, rien : la pilule « ⚽ Foot ▾ » du header d'accueil fait deja
   le travail (NS_SelecteurSport, s13.js). */
(function () {
  var LARGEUR_MIN = 1000;   // en dessous, c'est la pilule mobile qui s'affiche
  var ID = 'ns-sportbar';
  var FOND = '#14121c';     // le noir de la marque (meme encre que les titres)
  var ACCENT = '#A78BFA';   // violet clair : lisible sur fond sombre
  var HAUT = 44;
  // Meme gouttiere que le header du bundle (padding '0 20px') : les deux
  // barres doivent s'aligner au pixel, sinon l'ajout se voit.
  var GOUTTIERE = 20;

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
    barre.style.cssText = 'display:flex;align-items:stretch;gap:2px;padding:0 ' + GOUTTIERE + 'px;'
      + 'height:' + HAUT + 'px;background:' + FOND + ';box-sizing:border-box;position:relative;z-index:21;'
      + 'font-family:inherit;';

    window.NS_SPORT.liste.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.sport = s.id;
      b.style.cssText = 'display:inline-flex;align-items:center;gap:8px;border:none;background:none;'
        + 'cursor:pointer;font-family:inherit;font-size:14.5px;font-weight:700;letter-spacing:.2px;'
        + 'padding:0 16px;height:100%;position:relative;transition:color .12s,background .12s;';
      var e = document.createElement('span');
      e.textContent = s.emoji;
      e.style.cssText = 'font-family:' + (window.NS_POLICE_EMOJI || 'inherit') + ';font-size:17px;line-height:1;';
      var n = document.createElement('span');
      n.textContent = s.nom;
      // Le trait sous l'onglet actif : c'est lui qui dit « vous etes ici »,
      // plus lisible qu'une nuance de gris sur fond sombre.
      var trait = document.createElement('span');
      trait.className = 'ns-sb-trait';
      trait.style.cssText = 'position:absolute;left:12px;right:12px;bottom:0;height:3px;border-radius:3px 3px 0 0;'
        + 'background:' + ACCENT + ';opacity:0;transition:opacity .12s;';
      b.appendChild(e); b.appendChild(n); b.appendChild(trait);
      b.addEventListener('click', function () {
        window.NS_SPORT.set(s.id);
        majURL(s.id);
      });
      b.addEventListener('mouseenter', function () { if (b.dataset.actif !== '1') b.style.color = '#fff'; });
      b.addEventListener('mouseleave', function () { if (b.dataset.actif !== '1') b.style.color = 'rgba(255,255,255,.62)'; });
      barre.appendChild(b);
    });

    // Signature a droite : la barre serait sinon un bandeau noir vide sur les
    // trois quarts de l'ecran. Le meme « 忍 NINJASCORES » que la carte du
    // Match du Ninja, en discret.
    var marque = document.createElement('span');
    marque.setAttribute('aria-hidden', 'true');
    marque.textContent = '忍 NINJASCORES';
    marque.style.cssText = 'margin-left:auto;display:flex;align-items:center;font-size:11px;font-weight:800;'
      + 'letter-spacing:2.4px;color:rgba(255,255,255,.32);user-select:none;';
    barre.appendChild(marque);

    header.parentNode.insertBefore(barre, header);
    peindre();
    window.NS_SPORT.abonner(peindre);
  }

  function peindre() {
    var barre = document.getElementById(ID);
    if (!barre) return;
    var courant = window.NS_SPORT.get();
    [].forEach.call(barre.querySelectorAll('button'), function (b) {
      var actif = b.dataset.sport === courant;
      b.dataset.actif = actif ? '1' : '0';
      b.style.color = actif ? '#fff' : 'rgba(255,255,255,.62)';
      b.style.background = actif ? 'rgba(255,255,255,.08)' : 'transparent';
      b.setAttribute('aria-current', actif ? 'true' : 'false');
      var trait = b.querySelector('.ns-sb-trait');
      if (trait) trait.style.opacity = actif ? '1' : '0';
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
