
// ── Onboarding (apps natives iOS/Android uniquement) ─────────────────────────
// Flow : Prenom+Email → OTP → Date de naissance → Equipes favorites → Notifs → Bienvenue
(function () {
  var SB;
  var accent = '#6133E0';
  var accentDark = '#4A1FB8';
  var overlay, currentStep = 0;
  // Positionne par NS_showOnboarding : ouvrir sur la connexion plutot que sur
  // l'inscription.
  var ouvrirEnConnexion = false;
  var state = { firstName: '', email: '', password: '', userId: null, dob: null, teams: [], notifPrefs: {} };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'style' && typeof attrs[k] === 'object') Object.assign(e.style, attrs[k]);
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else if (c) e.appendChild(c);
    });
    return e;
  }

  function teamIdFromLogo(url) {
    var m = url && url.match(/teams\/(\d+)\./);
    return m ? parseInt(m[1], 10) : 0;
  }

  var FR_NAMES = { 489: 'AC Milan', 42: 'Arsenal', 529: 'FC Barcelone', 157: 'Bayern Munich', 49: 'Chelsea', 40: 'Liverpool', 80: 'Lyon', 50: 'Manchester City', 33: 'Manchester United', 81: 'Marseille', 85: 'Paris Saint-Germain', 541: 'Real Madrid', 496: 'Juventus', 2: 'France', 6: 'Brésil', 1: 'Allemagne', 10: 'Angleterre', 26: 'Cameroun', 15: 'Côte d\'Ivoire' };

  function frName(t) {
    var tid = teamIdFromLogo(t.l);
    return FR_NAMES[tid] || t.n;
  }

  function ctaStyle() {
    return { width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: 'linear-gradient(135deg, #7B4FE9 0%, ' + accent + ' 50%, ' + accentDark + ' 100%)', color: '#fff', fontSize: '16px', fontWeight: '800', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 20px rgba(97,51,224,0.4), 0 2px 6px rgba(97,51,224,0.3), inset 0 1px 0 rgba(255,255,255,0.2)', transition: 'transform 0.15s, box-shadow 0.15s', letterSpacing: '0.02em', animation: 'ob-pulse 2.5s ease-in-out infinite' };
  }

  function bindCtaHover(btn) {
    btn.addEventListener('pointerdown', function () { btn.style.animation = 'none'; btn.style.transform = 'scale(0.97)'; btn.style.boxShadow = '0 3px 12px rgba(97,51,224,0.3), inset 0 1px 0 rgba(255,255,255,0.15)'; });
    btn.addEventListener('pointerup', function () { btn.style.transform = ''; btn.style.boxShadow = ''; btn.style.animation = ''; });
    btn.addEventListener('pointerleave', function () { btn.style.transform = ''; btn.style.boxShadow = ''; btn.style.animation = ''; });
  }

  function inputStyle(extra) {
    var s = { width: '100%', padding: '15px 14px', borderRadius: '14px', border: '2px solid rgba(97,51,224,0.15)', background: '#fafafc', fontSize: '15px', fontFamily: 'inherit', color: '#0d0f1c', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s, background 0.2s' };
    if (extra) Object.assign(s, extra);
    return s;
  }

  function bindInputFocus(inp) {
    inp.addEventListener('focus', function () { inp.style.borderColor = accent; inp.style.background = '#fff'; });
    inp.addEventListener('blur', function () { inp.style.borderColor = 'rgba(97,51,224,0.15)'; inp.style.background = '#fafafc'; });
  }

  // Slide transition
  function slideToStep(renderFn) {
    var body = overlay.querySelector('.ob-body');
    body.style.transition = 'transform 0.3s ease, opacity 0.25s ease';
    body.style.transform = 'translateX(-30px)';
    body.style.opacity = '0';
    setTimeout(function () {
      renderFn();
      body.style.transform = 'translateX(30px)';
      requestAnimationFrame(function () {
        body.style.transform = 'translateX(0)';
        body.style.opacity = '1';
      });
    }, 260);
  }

  // Mini confetti burst
  function confetti() {
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;z-index:10;pointer-events:none';
    var panel = overlay.querySelector('.ob-panel');
    panel.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    canvas.width = panel.offsetWidth;
    canvas.height = panel.offsetHeight;
    var pieces = [];
    var colors = ['#6133E0', '#7B4FE9', '#A78BFA', '#F59E0B', '#10B981', '#EC4899', '#fff'];
    for (var i = 0; i < 60; i++) {
      pieces.push({ x: canvas.width / 2, y: canvas.height * 0.35, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 10 - 2, r: Math.random() * 4 + 2, c: colors[Math.floor(Math.random() * colors.length)], a: 1 });
    }
    var frame = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25;
        p.a -= 0.012;
        if (p.a <= 0) return;
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, p.r, p.r * 1.5);
      });
      frame++;
      if (frame < 90) requestAnimationFrame(draw);
      else canvas.remove();
    }
    draw();
  }

  // ── SVG assets ─────────────────────────────────────────────────────────────
  var ninjaLogoSVG = '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" fill="none"><ellipse cx="38" cy="18" rx="6" ry="10" fill="#7c2fbe" transform="rotate(-40 38 18)"/><ellipse cx="29" cy="28" rx="6" ry="9" fill="#7c2fbe" transform="rotate(15 29 28)"/><circle cx="40" cy="25" r="6" fill="#7c2fbe"/><circle cx="68" cy="52" r="46" fill="white" stroke="#7c2fbe" stroke-width="3"/><path d="M22 54 Q68 44 114 54 Q114 68 68 66 Q22 68 22 54 Z" fill="#7c2fbe"/><path d="M38 56 Q50 49 62 55 Q50 61 38 56 Z" fill="white"/><path d="M76 55 Q88 47 100 54 Q88 60 76 55 Z" fill="white"/></svg>';

  var ninjaEnvelopeSVG = '<svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" fill="none"><rect x="2" y="7" width="24" height="16" rx="3" fill="' + accent + '" opacity="0.15" stroke="' + accent + '" stroke-width="1.5"/><path d="M2 10l12 7 12-7" stroke="' + accent + '" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="14" cy="6" r="5" fill="white" stroke="' + accent + '" stroke-width="1.2"/><path d="M9.5 6.2Q14 4.5 18.5 6.2Q18.5 8 14 7.5Q9.5 8 9.5 6.2Z" fill="' + accent + '"/><path d="M11 5.5Q12.5 4.5 13.2 5.2Q12.5 5.8 11 5.5Z" fill="white"/><path d="M15.2 5.2Q16 4.5 17.2 5.3Q16 5.9 15.2 5.2Z" fill="white"/></svg>';

  var shurikenSVG = '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" fill="none"><circle cx="20" cy="20" r="3" fill="currentColor" opacity="0.07"/><path d="M20 2L22 17L20 14L18 17Z" fill="currentColor" opacity="0.07"/><path d="M38 20L23 22L26 20L23 18Z" fill="currentColor" opacity="0.07"/><path d="M20 38L18 23L20 26L22 23Z" fill="currentColor" opacity="0.07"/><path d="M2 20L17 18L14 20L17 22Z" fill="currentColor" opacity="0.07"/></svg>';

  // ── Inject CSS animations ──────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('ob-anim-css')) return;
    var style = document.createElement('style');
    style.id = 'ob-anim-css';
    style.textContent = '@keyframes ob-pulse{0%,100%{box-shadow:0 6px 20px rgba(97,51,224,0.4),0 2px 6px rgba(97,51,224,0.3),inset 0 1px 0 rgba(255,255,255,0.2)}50%{box-shadow:0 8px 28px rgba(97,51,224,0.55),0 3px 10px rgba(97,51,224,0.4),inset 0 1px 0 rgba(255,255,255,0.25)}}@keyframes ob-pop{0%{transform:scale(0.8);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}';
    document.head.appendChild(style);
  }

  // ── Step 1: Prenom + Email ─────────────────────────────────────────────────
  function renderEmail() {
    var modeConnexion = ouvrirEnConnexion;
    var wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    var sub = el('div', { style: { fontSize: '14px', color: 'rgba(0,0,0,0.5)', lineHeight: '1.6', textAlign: 'center' } },
      ['Sauvegarde tes favoris et reçois des alertes personnalisées.']);

    var nameInput = el('input', {
      type: 'text', placeholder: 'Ton prénom', autocomplete: 'given-name',
      style: inputStyle()
    });
    bindInputFocus(nameInput);

    var inputWrap = el('div', { style: { position: 'relative', width: '100%' } });
    var iconWrap = el('div', { style: { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '24px', height: '24px', pointerEvents: 'none' } });
    iconWrap.innerHTML = ninjaEnvelopeSVG;
    var emailInput = el('input', {
      type: 'email', placeholder: 'ton@email.com', autocomplete: 'email',
      style: inputStyle({ paddingLeft: '44px' })
    });
    bindInputFocus(emailInput);
    inputWrap.append(iconWrap, emailInput);

    // Mot de passe — visible en mode connexion, et OBLIGATOIRE.
    //
    // Pourquoi ce champ existe : Google Play a refuse l'app deux fois en
    // reclamant « an active demo/guest account or a valid username and
    // password ». Or l'app ne savait se connecter que par code a usage unique,
    // envoye par e-mail. Google ecrit explicitement qu'un code temporaire ne
    // convient pas et qu'il lui faut des identifiants reutilisables : sans
    // saisie de mot de passe, le couple fourni au testeur serait inutilisable.
    //
    // Une premiere version le marquait « facultatif » et retombait sur le code
    // quand il etait vide. C'etait une invitation a le laisser vide : le
    // testeur se serait retrouve devant une demande de code qu'il ne peut pas
    // recevoir, exactement le blocage qu'on cherche a supprimer. Il est donc
    // exige, et le code par e-mail devient un lien secondaire explicite.
    var pwdInput = el('input', {
      type: 'password', placeholder: 'Mot de passe', autocomplete: 'current-password',
      style: inputStyle()
    });
    bindInputFocus(pwdInput);
    // Visible dans les deux modes : a l'inscription pour que le compte NAISSE
    // avec un mot de passe, a la connexion pour s'en servir.
    var pwdWrap = el('div', { style: { width: '100%' } }, [pwdInput]);

    // Minimum impose par Supabase. Le verifier ici evite un aller-retour
    // reseau pour un refus previsible.
    var MDP_MIN = 6;

    var err = el('div', { style: { fontSize: '12px', color: '#DC2626', textAlign: 'center', display: 'none' } });
    var cta = el('button', {
      style: ctaStyle(),
      onclick: function () {
        var name = nameInput.value.trim();
        var email = emailInput.value.trim();
        var pwd = pwdInput.value;
        if (!modeConnexion && !name) { err.textContent = 'Entre ton prénom pour continuer.'; err.style.display = 'block'; return; }
        if (!email || email.indexOf('@') < 1) { err.textContent = 'Adresse e-mail invalide.'; err.style.display = 'block'; return; }
        // A l'inscription, le mot de passe est exige lui aussi : sinon les
        // nouveaux comptes naitraient sans, et ne pourraient jamais se
        // connecter par l'ecran principal.
        if (!modeConnexion) {
          if (!pwd) { err.textContent = 'Choisis un mot de passe.'; err.style.display = 'block'; pwdInput.focus(); return; }
          if (pwd.length < MDP_MIN) {
            err.textContent = 'Mot de passe trop court (' + MDP_MIN + ' caractères minimum).';
            err.style.display = 'block'; pwdInput.focus(); return;
          }
        }
        err.style.display = 'none';
        state.firstName = name;
        state.password = modeConnexion ? '' : pwd;

        // En mode connexion, le mot de passe est exige : pas de repli
        // silencieux vers le code, qui reintroduirait le mur pour le testeur.
        if (modeConnexion && !pwd) {
          err.textContent = 'Entre ton mot de passe.'; err.style.display = 'block';
          pwdInput.focus();
          return;
        }

        // Connexion directe, et on entre dans l'app : un compte existant n'a
        // rien a refaire du parcours d'inscription.
        if (modeConnexion) {
          cta.disabled = true; cta.textContent = 'Connexion…'; cta.style.animation = 'none';
          SB.auth.signInWithPassword({ email: email, password: pwd }).then(function (res) {
            cta.disabled = false; cta.textContent = 'Se connecter'; cta.style.animation = '';
            if (res.error) {
              err.textContent = /Invalid login/i.test(res.error.message)
                ? 'E-mail ou mot de passe incorrect.'
                // Piege classique d'un compte cree a la main dans Supabase sans
                // cocher la confirmation automatique : le mot de passe est bon,
                // mais la connexion echoue quand meme.
                : /Email not confirmed/i.test(res.error.message)
                  ? 'Ce compte n’a pas encore été confirmé.'
                  : res.error.message;
              err.style.display = 'block';
              return;
            }
            window.NS_AUTH_SESSION = res.data.session;
            quitterOnboarding();
            // L'en-tete et les favoris ne lisent la session qu'au demarrage :
            // sans rechargement, le bouton afficherait encore « Se connecter »
            // apres une connexion reussie — un testeur en conclurait que ses
            // identifiants ne marchent pas. Supabase persiste la session, elle
            // est donc retrouvee au rechargement.
            setTimeout(function () { window.location.reload(); }, 400);
          }).catch(function () {
            cta.disabled = false; cta.textContent = 'Se connecter'; cta.style.animation = '';
            err.textContent = 'Erreur réseau, réessaie.'; err.style.display = 'block';
          });
          return;
        }

        envoyerCode(email);
      }
    }, ['Recevoir mon code magique']);
    bindCtaHover(cta);

    // ── Sign in with Apple ──────────────────────────────────────────────────
    // Deux chemins pour le meme resultat (une session Supabase) :
    //  - app iOS avec le pont natif (build >= 1.1) : la feuille Apple systeme
    //    (Face ID), puis signInWithIdToken avec le jeton d'identite ;
    //  - web et anciens builds : redirection OAuth vers appleid.apple.com,
    //    retour sur cette page avec ?apple=1, session posee par supabase-js.
    // Le parcours reprend ensuite la ou l'inscription classique en est apres le
    // code : date de naissance si le profil n'en a pas, sinon on entre.
    var sepApple = el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', color: 'rgba(0,0,0,0.35)', fontSize: '12px' } }, [
      el('div', { style: { flex: '1', height: '1px', background: 'rgba(0,0,0,0.1)' } }),
      'ou',
      el('div', { style: { flex: '1', height: '1px', background: 'rgba(0,0,0,0.1)' } })
    ]);
    var btnApple = el('button', {
      type: 'button',
      style: { width: '100%', padding: '13px 16px', borderRadius: '14px', border: 'none', background: '#000', color: '#fff',
               fontSize: '15px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center',
               justifyContent: 'center', gap: '10px', fontFamily: 'inherit' },
      onclick: function () { connexionApple(btnApple, err); }
    });
    btnApple.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M16.365 1.43c0 1.14-.46 2.23-1.2 3.05-.8.87-2.1 1.55-3.17 1.46-.14-1.1.4-2.26 1.13-3.03.8-.85 2.18-1.5 3.24-1.48zM20.6 17.3c-.6 1.37-.88 1.98-1.65 3.19-1.07 1.67-2.58 3.75-4.45 3.77-1.66.02-2.09-1.09-4.34-1.08-2.25.01-2.72 1.1-4.39 1.08-1.87-.02-3.3-1.9-4.37-3.57C-1.7 15.76-2 10.5.42 7.7c1.72-1.98 4.43-2.25 6.06-2.25 1.66 0 2.7 1.14 4.07 1.14 1.33 0 2.14-1.14 4.06-1.14 1.45 0 3.03.79 4.14 2.16-3.64 2-3.05 7.2.85 8.69-.36.9-.6 1.48-1 2z"/></svg><span>Continuer avec Apple</span>';

    // ── Google (web seulement) ──────────────────────────────────────────────
    // Google Identity Services rendu SUR ninjascores.com : le jeton d'identite
    // arrive a la page, Supabase ne fait que le verifier (signInWithIdToken).
    // L'ecran Google dit donc « continuer vers ninjascores.com » — plus jamais
    // l'adresse technique Supabase qui avait fait retirer Google en juillet
    // (commit 63a672b), et sans domaine personnalise Supabase payant.
    // Pas dans la coque iOS : Google refuse ses ecrans dans une WKWebView, et
    // Apple y est deja en natif.
    var divGoogle = el('div', { style: { width: '100%', minHeight: '0px', display: 'flex', justifyContent: 'center' } });
    if (window.NS_GOOGLE_CLIENT_ID && window.NS_IS_NATIVE && window.NS_IS_NATIVE() !== 'ios') {
      monterBoutonGoogle(divGoogle, err);
    }

    // Extrait du bouton pour servir aussi au lien « recevoir un code », que le
    // mode connexion propose en secours.
    function envoyerCode(email) {
      var libelle = cta.textContent;
      cta.disabled = true; cta.textContent = 'Envoi…'; cta.style.animation = 'none';
      SB.auth.signInWithOtp({ email: email }).then(function (res) {
        cta.disabled = false; cta.textContent = libelle; cta.style.animation = '';
        if (res.error) { err.textContent = res.error.message.indexOf('rate') >= 0 ? 'Trop de tentatives, patiente un instant.' : res.error.message; err.style.display = 'block'; return; }
        state.email = email;
        slideToStep(renderOTP);
      }).catch(function () { cta.disabled = false; cta.textContent = libelle; cta.style.animation = ''; err.textContent = 'Erreur réseau, réessaie.'; err.style.display = 'block'; });
    }

    // Secours pour les comptes crees avant l'ajout du mot de passe : ils n'en
    // ont aucun, et exiger un mot de passe sans cette porte les enfermerait
    // dehors. Volontairement discret — le chemin principal reste le mot de
    // passe, celui que le testeur Google Play utilisera.
    var lienCode = el('div', {
      style: { display: 'none', fontSize: '12px', color: 'rgba(0,0,0,0.45)',
               textAlign: 'center', cursor: 'pointer', padding: '2px 0' }
    }, ['Recevoir plutôt un code par e-mail']);
    lienCode.addEventListener('click', function () {
      var email = emailInput.value.trim();
      if (!email || email.indexOf('@') < 1) {
        err.textContent = 'Adresse e-mail invalide.'; err.style.display = 'block'; return;
      }
      err.style.display = 'none';
      envoyerCode(email);
    });

    // Bascule inscription / connexion. Le code par e-mail fait les deux, mais
    // demander un prenom a quelqu'un qui a deja un compte n'a aucun sens — et
    // rien n'indiquait a un utilisateur existant qu'il etait au bon endroit.
    var bascule = el('div', {
      style: { fontSize: '13px', color: accent, fontWeight: '700', textAlign: 'center',
               cursor: 'pointer', padding: '4px 0', marginTop: '-4px' }
    }, ['J’ai déjà un compte']);
    // Extrait de l'ecouteur pour servir aussi a l'ouverture directe en mode
    // connexion : les deux chemins doivent produire exactement le meme ecran.
    function appliquerMode() {
      nameInput.style.display = modeConnexion ? 'none' : '';
      pwdInput.placeholder = modeConnexion
        ? 'Mot de passe'
        : 'Mot de passe (' + MDP_MIN + ' caractères min.)';
      // Indique au gestionnaire de mots de passe s'il doit proposer un mot de
      // passe existant ou en generer un nouveau.
      pwdInput.autocomplete = modeConnexion ? 'current-password' : 'new-password';
      // Le code par e-mail ne concerne que les comptes deja crees.
      lienCode.style.display = modeConnexion ? '' : 'none';
      err.style.display = 'none';
      var titre = overlay.querySelector('.ob-title');
      if (titre) titre.textContent = modeConnexion ? 'Connecte-toi à' : 'Crée ton compte';
      sub.textContent = modeConnexion
        ? 'Entre ton e-mail et ton mot de passe.'
        : 'Sauvegarde tes favoris et reçois des alertes personnalisées.';
      cta.textContent = modeConnexion ? 'Se connecter' : 'Recevoir mon code magique';
      bascule.textContent = modeConnexion
        ? 'Je n’ai pas encore de compte'
        : 'J’ai déjà un compte';
    }
    bascule.addEventListener('click', function () {
      modeConnexion = !modeConnexion;
      pwdInput.value = '';
      appliquerMode();
    });

    emailInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') cta.click(); });
    pwdInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') cta.click(); });
    nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') emailInput.focus(); });
    var plusTard = el('div', {
      style: { fontSize: '13px', color: 'rgba(0,0,0,0.45)', textAlign: 'center',
               cursor: 'pointer', padding: '10px 0 2px' }
    }, ['Fermer']);
    plusTard.addEventListener('click', quitterOnboarding);

    // Apple et Google EN PREMIER : un geste, zero e-mail a envoyer (le formulaire
    // e-mail consomme un code Resend par inscription, plafonne a 100/jour en
    // gratuit). Le separateur « ou » passe donc entre les deux blocs.
    wrap.append(sub, btnApple, divGoogle, sepApple, nameInput, inputWrap, pwdWrap, err, cta, lienCode, bascule, plusTard);
    setBody('Crée ton compte', '', wrap, 0, true);
    // setBody ecrit le titre : on applique le mode APRES, sinon « Connecte-toi
    // a » serait aussitot ecrase par « Cree ton compte ». Appele dans les deux
    // modes, car l'inscription a maintenant elle aussi son champ mot de passe
    // a libeller.
    appliquerMode();
    setTimeout(function () { (modeConnexion ? emailInput : nameInput).focus(); }, 150);
  }

  function renderOTP() {
    var wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px', alignItems: 'center' } });
    var sub = el('div', { style: { fontSize: '14px', color: 'rgba(0,0,0,0.5)', lineHeight: '1.6', textAlign: 'center' } },
      ['On a envoyé un code à ', el('strong', {}, [state.email])]);
    var inputs = [];
    var row = el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center' } });
    for (var i = 0; i < 6; i++) {
      (function (idx) {
        var inp = el('input', {
          type: 'tel', maxlength: '1', inputmode: 'numeric',
          style: { width: '46px', height: '56px', textAlign: 'center', fontSize: '22px', fontWeight: '800', borderRadius: '14px', border: '2px solid rgba(97,51,224,0.15)', background: '#fafafc', fontFamily: 'inherit', color: '#0d0f1c', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }
        });
        inp.addEventListener('input', function () {
          if (inp.value.length === 1 && idx < 5) inputs[idx + 1].focus();
          if (inputs.every(function (x) { return x.value.length === 1; })) verifyCode();
        });
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Backspace' && !inp.value && idx > 0) inputs[idx - 1].focus();
        });
        inp.addEventListener('paste', function (e) {
          e.preventDefault();
          var paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
          for (var j = 0; j < paste.length; j++) { if (inputs[j]) inputs[j].value = paste[j]; }
          if (paste.length === 6) verifyCode();
        });
        inp.addEventListener('focus', function () { inp.style.borderColor = accent; });
        inp.addEventListener('blur', function () { inp.style.borderColor = 'rgba(97,51,224,0.15)'; });
        inputs.push(inp);
        row.appendChild(inp);
      })(i);
    }
    var err = el('div', { style: { fontSize: '12px', color: '#DC2626', textAlign: 'center', display: 'none' } });
    var resend = el('button', {
      style: { background: 'none', border: 'none', color: accent, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', padding: '4px' },
      onclick: function () {
        SB.auth.signInWithOtp({ email: state.email }).then(function (res) {
          if (res.error) { err.textContent = 'Erreur, réessaie.'; err.style.display = 'block'; }
          else { resend.textContent = 'Code renvoyé !'; setTimeout(function () { resend.textContent = 'Renvoyer le code'; }, 3000); }
        });
      }
    }, ['Renvoyer le code']);
    wrap.append(sub, row, err, resend);
    setBody('Regarde ta boîte mail', 'Entre le code à 6 chiffres', wrap, 0);
    setTimeout(function () { inputs[0].focus(); }, 100);

    function verifyCode() {
      var code = inputs.map(function (x) { return x.value; }).join('');
      err.style.display = 'none';
      SB.auth.verifyOtp({ email: state.email, token: code, type: 'email' }).then(function (res) {
        if (res.error) {
          err.textContent = 'Code incorrect ou expire.';
          err.style.display = 'block';
          inputs.forEach(function (x) { x.value = ''; });
          inputs[0].focus();
          return;
        }
        state.userId = res.data.user.id;
        window.NS_AUTH_SESSION = res.data.session;

        // Le mot de passe est pose MAINTENANT, une fois la session ouverte,
        // et non via signUp() a l'ecran precedent. Raison : signUp declenche le
        // modele d'e-mail « Confirm signup », different de celui du code a six
        // chiffres qu'on utilise ici. Si ce modele contient un lien plutot
        // qu'un jeton, cet ecran de saisie n'aurait plus rien a verifier.
        // Passer par updateUser garde le parcours existant intact et laisse le
        // compte avec un e-mail verifie ET un mot de passe.
        if (state.password) {
          SB.auth.updateUser({ password: state.password }).then(function (u) {
            // Un echec ici ne doit pas bloquer l'inscription : l'utilisateur
            // est deja connecte. Il lui restera le code par e-mail.
            if (u && u.error) console.warn('[onboarding] mot de passe non enregistre :', u.error.message);
            state.password = '';
          }).catch(function () { state.password = ''; });
        }

        confetti();
        currentStep = 1;
        setTimeout(function () { slideToStep(renderDOB); }, 600);
      }).catch(function () { err.textContent = 'Erreur réseau.'; err.style.display = 'block'; });
    }
  }

  // Apres une session Apple (native ou OAuth) : reprendre le parcours au bon
  // endroit. Le prenom vient d'Apple la PREMIERE fois seulement (full_name
  // dans user_metadata) — on le garde pour le profil.
  function poursuivreApresApple(session) {
    window.NS_AUTH_SESSION = session;
    var u = session && session.user;
    state.userId = u && u.id;
    var meta = (u && u.user_metadata) || {};
    if (!state.firstName) {
      var nom = meta.full_name || meta.name || '';
      state.firstName = String(nom).trim().split(/\s+/)[0] || '';
    }
    return SB.from('profiles').select('id, first_name, date_of_birth, onboarding_completed').eq('id', state.userId).maybeSingle()
      .then(function (r) {
        var d = r && r.data;
        // Compte deja termine (date de naissance connue) : on entre directement.
        if (window.NS_IOS_NATIF) { finirSansOnboardingIOS(); return; }   // iOS : jamais d'onboarding
        var termine = d && d.date_of_birth;
        if (termine) { quitterOnboarding(); setTimeout(function () { window.location.reload(); }, 300); return; }
        if (d && d.first_name && !state.firstName) state.firstName = d.first_name;
        confetti();
        currentStep = 1;
        setTimeout(function () { slideToStep(renderDOB); }, 600);
      })
      .catch(function () { if (window.NS_IOS_NATIF) { finirSansOnboardingIOS(); return; } currentStep = 1; slideToStep(renderDOB); });
  }

  function pontAppleNatif() {
    try { return window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ninjaAppleSignIn; } catch (e) { return null; }
  }

  function connexionApple(bouton, err) {
    err.style.display = 'none';
    bouton.disabled = true; bouton.style.opacity = '0.7';
    var retablir = function () { bouton.disabled = false; bouton.style.opacity = ''; };
    var pont = pontAppleNatif();
    if (pont) {
      // Le natif repond via window.NS_APPLE_NATIF({identityToken, nonce}) ou
      // ({erreur}) — voir ContentView.swift (AppleSignInBridge).
      window.NS_APPLE_NATIF = function (res) {
        window.NS_APPLE_NATIF = null;
        if (!res || res.erreur || !res.identityToken) {
          retablir();
          if (res && res.erreur && res.erreur !== 'annule') { err.textContent = 'Connexion Apple impossible. Réessaie.'; err.style.display = 'block'; }
          return;
        }
        SB.auth.signInWithIdToken({ provider: 'apple', token: res.identityToken, nonce: res.nonce }).then(function (r) {
          if (r.error) { retablir(); err.textContent = r.error.message; err.style.display = 'block'; return; }
          if (res.fullName && !state.firstName) state.firstName = String(res.fullName).trim().split(/\s+/)[0];
          poursuivreApresApple(r.data.session);
        }).catch(function () { retablir(); err.textContent = 'Erreur réseau, réessaie.'; err.style.display = 'block'; });
      };
      try { pont.postMessage({ action: 'start' }); } catch (e) { window.NS_APPLE_NATIF = null; retablir(); }
      return;
    }
    // Web : redirection. On revient sur la MEME page avec ?apple=1, marqueur
    // lu au chargement pour rouvrir le parcours (date de naissance) si besoin.
    var retour = window.location.origin + window.location.pathname + '?apple=1';
    SB.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: retour } }).then(function (r) {
      if (r && r.error) { retablir(); err.textContent = r.error.message; err.style.display = 'block'; }
    }).catch(function () { retablir(); err.textContent = 'Erreur réseau, réessaie.'; err.style.display = 'block'; });
  }

  var gisPret = null;
  function chargerGIS() {
    if (gisPret) return gisPret;
    gisPret = new Promise(function (ok, ko) {
      if (window.google && window.google.accounts) return ok();
      var sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.defer = true;
      sc.onload = function () { ok(); }; sc.onerror = function () { gisPret = null; ko(new Error('gsi')); };
      document.head.appendChild(sc);
    });
    return gisPret;
  }

  function monterBoutonGoogle(conteneur, err) {
    chargerGIS().then(function () {
      window.google.accounts.id.initialize({
        client_id: window.NS_GOOGLE_CLIENT_ID,
        ux_mode: 'popup',
        auto_select: false,
        callback: function (rep) {
          err.style.display = 'none';
          if (!rep || !rep.credential) return;
          SB.auth.signInWithIdToken({ provider: 'google', token: rep.credential }).then(function (r) {
            if (r.error) { err.textContent = r.error.message; err.style.display = 'block'; return; }
            poursuivreApresApple(r.data.session);   // meme reprise que pour Apple
          }).catch(function () { err.textContent = 'Erreur réseau, réessaie.'; err.style.display = 'block'; });
        }
      });
      // Bouton officiel Google (charte respectee), pleine largeur, en francais.
      window.google.accounts.id.renderButton(conteneur, {
        type: 'standard', theme: 'outline', size: 'large', shape: 'pill',
        text: 'continue_with', locale: 'fr', logo_alignment: 'left',
        width: Math.min(400, Math.max(200, conteneur.clientWidth || 320))
      });
    }).catch(function () { /* script bloque (adblock) : pas de bouton, rien d'autre ne casse */ });
  }

  // ── Step 2: Date of birth ──────────────────────────────────────────────────
  function finirSansOnboardingIOS() {
    window.NS_MAJEUR_OK = true;
    window.NS_HIDE_ODDS = false;
    try { document.documentElement.classList.remove('ns-minor'); } catch (e) {}
    var fin = function () { quitterOnboarding(); setTimeout(function () { window.location.reload(); }, 350); };
    if (!state.userId || !SB) { fin(); return; }
    var maj = { id: state.userId, onboarding_completed: true, updated_at: new Date().toISOString() };
    if (state.firstName) maj.first_name = state.firstName;
    Promise.resolve(SB.from('profiles').upsert(maj)).then(fin, fin);
  }

  function renderDOB() {
    // App iOS (classee 18+) : AUCUN onboarding (ni date de naissance, ni favoris,
    // ni notifications). Le compte est cree : on ferme et on recharge l'app.
    if (window.NS_IOS_NATIF) { finirSansOnboardingIOS(); return; }
    var wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px' } });
    var sub = el('div', { style: { fontSize: '14px', color: 'rgba(0,0,0,0.5)', lineHeight: '1.6', textAlign: 'center' } },
      ['Ça nous permet d\'adapter ton expérience.']);
    var row = el('div', { style: { display: 'flex', gap: '8px' } });
    var selStyle = { flex: '1', padding: '14px 8px', borderRadius: '14px', border: '2px solid rgba(97,51,224,0.15)', background: '#fafafc', fontSize: '14px', fontFamily: 'inherit', color: '#0d0f1c', appearance: 'none', WebkitAppearance: 'none', transition: 'border-color 0.2s' };
    var dayS = el('select', { style: selStyle }); dayS.innerHTML = '<option value="">Jour</option>'; for (var d = 1; d <= 31; d++) dayS.innerHTML += '<option value="' + d + '">' + d + '</option>';
    var monthS = el('select', { style: selStyle }); monthS.innerHTML = '<option value="">Mois</option>';
    var months = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
    months.forEach(function (m, i) { monthS.innerHTML += '<option value="' + (i + 1) + '">' + m + '</option>'; });
    var yearS = el('select', { style: selStyle }); yearS.innerHTML = '<option value="">Annee</option>';
    var cy = new Date().getFullYear();
    for (var y = cy - 10; y >= cy - 80; y--) yearS.innerHTML += '<option value="' + y + '">' + y + '</option>';
    row.append(dayS, monthS, yearS);
    var err = el('div', { style: { fontSize: '12px', color: '#DC2626', textAlign: 'center', display: 'none' } });
    var cta = el('button', {
      style: ctaStyle(),
      onclick: function () {
        var dv = dayS.value, mv = monthS.value, yv = yearS.value;
        if (!dv || !mv || !yv) { err.textContent = 'Sélectionne ta date de naissance complète.'; err.style.display = 'block'; return; }
        var dob = yv + '-' + String(mv).padStart(2, '0') + '-' + String(dv).padStart(2, '0');
        state.dob = dob;
        var age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        if (age < 13) { err.textContent = 'Tu dois avoir au moins 13 ans pour utiliser NinjaScores.'; err.style.display = 'block'; return; }
        // Etat optimiste : l'ecriture du profil puis sa relecture arrivent
        // plus tard, or l'interface doit deja etre coherente a cet instant.
        window.NS_MAJEUR_OK = age >= 18;
        window.NS_HIDE_ODDS = age < 18;
        cta.disabled = true; cta.textContent = '…'; cta.style.animation = 'none';
        SB.from('profiles').upsert({ id: state.userId, first_name: state.firstName, date_of_birth: dob, updated_at: new Date().toISOString() }).then(function () {
          cta.disabled = false;
          currentStep = 2;
          slideToStep(renderFavorites);
        }).catch(function () { cta.disabled = false; cta.textContent = 'Continuer'; cta.style.animation = ''; err.textContent = 'Erreur, réessaie.'; err.style.display = 'block'; });
      }
    }, ['Continuer']);
    bindCtaHover(cta);
    wrap.append(sub, row, err, cta);
    setBody('Pour mieux te connaitre', '', wrap, 1);
  }

  // ── Step 3: Favorite teams ─────────────────────────────────────────────────
  function renderFavorites() {
    var wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
    var sub = el('div', { style: { fontSize: '14px', color: 'rgba(0,0,0,0.5)', lineHeight: '1.6', textAlign: 'center' } },
      ['Choisis jusqu\'à 5 équipes pour personnaliser ton feed.']);
    var search = el('input', {
      type: 'text', placeholder: 'Rechercher une équipe…',
      style: inputStyle({ padding: '13px 14px' })
    });
    bindInputFocus(search);

    var selectedWrap = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '0' } });
    var grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', maxHeight: '260px', overflowY: 'auto', padding: '4px 0' } });
    var allTeams = [];
    // 54 noms sont portes par des clubs reellement differents selon le pays
    // (Al Arabi au Qatar et au Koweit). Impossible de les fusionner : on
    // affiche le pays pour lever l'ambiguite, plutot que de laisser deux
    // lignes identiques que l'utilisateur lit comme un doublon.
    var ambigus = {};
    function labelFor(t) {
      var n = frName(t);
      return (ambigus[n] && t.p) ? n + ' (' + t.p + ')' : n;
    }
    var selected = new Set();

    var popularIds = [85, 529, 50, 42, 33, 49, 40, 157, 496, 489, 80, 81, 541, 2, 6, 1, 10, 26, 15];

    function renderGrid(list) {
      grid.innerHTML = '';
      list.slice(0, 30).forEach(function (t) {
        var tid = teamIdFromLogo(t.l);
        var isSel = selected.has(tid);
        var card = el('div', {
          style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '10px 4px', borderRadius: '14px', border: isSel ? '2px solid ' + accent : '2px solid transparent', background: isSel ? 'rgba(97,51,224,0.08)' : '#fafafc', cursor: 'pointer', transition: 'all 0.15s' },
          onclick: function () {
            if (selected.has(tid)) { selected.delete(tid); }
            else {
              if (selected.size >= 5) return;
              selected.add(tid);
              card.style.animation = 'ob-pop 0.3s ease';
            }
            renderGrid(list);
            renderSelected();
          }
        }, [
          el('img', { src: t.l, style: { width: '36px', height: '36px', objectFit: 'contain' }, onerror: function () { this.style.display = 'none'; } }),
          el('div', { style: { fontSize: '11px', fontWeight: '600', color: '#0d0f1c', textAlign: 'center', lineHeight: '1.2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90px' } }, [labelFor(t)])
        ]);
        grid.appendChild(card);
      });
    }

    function renderSelected() {
      selectedWrap.innerHTML = '';
      if (selected.size === 0) return;
      selected.forEach(function (tid) {
        var t = allTeams.find(function (x) { return teamIdFromLogo(x.l) === tid; });
        if (!t) return;
        var chip = el('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px 4px 6px', borderRadius: '20px', background: accent, color: '#fff', fontSize: '11px', fontWeight: '700', animation: 'ob-pop 0.25s ease' } }, [
          el('img', { src: t.l, style: { width: '18px', height: '18px', objectFit: 'contain' } }),
          el('span', {}, [labelFor(t)]),
          el('span', { style: { cursor: 'pointer', marginLeft: '4px', opacity: '0.7' }, onclick: function (e) { e.stopPropagation(); selected.delete(tid); renderGrid(currentList()); renderSelected(); } }, ['x'])
        ]);
        selectedWrap.appendChild(chip);
      });
    }

    var lastList = [];
    function currentList() { return lastList; }

    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      if (!q) { lastList = getPopular(); renderGrid(lastList); return; }
      lastList = dedup(allTeams.filter(function (t) { return frName(t).toLowerCase().indexOf(q) >= 0 || t.n.toLowerCase().indexOf(q) >= 0; }));
      renderGrid(lastList);
    });

    function dedup(list) {
      var seen = {};
      return list.filter(function (t) {
        var tid = teamIdFromLogo(t.l);
        if (seen[tid]) return false;
        seen[tid] = true;
        return true;
      });
    }

    function getPopular() {
      return dedup(allTeams.filter(function (t) { return popularIds.indexOf(teamIdFromLogo(t.l)) >= 0; }));
    }

    // Equipes reserve, jeunes et feminines : jamais ce qu'on met en favori, et
    // elles font doublon avec le club principal dans la liste (« Borussia
    // Dortmund » et « Borussia Dortmund II »). Le dedup ne pouvait pas les
    // attraper : ce sont deux clubs distincts, avec deux identifiants.
    var RESERVE = /( II| III| B| C| U-?1[5-9]| U-?2[0-3]| Reserves?| Youth| Academy| W)$/i;

    fetch('/data/teams-index.json').then(function (r) { return r.json(); }).then(function (data) {
      allTeams = (data || []).filter(function (t) { return !RESERVE.test(t.n || ''); });
      var cpt = {};
      allTeams.forEach(function (t) { var n = frName(t); cpt[n] = (cpt[n] || 0) + 1; });
      Object.keys(cpt).forEach(function (n) { if (cpt[n] > 1) ambigus[n] = 1; });
      lastList = getPopular();
      renderGrid(lastList);
    }).catch(function () {
      grid.innerHTML = '<div style="text-align:center;color:rgba(0,0,0,0.4);font-size:13px;grid-column:1/-1">Erreur de chargement</div>';
    });

    var counter = el('div', { style: { fontSize: '12px', color: 'rgba(0,0,0,0.4)', textAlign: 'center' } });
    function updateCounter() { counter.textContent = selected.size + '/5 équipes sélectionnées'; }

    var origRenderGrid = renderGrid;
    renderGrid = function (list) { origRenderGrid(list); updateCounter(); };

    var cta = el('button', {
      style: ctaStyle(),
      onclick: function () {
        if (selected.size === 0) { currentStep = 3; slideToStep(renderNotifs); return; }
        cta.disabled = true; cta.textContent = '…'; cta.style.animation = 'none';
        var rows = [];
        selected.forEach(function (tid) {
          var t = allTeams.find(function (x) { return teamIdFromLogo(x.l) === tid; });
          if (t) rows.push({ user_id: state.userId, team_id: tid, team_name: t.n, team_logo: t.l });
        });
        state.teams = rows;
        // Alimente le store local : sans ca les equipes partaient en base
        // sans jamais remonter dans l'onglet Favoris.
        rows.forEach(function (r) {
          if (!window.NS_FAV_TEAMS) return;
          window.NS_FAV_TEAMS.ajouter({ id: 'team-' + r.team_id, type: 'team',
            name: r.team_name, logoUrl: r.team_logo, teamId: r.team_id });
        });
        SB.from('favorite_teams').upsert(rows).then(function () {
          cta.disabled = false;
          currentStep = 3;
          slideToStep(renderNotifs);
        }).catch(function () { cta.disabled = false; cta.textContent = 'Continuer'; cta.style.animation = ''; });
      }
    }, ['Continuer']);
    bindCtaHover(cta);

    var skip = el('button', {
      style: { background: 'none', border: 'none', color: 'rgba(0,0,0,0.4)', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', padding: '6px', textAlign: 'center', width: '100%' },
      onclick: function () { currentStep = 3; slideToStep(renderNotifs); }
    }, ['Passer cette étape']);

    wrap.append(sub, search, selectedWrap, grid, counter, cta, skip);
    setBody('Qui tu supportes ?', '', wrap, 2);
  }

  // ── Step 4: Notification preferences ───────────────────────────────────────
  function renderNotifs() {
    var prefs = { goals_favorites: true, results_favorites: true, transfers_general: false, transfers_favorites: true };
    var wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    var sub = el('div', { style: { fontSize: '14px', color: 'rgba(0,0,0,0.5)', lineHeight: '1.6', textAlign: 'center' } },
      ['Choisis ce que tu veux suivre en temps réel.']);

    var items = [
      { key: 'goals_favorites', label: 'Buts de mes équipes', desc: 'Notification instantanée à chaque but' },
      { key: 'results_favorites', label: 'Résultats de mes favoris', desc: 'Score final de chaque match suivi' },
      { key: 'transfers_favorites', label: 'Transferts de mes équipes', desc: 'Arrivées et départs de tes clubs' },
      { key: 'transfers_general', label: 'Gros transferts du mercato', desc: 'Les mouvements majeurs du marché' }
    ];

    items.forEach(function (it) {
      var toggle = el('div', {
        style: { width: '44px', height: '26px', borderRadius: '13px', background: prefs[it.key] ? accent : 'rgba(0,0,0,0.15)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: '0' },
        onclick: function () {
          prefs[it.key] = !prefs[it.key];
          toggle.style.background = prefs[it.key] ? accent : 'rgba(0,0,0,0.15)';
          knob.style.transform = prefs[it.key] ? 'translateX(18px)' : 'translateX(0)';
        }
      });
      var knob = el('div', { style: { width: '22px', height: '22px', borderRadius: '11px', background: '#fff', position: 'absolute', top: '2px', left: '2px', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transform: prefs[it.key] ? 'translateX(18px)' : 'translateX(0)' } });
      toggle.appendChild(knob);
      var row = el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '16px', background: '#fafafc', border: '1px solid rgba(97,51,224,0.08)' } }, [
        el('div', { style: { flex: '1' } }, [
          el('div', { style: { fontSize: '14px', fontWeight: '700', color: '#0d0f1c' } }, [it.label]),
          el('div', { style: { fontSize: '11px', color: 'rgba(0,0,0,0.45)', marginTop: '2px' } }, [it.desc])
        ]),
        toggle
      ]);
      wrap.appendChild(row);
    });

    var cta = el('button', {
      style: ctaStyle(),
      onclick: function () {
        cta.disabled = true; cta.textContent = '…'; cta.style.animation = 'none';
        state.notifPrefs = prefs;
        var row = Object.assign({ user_id: state.userId, updated_at: new Date().toISOString() }, prefs);
        Promise.all([
          SB.from('notification_preferences').upsert(row),
          SB.from('profiles').update({ onboarding_completed: true, updated_at: new Date().toISOString() }).eq('id', state.userId)
        ]).then(function () {
          slideToStep(renderWelcome);
        }).catch(function () {
          cta.disabled = false; cta.textContent = 'J\'entre dans l\'ar\u00e8ne !'; cta.style.animation = '';
        });
      }
    }, ['J\'entre dans l\'ar\u00e8ne !']);
    bindCtaHover(cta);
    cta.style.marginTop = '4px';

    wrap.append(sub, cta);
    setBody('Ne rate plus rien', '', wrap, 3);
  }

  // ── Step 5: Welcome screen ─────────────────────────────────────────────────
  function renderWelcome() {
    var name = state.firstName || 'Ninja';
    var body = overlay.querySelector('.ob-body');
    body.innerHTML = '';

    // Masquer le logo du header pour ne pas doubler
    var logoWrap = overlay.querySelector('.ob-logo');
    if (logoWrap) logoWrap.style.display = 'none';

    confetti();

    var wrap = el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '40px 0 20px', animation: 'ob-pop 0.5s ease' } });

    var bigNinja = el('div', { style: { width: '110px', height: '110px' } });
    bigNinja.innerHTML = ninjaLogoSVG;

    var title = el('div', { style: { fontSize: '26px', fontWeight: '800', color: '#0d0f1c', textAlign: 'center', lineHeight: '1.3' } });
    title.innerHTML = 'Bienvenue dans l\'arène,<br><span style="color:' + accent + '">' + name + '</span> !';

    var sub = el('div', { style: { fontSize: '14px', color: 'rgba(0,0,0,0.5)', lineHeight: '1.6', textAlign: 'center', maxWidth: '280px' } },
      ['Ton compte est pret. Profite de NinjaScores a fond !']);

    var cta = el('button', {
      style: ctaStyle(),
      onclick: function () { finishOnboarding(); }
    }, ['C\'est parti !']);
    bindCtaHover(cta);

    wrap.append(bigNinja, title, sub, cta);
    body.appendChild(wrap);
  }

  // ── Layout helper ──────────────────────────────────────────────────────────
  function setBody(title, subtitle, content, stepIdx, showBrand) {
    var body = overlay.querySelector('.ob-body');
    body.innerHTML = '';

    var pct = Math.round(((stepIdx + 1) / 4) * 100);
    var progressBar = el('div', { style: { width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(97,51,224,0.1)', overflow: 'hidden', marginBottom: '6px' } }, [
      el('div', { style: { width: pct + '%', height: '100%', borderRadius: '3px', background: 'linear-gradient(90deg, #7B4FE9, ' + accent + ')', transition: 'width 0.5s ease' } })
    ]);

    var hd = el('div', { style: { textAlign: 'center', marginBottom: '4px' } }, [
      el('div', { class: 'ob-title', style: { fontSize: '22px', fontWeight: '800', color: '#0d0f1c', lineHeight: '1.3' } }, [title])
    ]);
    if (showBrand) {
      var brandInTitle = el('span', { style: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '22px', fontWeight: '800', color: accent, letterSpacing: '0.3px' } }, ['NinjaScores']);
      hd.appendChild(brandInTitle);
    }
    if (subtitle) hd.appendChild(el('div', { style: { fontSize: '13px', color: 'rgba(0,0,0,0.45)', marginTop: '4px' } }, [subtitle]));

    body.append(progressBar, hd, content);
  }

  // Sortie sans compte. Google Play a refusé l'app parce que le testeur se
  // heurtait au mur e-mail : rien n'était consultable sans s'inscrire. Un
  // livescore doit s'utiliser sans compte — celui-ci ne sert qu'à synchroniser
  // les favoris et les notifications.
  function quitterOnboarding() {
    try { localStorage.setItem('ns_onboarding_passe', String(Date.now())); } catch (e) {}
    overlay.style.opacity = '0';
    setTimeout(function () { overlay.remove(); }, 350);
  }

  // ── Finish ─────────────────────────────────────────────────────────────────
  function finishOnboarding() {
    // Le profil vient d'etre ecrit : on relit la source de verite plutot
    // que de rester sur l'estimation faite a la saisie.
    if (window.NS_VERIFIER_AGE) window.NS_VERIFIER_AGE();
    else if (window.NS_HIDE_ODDS) document.documentElement.classList.add('ns-minor');
    overlay.style.opacity = '0';
    setTimeout(function () { overlay.remove(); }, 350);
    if (state.teams.length > 0) {
      window.dispatchEvent(new CustomEvent('onboardingDone', { detail: { teams: state.teams, prefs: state.notifPrefs } }));
    }
  }

  // ── Build overlay ──────────────────────────────────────────────────────────
  function buildOverlay() {
    injectCSS();

    var bgDecor = el('div', { style: { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none' } });
    var positions = [
      { x: '8%', y: '12%', s: 50, r: 0 }, { x: '85%', y: '8%', s: 35, r: 45 },
      { x: '75%', y: '35%', s: 28, r: 20 }, { x: '12%', y: '55%', s: 32, r: 60 },
      { x: '90%', y: '60%', s: 45, r: 15 }, { x: '5%', y: '80%', s: 25, r: 30 },
      { x: '50%', y: '90%', s: 38, r: 50 }, { x: '92%', y: '85%', s: 30, r: 70 }
    ];
    positions.forEach(function (p) {
      var star = el('div', { style: { position: 'absolute', left: p.x, top: p.y, width: p.s + 'px', height: p.s + 'px', transform: 'rotate(' + p.r + 'deg)', color: accent, opacity: '1' } });
      star.innerHTML = shurikenSVG;
      bgDecor.appendChild(star);
    });

    var helpBtn = el('button', {
      style: { position: 'absolute', top: '14px', right: '16px', width: '32px', height: '32px', borderRadius: '50%', border: '2px solid rgba(97,51,224,0.2)', background: 'rgba(97,51,224,0.06)', color: accent, fontSize: '16px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', zIndex: '2', padding: '0', lineHeight: '1' },
      onclick: function () {
        var msg = 'NinjaScores est 100% gratuit.\n\nTon compte te permet de sauvegarder tes équipes favorites et de recevoir des notifications personnalisées.\n\nBesoin d\'aide ? Écris-nous à contact@ninjascores.com';
        alert(msg);
      }
    }, ['?']);

    var logoWrap = el('div', { class: 'ob-logo', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '8px 20px 0', flexShrink: '0', position: 'relative' } });
    var ninjaHead = el('div', { style: { width: '80px', height: '80px' } });
    ninjaHead.innerHTML = ninjaLogoSVG;
    var brandRow = el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: '1' } }, [
      el('span', { style: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '22px', fontWeight: '900', color: accent, letterSpacing: '0.2px', lineHeight: '1', textTransform: 'uppercase' } }, ['NINJA']),
      el('span', { style: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '13px', fontWeight: '700', color: accent, letterSpacing: '2.2px', lineHeight: '1.3', textTransform: 'uppercase' } }, ['SCORES'])
    ]);
    logoWrap.append(ninjaHead, brandRow);

    overlay = el('div', {
      class: 'ob-overlay',
      style: { position: 'fixed', inset: '0', zIndex: '9999', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', opacity: '0', transition: 'opacity 0.3s' }
    }, [
      el('div', {
        class: 'ob-panel',
        style: { width: '100%', maxWidth: '430px', maxHeight: '95vh', margin: '0 auto', background: '#ffffff', borderRadius: '32px 32px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -10px 50px rgba(0,0,0,0.2)', position: 'relative' }
      }, [
        bgDecor,
        helpBtn,
        el('div', { style: { width: '36px', height: '4px', background: 'rgba(0,0,0,0.1)', borderRadius: '2px', margin: '10px auto 0', flexShrink: '0', position: 'relative', zIndex: '1' } }),
        logoWrap,
        el('div', { class: 'ob-body', style: { flex: '1', overflowY: 'auto', padding: '0 24px 32px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', zIndex: '1' } })
      ])
    ]);
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.style.opacity = '1'; });
  }

  // ── Changer le mot de passe ────────────────────────────────────────────────
  // Ecran autonome, ouvert depuis la ligne « Mot de passe » de l'ecran Profil.
  // Il n'y a pas d'etape « mot de passe oublie » : un utilisateur qui a oublie
  // le sien se connecte avec le code par e-mail (lien secondaire de l'ecran de
  // connexion), puis vient le redefinir ici. Ca evite d'avoir a gerer le
  // retour d'un lien de reinitialisation et sa liste d'URL autorisees.
  function renderMotDePasse() {
    var body = overlay.querySelector('.ob-body');
    body.innerHTML = '';

    var hd = el('div', { style: { textAlign: 'center', marginBottom: '4px' } }, [
      el('div', { class: 'ob-title', style: { fontSize: '22px', fontWeight: '800', color: '#0d0f1c', lineHeight: '1.3' } }, ['Mot de passe']),
      el('div', { style: { fontSize: '13px', color: 'rgba(0,0,0,0.45)', marginTop: '4px' } }, ['Choisis un mot de passe pour te connecter sans attendre de code.'])
    ]);

    var wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });

    // Le mot de passe actuel est exige. updateUser() se contente d'une session
    // ouverte : sans cette verification, quiconque met la main sur un telephone
    // deverrouille change le mot de passe et enferme le proprietaire dehors.
    var pwd0 = el('input', { type: 'password', placeholder: 'Mot de passe actuel', autocomplete: 'current-password', style: inputStyle() });
    var pwd1 = el('input', { type: 'password', placeholder: 'Nouveau mot de passe', autocomplete: 'new-password', style: inputStyle() });
    var pwd2 = el('input', { type: 'password', placeholder: 'Confirme le mot de passe', autocomplete: 'new-password', style: inputStyle() });
    bindInputFocus(pwd0); bindInputFocus(pwd1); bindInputFocus(pwd2);

    // Meme minimum qu'a l'inscription (contrainte Supabase).
    var MDP_MIN = 6;

    var err = el('div', { style: { fontSize: '12px', color: '#DC2626', textAlign: 'center', display: 'none' } });

    var cta = el('button', {
      style: ctaStyle(),
      onclick: function () {
        var actuel = pwd0.value, a = pwd1.value, b = pwd2.value;
        var email = (window.NS_AUTH_SESSION && window.NS_AUTH_SESSION.user) ? window.NS_AUTH_SESSION.user.email : '';
        if (!actuel) {
          err.textContent = 'Entre ton mot de passe actuel.';
          err.style.display = 'block'; pwd0.focus(); return;
        }
        if (a.length < MDP_MIN) {
          err.textContent = 'Mot de passe trop court (' + MDP_MIN + ' caractères minimum).';
          err.style.display = 'block'; pwd1.focus(); return;
        }
        if (a !== b) {
          err.textContent = 'Les deux mots de passe ne correspondent pas.';
          err.style.display = 'block'; pwd2.focus(); return;
        }
        if (a === actuel) {
          err.textContent = 'Le nouveau mot de passe est identique à l’ancien.';
          err.style.display = 'block'; pwd1.focus(); return;
        }
        err.style.display = 'none';
        cta.disabled = true; cta.textContent = '…'; cta.style.animation = 'none';

        function echec(message, champ) {
          cta.disabled = false; cta.textContent = 'Enregistrer'; cta.style.animation = '';
          err.style.color = '#DC2626';
          err.textContent = message;
          err.style.display = 'block';
          if (champ) { champ.value = ''; champ.focus(); }
        }

        // Etape 1 : prouver qu'on connait le mot de passe actuel. Supabase ne
        // propose pas de verification isolee, on rejoue donc une connexion —
        // c'est le meme utilisateur, la session est simplement renouvelee.
        SB.auth.signInWithPassword({ email: email, password: actuel }).then(function (v) {
          if (v.error) {
            echec('Mot de passe actuel incorrect.', pwd0);
            return;
          }
          window.NS_AUTH_SESSION = v.data.session;
          // Etape 2 : la mise a jour proprement dite.
          SB.auth.updateUser({ password: a }).then(function (res) {
            if (res.error) { echec(res.error.message, null); return; }
            pwd0.value = ''; pwd1.value = ''; pwd2.value = '';
            err.style.color = '#16A34A';
            err.textContent = 'Mot de passe enregistré.';
            err.style.display = 'block';
            cta.textContent = 'Enregistré';
            confetti();
            setTimeout(function () { fermerPanneau(); }, 1200);
          }).catch(function () { echec('Erreur réseau, réessaie.', null); });
        }).catch(function () { echec('Erreur réseau, réessaie.', null); });
      }
    }, ['Enregistrer']);
    bindCtaHover(cta);

    var annuler = el('button', {
      style: { background: 'none', border: 'none', color: 'rgba(0,0,0,0.45)', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', padding: '4px' },
      onclick: function () { fermerPanneau(); }
    }, ['Annuler']);

    pwd0.addEventListener('keydown', function (e) { if (e.key === 'Enter') pwd1.focus(); });
    pwd1.addEventListener('keydown', function (e) { if (e.key === 'Enter') pwd2.focus(); });
    pwd2.addEventListener('keydown', function (e) { if (e.key === 'Enter') cta.click(); });

    wrap.append(pwd0, pwd1, pwd2, err, cta, annuler);
    body.append(hd, wrap);
    setTimeout(function () { pwd0.focus(); }, 150);
  }

  function fermerPanneau() {
    if (!overlay) return;
    overlay.style.opacity = '0';
    setTimeout(function () { overlay.remove(); }, 350);
  }

  // ── Suppression de compte (exigence App Store 5.1.1) ──────────────────────
  // La page web suppression-compte existait mais RIEN dans l'app : un compte
  // cree in-app doit pouvoir etre supprime in-app. La suppression reelle passe
  // par la fonction SQL supprimer_mon_compte() (SECURITY DEFINER, migration
  // 009) : un client ne peut pas effacer sa propre ligne auth.users autrement.
  // Confirmation en deux temps DANS la page : window.confirm() est muet dans
  // la WKWebView iOS (aucun WKUIDelegate cote natif).
  function renderSuppression() {
    var body = overlay.querySelector('.ob-body');
    body.innerHTML = '';
    var e = React.createElement;

    var hd = e('div', { style: { textAlign: 'center', marginBottom: 4 } },
      e('div', { class: 'ob-title', style: { fontSize: 22, fontWeight: 800, color: '#DC2626', lineHeight: 1.3 } }, 'Supprimer mon compte'),
      e('div', { style: { fontSize: 13, color: 'rgba(0,0,0,0.55)', marginTop: 8, lineHeight: 1.6 } },
        'Ton compte, tes équipes favorites et tes préférences seront définitivement effacés. Cette action est irréversible.'));

    var err = e('div');
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-top:8px';

    var msg = document.createElement('div');
    msg.style.cssText = 'font-size:12px;color:#DC2626;text-align:center;display:none';

    var confirme = false;
    var btn = document.createElement('button');
    btn.textContent = 'Supprimer définitivement';
    btn.style.cssText = 'width:100%;padding:14px;border-radius:14px;border:none;background:#DC2626;color:#fff;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit';
    btn.onclick = function () {
      if (!confirme) {
        confirme = true;
        btn.textContent = 'Appuie encore pour confirmer';
        btn.style.background = '#991B1B';
        return;
      }
      btn.disabled = true; btn.textContent = 'Suppression…';
      SB.rpc('supprimer_mon_compte').then(function (r) {
        if (r.error) {
          btn.disabled = false; btn.textContent = 'Supprimer définitivement';
          confirme = false; btn.style.background = '#DC2626';
          msg.textContent = 'La suppression a échoué : ' + r.error.message;
          msg.style.display = 'block';
          return;
        }
        // Compte efface cote serveur : on purge la session locale et on
        // repart de zero. signOut peut echouer (la session n'existe plus),
        // le reload suffit dans tous les cas.
        Promise.resolve(SB.auth.signOut()).catch(function () {}).then(function () {
          try { localStorage.removeItem('ns_onboarding_passe'); } catch (er) {}
          window.location.reload();
        });
      }).catch(function () {
        btn.disabled = false; btn.textContent = 'Supprimer définitivement';
        confirme = false; btn.style.background = '#DC2626';
        msg.textContent = 'Erreur réseau, réessaie.';
        msg.style.display = 'block';
      });
    };

    var annuler = document.createElement('button');
    annuler.textContent = 'Annuler';
    annuler.style.cssText = 'background:none;border:none;color:rgba(0,0,0,0.5);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;padding:6px';
    annuler.onclick = function () { fermerPanneau(); };

    // Le haut (titre) est du React pour heriter du style ; le bas est du DOM
    // direct pour rester trivial — pas d'etat a partager.
    var hote = document.createElement('div');
    body.appendChild(hote);
    var racine = ReactDOM.createRoot ? ReactDOM.createRoot(hote) : null;
    if (racine) racine.render(hd); else ReactDOM.render(hd, hote);
    wrap.append(btn, msg, annuler);
    body.appendChild(wrap);
  }

  window.NS_SUPPRIMER_COMPTE_UI = function () {
    SB = window.NS_SUPABASE;
    if (!SB || !window.NS_AUTH_SESSION) return;
    buildOverlay();
    renderSuppression();
  };

  // Ecran « changer le mot de passe », pour un utilisateur deja connecte.
  window.NS_showMotDePasse = function () {
    SB = window.NS_SUPABASE;
    if (!SB || !window.NS_AUTH_SESSION) return;
    buildOverlay();
    renderMotDePasse();
  };

  // ── Public entry point ─────────────────────────────────────────────────────
  // opts.connexion ouvre directement l'ecran de connexion plutot que celui
  // d'inscription. Le bouton de l'en-tete dit « Se connecter » : le testeur
  // Google Play, muni d'un identifiant et d'un mot de passe, doit tomber sur le
  // champ mot de passe sans avoir a deviner qu'il faut d'abord cliquer sur
  // « J'ai deja un compte ».
  window.NS_showOnboarding = function (profile, opts) {
    SB = window.NS_SUPABASE;
    if (!SB) return;
    ouvrirEnConnexion = !!(opts && opts.connexion);
    buildOverlay();
    if (profile && profile.id) {
      state.userId = profile.id;
      if (profile.first_name) state.firstName = profile.first_name;
      if (window.NS_IOS_NATIF) { finirSansOnboardingIOS(); return; }
      if (profile.date_of_birth) { currentStep = 2; renderFavorites(); return; }
      currentStep = 1; renderDOB(); return;
    }
    currentStep = 0;
    renderEmail();
  };

  // Retour de la redirection Apple (web) : supabase-js a deja echange le code
  // contre une session au chargement. On nettoie l'URL et on reprend le
  // parcours si le profil n'a pas encore de date de naissance.
  if (/[?&]apple=1/.test(window.location.search) && window.NS_AUTH_READY) {
    window.NS_AUTH_READY.then(function () {
      try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
      SB = window.NS_SUPABASE;
      if (!SB || !window.NS_AUTH_SESSION) return;
      buildOverlay();
      poursuivreApresApple(window.NS_AUTH_SESSION);
    });
  }

  // ── Platform detection ─────────────────────────────────────────────────────
  window.NS_IS_NATIVE = function () {
    if (window.NS_IOS_NATIF || /[?&]source=ios-app/.test(window.location.search)) return 'ios';
    if (window.NS_isTWA && window.NS_isTWA()) return 'android';
    try { if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ninjaLiveActivity) return 'ios'; } catch (e) {}
    return false;
  };
})();
