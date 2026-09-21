/* ══ Traduction de l'interface à l'exécution ══
   L'app est écrite en français, en dur, dans un bundle compilé. Plutôt que de
   toucher des milliers de chaînes dans ce bundle, on traduit ce qui s'affiche :
   un dictionnaire exact FR -> langue cible, plus quelques motifs pour les
   phrases construites (« 2 pronostics », « Metz ou match nul »…).

   Langue :
     1. ?lang=en dans l'URL (mémorisé) — pour tester et pour le futur sélecteur ;
     2. choix enregistré (localStorage ns_lang, via NS_SET_LANG) ;
     3. langue du téléphone / navigateur (fr, en, es, pt ; autre -> en).
   Les robots d'indexation restent en français : les pages web servies à Google
   sont françaises (titres, URL, contenu), il ne faut pas les mélanger.

   Le dictionnaire de la langue est chargé de façon synchrone dans le <head>
   (assets/i18n/<lang>.js) et appelle NS_I18N_START : l'observateur est alors
   branché avant que le corps de la page et React ne s'affichent, donc aucun
   texte français n'apparaît le temps d'un éclair. */
(function () {
  var LANGUES = ['fr', 'en', 'es', 'pt'];
  var VERSION_DICO = 14;  // 21/09/2026 : tout le mode tennis traduit (EN/ES/PT)
  // (10) 18/09/2026 : « Garde sa cage inviolée » -> « N’encaisse pas de but »

  // Le choix de langue se perdait et l'app repassait en anglais toute seule
  // (signale le 16/09/2026). localStorage seul ne suffit pas : dans la
  // WKWebView de l'app iOS il n'est pas toujours vide sur le disque avant une
  // fermeture forcee, et Safari purge le stockage ecrit par script apres
  // quelques jours. On double donc avec un cookie d'un an, relu en secours et
  // reecrit a chaque chargement — si l'un des deux saute, l'autre repond.
  function lireCookie() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)ns_lang=([a-z]{2})(?:;|$)/);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }
  function memoriser(l) {
    try { localStorage.setItem('ns_lang', l); } catch (e) {}
    try { document.cookie = 'ns_lang=' + l + ';path=/;max-age=31536000;SameSite=Lax'; } catch (e) {}
    // Troisieme copie, hors WebKit : l'app iOS la garde dans ses reglages et
    // la reinjecte au lancement suivant (window.NS_PREFS_NATIF). C'est la
    // seule qui survit a une fermeture forcee de l'app.
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ninjaPrefs) {
        window.webkit.messageHandlers.ninjaPrefs.postMessage({ cle: 'ns_lang', valeur: l });
      }
    } catch (e) {}
  }

  function lireNatif() {
    try {
      var v = window.NS_PREFS_NATIF && window.NS_PREFS_NATIF.ns_lang;
      return v || null;
    } catch (e) { return null; }
  }

  function detecter() {
    var q = null;
    try { q = new URLSearchParams(location.search).get('lang'); } catch (e) {}
    if (q && LANGUES.indexOf(q) >= 0) { memoriser(q); return q; }
    try {
      var s = localStorage.getItem('ns_lang');
      if (s && LANGUES.indexOf(s) >= 0) { memoriser(s); return s; }
    } catch (e) {}
    var c = lireCookie();
    if (c && LANGUES.indexOf(c) >= 0) { memoriser(c); return c; }
    var n = lireNatif();
    if (n && LANGUES.indexOf(n) >= 0) { memoriser(n); return n; }
    if (/bot|crawl|spider|slurp|lighthouse|pagespeed|headless/i.test(navigator.userAgent || '')) return 'fr';
    var liste = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'fr'];
    for (var i = 0; i < liste.length; i++) {
      var l = String(liste[i] || '').toLowerCase().slice(0, 2);
      if (LANGUES.indexOf(l) >= 0) return l;
    }
    return 'en';
  }

  var langue = detecter();
  window.NS_LANG = langue;
  document.documentElement.lang = langue;
  window.NS_SET_LANG = function (l) {
    if (LANGUES.indexOf(l) < 0) return;
    memoriser(l);
    // Un ?lang= resté dans l'adresse l'emporterait sur le choix : on le retire.
    try {
      var u = new URL(location.href);
      if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); location.replace(u.toString()); return; }
    } catch (e) {}
    location.reload();
  };

  // Valeurs neutres tant qu'aucun dictionnaire n'est chargé (français).
  var D = null, INV = null, MOTIFS = [];
  window.NS_T = function (fr) { return D && Object.prototype.hasOwnProperty.call(D, fr) ? D[fr] : fr; };
  // Inverse : retrouve le libellé français d'un texte affiché. Sert au code
  // existant qui repère des éléments d'après leur texte (ex. masquage mineurs).
  window.NS_FR = function (txt) { return INV && Object.prototype.hasOwnProperty.call(INV, txt) ? INV[txt] : txt; };

  if (langue === 'fr') return;

  var aDe = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var IGNORE = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1, SVG: 1, svg: 1 };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  function partie(x) { return aDe(D, x) ? D[x] : x; }

  function chercher(t) {
    if (aDe(D, t)) return D[t];
    var n = t.replace(/\s+/g, ' ');
    if (n !== t && aDe(D, n)) return D[n];
    for (var i = 0; i < MOTIFS.length; i++) {
      var m = n.match(MOTIFS[i][0]);
      if (m) {
        var r = MOTIFS[i][1](m, partie);
        if (r != null) return r;
      }
    }
    // Libellé encadré d'un emoji ou d'un symbole (« 🔖 Mes pronostics »,
    // « Accès Privé ⓘ », « Obtenir le bonus → ») : on traduit le cœur.
    var bords = n.match(/^([^A-Za-zÀ-ÿ0-9]*)(.*?)([^A-Za-zÀ-ÿ0-9.!?…)]*)$/);
    if (bords && (bords[1] || bords[3]) && bords[2] && aDe(D, bords[2])) {
      return bords[1] + D[bords[2]] + bords[3];
    }
    // « Premier League · Angleterre » : chaque morceau séparément.
    if (n.indexOf(' · ') > 0) {
      var morceaux = n.split(' · '), change = false;
      for (var j = 0; j < morceaux.length; j++) {
        var p = partie(morceaux[j]);
        if (p !== morceaux[j]) { morceaux[j] = p; change = true; }
      }
      if (change) return morceaux.join(' · ');
    }
    return null;
  }

  function traduire(s) {
    if (!s || s.length < 2 || s.length > 600) return null;
    var t = s.trim();
    if (!t || !/[A-Za-zÀ-ÿ]/.test(t)) return null;
    var r = chercher(t);
    if (r == null || r === t) return null;
    if (t === s) return r;
    var debut = s.match(/^\s*/)[0], fin = s.match(/\s*$/)[0];
    return debut + r + fin;
  }

  function texte(n) {
    var p = n.parentNode;
    if (!p || IGNORE[p.nodeName] || p.isContentEditable) return;
    var r = traduire(n.nodeValue);
    if (r != null) n.nodeValue = r;
  }

  function element(e) {
    if (IGNORE[e.nodeName]) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var v = e.getAttribute(ATTRS[i]);
      if (v) { var r = traduire(v); if (r != null) e.setAttribute(ATTRS[i], r); }
    }
    if (e.nodeName === 'INPUT' && /^(button|submit)$/i.test(e.type) && e.value) {
      var rv = traduire(e.value); if (rv != null) e.value = rv;
    }
  }

  function parcourir(racine) {
    if (!racine) return;
    if (racine.nodeType === 3) return texte(racine);
    if (racine.nodeType !== 1 || IGNORE[racine.nodeName]) return;
    element(racine);
    var w = document.createTreeWalker(racine, 5 /* ELEMENT | TEXT */, {
      acceptNode: function (n) {
        return n.nodeType === 1 && IGNORE[n.nodeName] ? 2 /* REJECT */ : 1 /* ACCEPT */;
      }
    });
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) texte(n); else element(n);
    }
  }

  window.NS_I18N_START = function (pack) {
    D = pack.dict || {};
    MOTIFS = pack.motifs || [];
    INV = {};
    for (var k in D) if (aDe(D, k) && !aDe(INV, D[k])) INV[D[k]] = k;

    // Traduction dans le rappel de l'observateur : il s'exécute juste après
    // la modification du DOM et avant l'affichage, donc sans clignotement.
    // Nos propres remplacements relancent l'observateur, mais un texte déjà
    // traduit n'a pas d'entrée dans le dictionnaire : la boucle s'arrête.
    new MutationObserver(function (liste) {
      for (var i = 0; i < liste.length; i++) {
        var rec = liste[i];
        if (rec.type === 'childList') {
          for (var j = 0; j < rec.addedNodes.length; j++) parcourir(rec.addedNodes[j]);
        } else if (rec.type === 'characterData') {
          texte(rec.target);
        } else if (rec.type === 'attributes') {
          element(rec.target);
        }
      }
    }).observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS
    });
    parcourir(document.documentElement);
    document.addEventListener('DOMContentLoaded', function () { parcourir(document.documentElement); });
  };

  document.write('<script src="/assets/i18n/' + langue + '.js?v=' + VERSION_DICO + '"><\/script>');
})();
