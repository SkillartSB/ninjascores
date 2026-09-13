
  // ── Notifications push : buts, mi-temps, fin de match ────────────────────
  // Refonte du 13/09/2026. L'abonnement (web : Push API ; app iOS : jeton APNs)
  // part sur Supabase avec TOUT ce que l'utilisateur suit :
  //   fixtureIds : matchs favoris (foot uniquement)
  //   cibles     : equipes (ids API-Football), equipesNoms (secours), joueurs {nom, equipe}
  //   prefs      : buts / mi_temps / fin
  //   userId     : compte connecte, s'il y en a un
  // La detection et l'envoi tournent cote serveur (api/push-goals.js, cron).
  (function () {
    var VAPID_PUBLIC_KEY = 'BBKmIGzov1xjrfAIy0ojq0r8cAun3AWkN-IBNci2y3sj3vo434ZPVupgPj1HmqUAoyWuBLXItfjG8WVZcLvQIt8';
    var CLE_PREFS = 'ns_push_prefs';
    var CLE_REFUS = 'ns_push_propose';

    function urlBase64ToUint8Array(base64) {
      var padding = '='.repeat((4 - (base64.length % 4)) % 4);
      var b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
      var raw = atob(b64);
      var out = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      return out;
    }

    // ── Ce que l'utilisateur suit ──
    function favorisIds() {
      try {
        return (window.FavMatchesStore ? window.FavMatchesStore.getAll() : [])
          .filter(function (m) { return m && !m.tennis && m.sport !== 'tennis'; })
          .map(function (m) { return Number(m.eventId); })
          .filter(function (n) { return n > 0; });
      } catch (e) { return []; }
    }
    function cibles() {
      var out = { equipes: [], equipesNoms: [], joueurs: [] };
      try {
        (window.NS_FAV_TEAMS ? window.NS_FAV_TEAMS.getAll() : []).forEach(function (it) {
          if (!it) return;
          if (it.type === 'team') {
            var id = Number(it.teamId) || Number((/\/teams\/(\d+)\./.exec(String(it.logoUrl || it.logo || '')) || [])[1]) || 0;
            if (id) out.equipes.push(id);
            if (it.name) out.equipesNoms.push(it.name);
          } else if (it.type === 'player' && it.name) {
            out.joueurs.push({ nom: it.name, equipe: String(it.detail || '').split('·')[0].split('?')[0].trim() });
          }
        });
      } catch (e) {}
      return out;
    }
    function prefs() {
      try { var p = JSON.parse(localStorage.getItem(CLE_PREFS) || '{}'); return { buts: p.buts !== false, mi_temps: p.mi_temps !== false, fin: p.fin !== false }; }
      catch (e) { return { buts: true, mi_temps: true, fin: true }; }
    }
    function charge() {
      var s = window.NS_AUTH_SESSION;
      return { fixtureIds: favorisIds(), cibles: cibles(), prefs: prefs(), userId: (s && s.user && s.user.id) || null };
    }
    function suitQuelqueChose() {
      var c = charge();
      return c.fixtureIds.length + c.cibles.equipes.length + c.cibles.equipesNoms.length + c.cibles.joueurs.length;
    }

    // ── Transport web (Push API) ──
    window.NS_PUSH_SUPPORTED = !!(window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window);
    function envoyerAbonnement(sub) {
      var json = sub.toJSON();
      return fetch('/api/push-subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ endpoint: json.endpoint, keys: json.keys }, charge())),
      });
    }

    // ── Transport app iOS (jeton APNs recu du natif, voir ios-app/PushNotifications.swift) ──
    var apnsToken = null;
    try { apnsToken = sessionStorage.getItem('ns_apns_token') || null; } catch (e) {}
    function envoyerTokenAPNs(token) {
      return fetch('/api/push-subscribe-ios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ deviceToken: token }, charge())),
      }).catch(function () {});
    }
    window.NS_APNS_TOKEN_RECEIVED = function (token) {
      if (!token) return;
      apnsToken = token;
      try { sessionStorage.setItem('ns_apns_token', token); } catch (e) {}
      envoyerTokenAPNs(token);
    };
    // Le natif peut avoir livre le jeton avant le chargement de ce script : il le
    // depose aussi dans window.NS_APNS_TOKEN (version 1.2 de l'app). On le reprend.
    if (window.NS_APNS_TOKEN && !apnsToken) window.NS_APNS_TOKEN_RECEIVED(window.NS_APNS_TOKEN);
    else if (apnsToken) envoyerTokenAPNs(apnsToken);   // rechargement de page : on resynchronise

    // ── API publique (ecran Reglages, bouton d'activation) ──
    window.NS_PUSH_STATE = function () {
      if (window.NS_IOS_NATIF) return Promise.resolve({ supported: true, permission: apnsToken ? 'granted' : 'default', subscribed: !!apnsToken, natif: true });
      if (!window.NS_PUSH_SUPPORTED) return Promise.resolve({ supported: false, permission: 'unsupported', subscribed: false });
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          return { supported: true, permission: Notification.permission, subscribed: !!sub };
        });
      });
    };
    window.NS_PUSH_SUBSCRIBE = function () {
      if (window.NS_IOS_NATIF) return apnsToken ? envoyerTokenAPNs(apnsToken) : Promise.reject(new Error('autorise les notifications dans les reglages de l\'iPhone'));
      if (!window.NS_PUSH_SUPPORTED) return Promise.reject(new Error('non supporte'));
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (existant) {
          if (existant) return existant;
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
        });
      }).then(function (sub) { return envoyerAbonnement(sub).then(function () { return sub; }); });
    };
    window.NS_PUSH_UNSUBSCRIBE = function () {
      if (window.NS_IOS_NATIF) {
        if (!apnsToken) return Promise.resolve();
        return fetch('/api/push-subscribe-ios', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceToken: apnsToken }) }).catch(function () {});
      }
      if (!window.NS_PUSH_SUPPORTED) return Promise.resolve();
      return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
        if (!sub) return;
        var endpoint = sub.endpoint;
        return sub.unsubscribe().then(function () {
          return fetch('/api/push-subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: endpoint }) }).catch(function () {});
        });
      });
    };
    window.NS_PUSH_PREFS = {
      get: prefs,
      set: function (p) {
        try { localStorage.setItem(CLE_PREFS, JSON.stringify({ buts: p.buts !== false, mi_temps: p.mi_temps !== false, fin: p.fin !== false })); } catch (e) {}
        resynchroniser();
      }
    };

    // ── Resynchronisation a chaque changement de favoris, de preferences ou de compte ──
    var minuteur = null;
    function resynchroniser() {
      clearTimeout(minuteur);
      minuteur = setTimeout(function () {
        if (apnsToken) envoyerTokenAPNs(apnsToken);
        if (!window.NS_IOS_NATIF && window.NS_PUSH_SUPPORTED) {
          navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); })
            .then(function (sub) { if (sub) envoyerAbonnement(sub); }).catch(function () {});
        }
      }, 1500);
    }
    window.addEventListener('favmatchchange', resynchroniser);
    window.addEventListener('favteamschange', resynchroniser);
    if (window.NS_AUTH_READY && window.NS_AUTH_READY.then) window.NS_AUTH_READY.then(resynchroniser, function () {});

    // ── Proposer l'activation au moment ou l'on met un favori (web et Android) ──
    // Jamais dans l'app iOS (la permission y est demandee par le systeme), jamais si le
    // navigateur ne sait pas faire, et pas plus d'une fois par semaine en cas de « Plus tard ».
    var dernierCompte = suitQuelqueChose();
    function proposer() {
      var n = suitQuelqueChose();
      var augmente = n > dernierCompte;
      dernierCompte = n;
      if (!augmente || window.NS_IOS_NATIF || !window.NS_PUSH_SUPPORTED) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
      try { var refus = Number(localStorage.getItem(CLE_REFUS) || 0); if (refus && Date.now() - refus < 7 * 86400000) return; } catch (e) {}
      if (document.getElementById('ns-push-propose')) return;
      navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
        if (sub) return;
        afficherProposition();
      }).catch(function () {});
    }
    function afficherProposition() {
      var violet = '#6133E0';
      var fond = document.createElement('div');
      fond.id = 'ns-push-propose';
      fond.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99990;display:flex;justify-content:center;padding:0 12px calc(env(safe-area-inset-bottom,0px) + 84px);pointer-events:none;';
      var carte = document.createElement('div');
      carte.style.cssText = 'pointer-events:auto;width:100%;max-width:420px;background:#fff;color:#0D0F1C;border-radius:18px;box-shadow:0 12px 40px rgba(20,10,60,.28);padding:16px;font-family:inherit;display:flex;gap:12px;align-items:flex-start;animation:nsPushIn .3s cubic-bezier(.2,.8,.2,1);';
      carte.innerHTML =
        '<div style="width:40px;height:40px;border-radius:12px;background:' + violet + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:800;line-height:1.3">Être prévenu en direct ?</div>' +
          '<div style="font-size:12.5px;color:#6B7280;margin-top:3px;line-height:1.4">Buts, mi-temps et fin de match de tes favoris, même application fermée.</div>' +
          '<div style="display:flex;gap:8px;margin-top:12px">' +
            '<button type="button" data-a="oui" style="border:none;background:' + violet + ';color:#fff;font-weight:800;font-size:13px;border-radius:10px;padding:9px 14px;cursor:pointer;font-family:inherit">Activer</button>' +
            '<button type="button" data-a="non" style="border:none;background:#F0F0F8;color:#6B7280;font-weight:700;font-size:13px;border-radius:10px;padding:9px 14px;cursor:pointer;font-family:inherit">Plus tard</button>' +
          '</div>' +
        '</div>';
      if (!document.getElementById('ns-push-style')) {
        var st = document.createElement('style'); st.id = 'ns-push-style';
        st.textContent = '@keyframes nsPushIn{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}@media (prefers-reduced-motion:reduce){#ns-push-propose>div{animation:none!important}}';
        document.head.appendChild(st);
      }
      fond.appendChild(carte);
      document.body.appendChild(fond);
      var fermer = function () { if (fond.parentNode) fond.parentNode.removeChild(fond); };
      carte.querySelector('[data-a="oui"]').onclick = function () {
        fermer();
        window.NS_PUSH_SUBSCRIBE().catch(function () {});
      };
      carte.querySelector('[data-a="non"]').onclick = function () {
        try { localStorage.setItem(CLE_REFUS, String(Date.now())); } catch (e) {}
        fermer();
      };
      setTimeout(fermer, 20000);
    }
    window.addEventListener('favmatchchange', proposer);
    window.addEventListener('favteamschange', proposer);
    window.NS_PUSH_PROPOSER = afficherProposition;   // test manuel
  })();
