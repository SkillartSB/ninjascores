
(function() {
  // ── Detection TWA (app installee depuis le Play Store) ──
  // Chrome ajoute ce referrer specifique quand la page est lancee depuis une
  // Trusted Web Activity (l'app "native" packagee pour le store). Sur le web
  // classique (ninjascores.com dans un navigateur), document.referrer ne
  // commence jamais par ce schema.
  window.NS_isTWA = function () {
    try { return document.referrer.indexOf('android-app://') === 0; } catch (e) { return false; }
  };

  // Pont Live Activity (app iOS native, voir ios-app/) : le score suit le
  // match sur l'ecran verrouille / la Dynamic Island. Ininterrogeable et
  // silencieux hors de l'app iOS (navigateur classique, Android) — les
  // messageHandlers WKWebView n'existent que dans la coquille native.
  window.NS_LIVE_ACTIVITY = {
    disponible: function () {
      try { return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ninjaLiveActivity); }
      catch (e) { return false; }
    },
    envoyer: function (payload) {
      try { if (this.disponible()) window.webkit.messageHandlers.ninjaLiveActivity.postMessage(payload); }
      catch (e) {}
    },
    start: function (p) { this.envoyer(Object.assign({ action: 'start' }, p)); },
    update: function (p) { this.envoyer(Object.assign({ action: 'update' }, p)); },
    end: function () { this.envoyer({ action: 'end' }); },
  };

  // ── Bookmakers panel ──
  // Sur l'app Play Store (TWA), la promotion des partenaires paris sort de
  // l'app vers un navigateur externe (meme logique que Flashscore) au lieu
  // d'ouvrir un panneau in-app avec CTA de mise. Sur le web classique, le
  // panneau in-app reste inchange.
  // Verrou mineur. La promotion des paris (panneau bonus, programme
  // createur) ne doit JAMAIS s'ouvrir pour un compte de moins de 18 ans :
  // c'est ce que nous avons declare a Apple le 04/09 (« minors never see any
  // gambling-related content »). Le masquage CSS seul ne suffirait pas —
  // un appel programmatique passerait au travers.
  function refuseSiMineur() {
    return typeof window.NS_MAJEUR_OK !== 'undefined' && !window.NS_MAJEUR_OK;
  }

  window.openBookmakers = function() {
    if (refuseSiMineur()) return;
    if (window.NS_isTWA && window.NS_isTWA()) {
      window.open('https://ninjascores.com/pronostics/', '_blank', 'noopener');
      return;
    }
    // Mention ANJ (jeu responsable FR) : uniquement en France.
    try { var b = document.querySelector('#bk-overlay .anj-banner');
      if (b) b.style.display = (window.NS_GEO && NS_GEO.actif().code !== 'FR') ? 'none' : ''; } catch (e) {}
    document.getElementById('bk-overlay').classList.add('show');
  };
  window.closeBk = function() {
    document.getElementById('bk-overlay').classList.remove('show');
  };

  // ── Auth panel (OTP par e-mail) ──
  var _auOtpEmail = '';
  var _auOtpStep = 'email'; // 'email' | 'code'

  window.openAuth = function(mode) {
    _auOtpStep = 'email';
    _auOtpEmail = '';
    var panel = document.getElementById('auth-overlay');
    // Masquer les éléments mot de passe / onglets, adapter pour OTP
    var passField = document.getElementById('au-pass');
    if (passField) passField.parentElement.style.display = 'none';
    var tabs = document.querySelector('.au-seg');
    if (tabs) tabs.style.display = 'none';
    var forgot = document.getElementById('au-forgot');
    if (forgot) forgot.style.display = 'none';
    var legal = document.getElementById('au-legal');
    if (legal) legal.style.display = 'none';
    document.getElementById('au-title').textContent = 'Se connecter';
    document.getElementById('au-sub').textContent = 'Entre ton e-mail pour recevoir un code de vérification';
    document.getElementById('au-cta').textContent = 'Envoyer le code';
    var err = document.getElementById('au-error');
    if (err) { err.style.display = 'none'; err.style.color = ''; }
    panel.classList.add('show');
  };
  window.closeAuth = function() {
    document.getElementById('auth-overlay').classList.remove('show');
  };

  function traduireErreurAuth(msg) {
    if (/rate limit/i.test(msg)) return 'Trop de tentatives, réessaie dans quelques minutes.';
    if (/Unable to validate email|is invalid/i.test(msg)) return 'Adresse e-mail invalide.';
    if (/Invalid.*token|invalid.*otp/i.test(msg)) return 'Code incorrect ou expiré.';
    return msg;
  }

  window.authProvider = function() { return; };

  window.authSubmit = function() {
    if (!window.NS_SUPABASE) return;
    var errEl = document.getElementById('au-error');
    var cta = document.getElementById('au-cta');
    errEl.style.color = ''; errEl.style.display = 'none';

    if (_auOtpStep === 'email') {
      var email = document.getElementById('au-email').value.trim();
      if (!email || email.indexOf('@') < 1) {
        errEl.textContent = 'Adresse e-mail invalide.';
        errEl.style.display = 'block';
        return;
      }
      cta.disabled = true; cta.textContent = '…';
      window.NS_SUPABASE.auth.signInWithOtp({ email: email }).then(function (res) {
        cta.disabled = false;
        if (res.error) {
          cta.textContent = 'Envoyer le code';
          errEl.textContent = traduireErreurAuth(res.error.message);
          errEl.style.display = 'block';
          return;
        }
        _auOtpEmail = email;
        _auOtpStep = 'code';
        document.getElementById('au-title').textContent = 'Vérifie ton e-mail';
        document.getElementById('au-sub').textContent = 'Code envoyé à ' + email;
        document.getElementById('au-email').value = '';
        document.getElementById('au-email').placeholder = 'Code à 6 chiffres';
        document.getElementById('au-email').type = 'tel';
        document.getElementById('au-email').setAttribute('inputmode', 'numeric');
        document.getElementById('au-email').setAttribute('maxlength', '6');
        cta.textContent = 'Vérifier';
      }).catch(function () {
        cta.disabled = false; cta.textContent = 'Envoyer le code';
        errEl.textContent = 'Erreur réseau.'; errEl.style.display = 'block';
      });
    } else {
      var code = document.getElementById('au-email').value.trim();
      if (code.length !== 6) {
        errEl.textContent = 'Entre le code à 6 chiffres.';
        errEl.style.display = 'block';
        return;
      }
      cta.disabled = true; cta.textContent = '…';
      window.NS_SUPABASE.auth.verifyOtp({ email: _auOtpEmail, token: code, type: 'email' }).then(function (res) {
        cta.disabled = false; cta.textContent = 'Vérifier';
        if (res.error) {
          errEl.textContent = traduireErreurAuth(res.error.message);
          errEl.style.display = 'block';
          return;
        }
        window.NS_AUTH_SESSION = res.data.session;
        closeAuth();
        window.location.reload();
      }).catch(function () {
        cta.disabled = false; cta.textContent = 'Vérifier';
        errEl.textContent = 'Erreur réseau.'; errEl.style.display = 'block';
      });
    }
  };

  window.authForgotPassword = function() {};

  // ── Money / Creator panel ──
  window.openMoney = function() {
    if (refuseSiMineur()) return;
    document.getElementById('mn-overlay').classList.add('show');
  };
  window.closeMoney = function() {
    document.getElementById('mn-overlay').classList.remove('show');
  };
  window.updateMnCalc = function(v) {
    var views = parseInt(v);
    var rate = 0.75;
    var perVid = (views / 1000) * rate;
    var perMonth = perVid * 3;
    var vStr;
    if (views >= 1000000) vStr = (views / 1000000).toFixed(1).replace('.0', '') + ' M';
    else if (views >= 1000) vStr = (views / 1000).toFixed(0) + ' 000';
    else vStr = views.toString();
    document.getElementById('mn-views-display').textContent = vStr;
    document.getElementById('mn-per-vid').textContent = perVid.toFixed(2).replace('.', ',') + ' €';
    document.getElementById('mn-per-month').textContent = '~' + perMonth.toFixed(2).replace('.', ',') + ' €';
  };
  window.toggleMnFaq = function(el) {
    var answer = el.nextElementSibling;
    var icon = el.querySelector('.mn-faq-icon');
    var isOpen = answer.classList.contains('open');
    document.querySelectorAll('.mn-faq-a').forEach(function(a) { a.classList.remove('open'); });
    document.querySelectorAll('.mn-faq-icon').forEach(function(i) { i.textContent = '+'; });
    if (!isOpen) { answer.classList.add('open'); icon.textContent = '−'; }
  };

  // ── Pronostics bottom sheet ──
  window.openPronoSheet = function() {
    if (window.NS_HIDE_ODDS) return;
    document.getElementById('prono-sheet-overlay').classList.add('show');
  };
  window.closePronoSheet = function() {
    document.getElementById('prono-sheet-overlay').classList.remove('show');
  };
  window.handleSheetOverlayClick = function(e) {
    if (e.target === document.getElementById('prono-sheet-overlay')) closePronoSheet();
  };

  // ── Dropdown toggle ──
  window.toggleDd = function(id) {
    var btn = document.getElementById('btn-' + id);
    var menu = document.getElementById('menu-' + id);
    var isOpen = menu.classList.contains('show');
    closeAllDd();
    if (!isOpen) {
      menu.classList.add('show');
      btn.classList.add('open');
    }
  };
  function closeAllDd() {
    document.querySelectorAll('.nav-dropdown').forEach(function(m) { m.classList.remove('show'); });
    document.querySelectorAll('.nav-dd-btn').forEach(function(b) { b.classList.remove('open'); });
  }
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.nav-dd')) closeAllDd();
  });

  // ── Pricing modal retiré (abonnement supprimé) — no-op pour compat ──
  window.openPricing = function() {};
  window.closePricing = function() {};
  window.closePricingBtn = function() {};
  window.handleSubscribe = function() {};

  // ── Mes Pronostics panel ──
  var pronos = JSON.parse(localStorage.getItem('ns_pronos') || '[]');

  // Le numero ANJ (09 74 75 13 13) est un numero francais : reserve au
  // marche FR. Hors France, mention generique de jeu responsable.
  try {
    var _pd = document.getElementById('prono-disclaimer');
    if (_pd && window.NS_GEO && NS_GEO.actif().code !== 'FR') {
      _pd.textContent = 'Jouer responsable -18 ans';
    }
  } catch (e) {}

  window.openPronoPanel = function(e) {
    if (window.NS_HIDE_ODDS) return;
    if (e) e.preventDefault();
    closeAllDd();
    document.getElementById('prono-panel').classList.add('open');
    renderSlip();
  };
  window.closePronoPanel = function() {
    document.getElementById('prono-panel').classList.remove('open');
  };

  function renderSlip() {
    var slip = document.getElementById('prono-slip');
    var empty = document.getElementById('prono-empty');
    var totalEl = document.getElementById('prono-total-odds');
    var typeEl = document.getElementById('prono-type');
    var betBtn = document.getElementById('prono-bet-btn');
    var badge = document.getElementById('prono-count-badge');

    // Clear existing items (keep empty placeholder)
    slip.querySelectorAll('.prono-slip-item').forEach(function(el) { el.remove(); });

    if (pronos.length === 0) {
      empty.style.display = 'flex';
      totalEl.textContent = '—';
      typeEl.textContent = '—';
      betBtn.disabled = true;
      badge.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    badge.style.display = 'inline';
    badge.textContent = pronos.length;

    var totalOdds = pronos.reduce(function(acc, p) { return acc * p.cote; }, 1);

    pronos.forEach(function(p, i) {
      var item = document.createElement('div');
      item.className = 'prono-slip-item';
      item.innerHTML =
        '<span class="sport-icon">' + (p.sport || '⚽') + '</span>' +
        '<div class="info">' +
          '<div class="match-label">' + (p.match || 'Match') + '</div>' +
          '<div class="pick">' + p.pick + '</div>' +
        '</div>' +
        '<span class="cote">' + p.cote.toFixed(2) + '</span>' +
        '<button class="remove-btn" onclick="removeProno(' + i + ')">×</button>';
      slip.insertBefore(item, empty);
    });

    totalEl.textContent = totalOdds.toFixed(2);
    typeEl.textContent = pronos.length === 1 ? 'Pari simple' : 'Combiné ' + pronos.length + ' sélections';
    betBtn.disabled = false;
  }

  window.removeProno = function(idx) {
    pronos.splice(idx, 1);
    localStorage.setItem('ns_pronos', JSON.stringify(pronos));
    renderSlip();
  };

  // Exposed globally so the React app can call it
  window.addProno = function(prono) {
    // prono = { pick, cote, match, sport }
    var exists = pronos.some(function(p) { return p.pick === prono.pick && p.match === prono.match; });
    if (!exists) {
      pronos.push(prono);
      localStorage.setItem('ns_pronos', JSON.stringify(pronos));
    }
    renderSlip();
    document.getElementById('prono-panel').classList.add('open');
  };

  window.betNow = function() {
    // Lien affilié réel du partenaire actif (GEO-aware, comme le reste du
    // site) : Winamax en France, 1WIN/Melbet/888Starz en Afrique.
    var p = (window.NS_AFFIL && window.NS_AFFIL()) || {};
    window.open(p.url || 'https://winamax.fr', '_blank', 'noopener');
  };

  // Init badge count on load
  (function initBadge() {
    var badge = document.getElementById('prono-count-badge');
    if (pronos.length > 0) { badge.style.display = 'inline'; badge.textContent = pronos.length; }
  })();

  // Escape key closes modals
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closePricingBtn();
      closePronoPanel();
      closeAllDd();
    }
  });
})();
