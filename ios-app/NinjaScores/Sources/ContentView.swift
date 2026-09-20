import SwiftUI
import UIKit
import WebKit
import AuthenticationServices
import CryptoKit

// Pont JS → natif : le site (app.compiled.js) appelle
// window.webkit.messageHandlers.ninjaLiveActivity.postMessage({...})
// pour démarrer/mettre à jour/arrêter le suivi d'un match sur l'écran
// verrouillé (Live Activity), sans quitter la page web.
final class NinjaBridge: NSObject, WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "start":
            LiveActivityManager.shared.start(from: body)
        case "update":
            LiveActivityManager.shared.update(from: body)
        case "end":
            LiveActivityManager.shared.end()
        default:
            break
        }
    }
}

// Pont JS -> natif pour les preferences qui doivent SURVIVRE a la webview.
// La langue choisie (window.NS_SET_LANG, assets/inline/i18n.js) se perdait :
// WebKit n'ecrit pas toujours localStorage sur le disque avant une fermeture
// forcee, et l'app repassait alors a la langue du telephone — en anglais pour
// l'utilisateur, d'ou « ca remet l'app en anglais tout seul » (16/09/2026).
// On garde une copie dans UserDefaults, relue au lancement suivant et
// reinjectee avant le premier script de la page (voir prefsScript()).
final class PrefsBridge: NSObject, WKScriptMessageHandler {
    static let cles = ["ns_lang"]

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let cle = body["cle"] as? String,
              PrefsBridge.cles.contains(cle) else { return }
        if let valeur = body["valeur"] as? String, !valeur.isEmpty {
            UserDefaults.standard.set(valeur, forKey: cle)
        } else {
            UserDefaults.standard.removeObject(forKey: cle)
        }
    }

    // Script injecte au tout debut du document : window.NS_PREFS_NATIF existe
    // donc avant i18n.js, qui s'en sert en dernier recours.
    static func prefsScript() -> WKUserScript {
        var paires: [String] = []
        for cle in cles {
            if let v = UserDefaults.standard.string(forKey: cle),
               v.range(of: "^[A-Za-z0-9_-]{1,16}$", options: .regularExpression) != nil {
                paires.append("\(cle):'\(v)'")
            }
        }
        let js = "window.NS_PREFS_NATIF={\(paires.joined(separator: ","))};"
        return WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }
}

// Pont JS → natif pour Sign in with Apple. Le site (s11.js, connexionApple)
// appelle window.webkit.messageHandlers.ninjaAppleSignIn.postMessage({action:'start'}),
// la feuille systeme Apple s'ouvre (Face ID / Touch ID), puis on renvoie au
// site window.NS_APPLE_NATIF({identityToken, nonce, fullName}) — ou
// ({erreur:'annule'}) si l'utilisateur ferme la feuille. Le site termine avec
// supabase.auth.signInWithIdToken. Sans ce pont (build < 1.1) le site retombe
// sur la redirection OAuth web, qui marche aussi dans la WKWebView.
final class AppleSignInBridge: NSObject, WKScriptMessageHandler,
                               ASAuthorizationControllerDelegate,
                               ASAuthorizationControllerPresentationContextProviding {
    weak var webView: WKWebView?
    private var nonceBrut: String?

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              body["action"] as? String == "start" else { return }
        demarrer()
    }

    private func demarrer() {
        // Nonce : Supabase attend le nonce BRUT, Apple recoit son SHA-256.
        // C'est ce qui lie le jeton d'identite a cette requete precise.
        let brut = AppleSignInBridge.nonceAleatoire()
        nonceBrut = brut
        let requete = ASAuthorizationAppleIDProvider().createRequest()
        requete.requestedScopes = [.fullName, .email]
        requete.nonce = AppleSignInBridge.sha256(brut)
        let controleur = ASAuthorizationController(authorizationRequests: [requete])
        controleur.delegate = self
        controleur.presentationContextProvider = self
        controleur.performRequests()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = cred.identityToken,
              let jeton = String(data: data, encoding: .utf8),
              let nonce = nonceBrut else {
            repondre(["erreur": "jeton"]); return
        }
        var res: [String: Any] = ["identityToken": jeton, "nonce": nonce]
        // Le prenom n'est fourni qu'a la PREMIERE autorisation : on le passe
        // au site pour le profil, il ne reviendra plus ensuite.
        if let nom = cred.fullName {
            let complet = [nom.givenName, nom.familyName].compactMap { $0 }.joined(separator: " ")
            if !complet.isEmpty { res["fullName"] = complet }
        }
        repondre(res)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let code = (error as? ASAuthorizationError)?.code
        repondre(["erreur": code == .canceled ? "annule" : "echec"])
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        webView?.window ?? ASPresentationAnchor()
    }

    private func repondre(_ objet: [String: Any]) {
        nonceBrut = nil
        guard let data = try? JSONSerialization.data(withJSONObject: objet),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.NS_APPLE_NATIF && window.NS_APPLE_NATIF(\(json));", completionHandler: nil)
        }
    }

    private static func nonceAleatoire(longueur: Int = 32) -> String {
        let alphabet = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var octets = [UInt8](repeating: 0, count: longueur)
        _ = SecRandomCopyBytes(kSecRandomDefault, longueur, &octets)
        return String(octets.map { alphabet[Int($0) % alphabet.count] })
    }

    private static func sha256(_ texte: String) -> String {
        SHA256.hash(data: Data(texte.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

// Pont JS → natif pour « Continuer avec Google » (version 1.2).
// Google refuse sa connexion dans une WKWebView (erreur 403 disallowed_useragent) :
// on passe par ASWebAuthenticationSession, la feuille de connexion du SYSTEME, que
// Google autorise. Flux OAuth « code + PKCE » avec un identifiant client de type iOS.
// L'identifiant client est fourni par le site au moment du clic
// (window.NS_GOOGLE_IOS_CLIENT_ID dans index.html) : aucun identifiant dans le binaire,
// on peut le changer sans nouvelle version. Reponse au site :
// window.NS_GOOGLE_NATIF({idToken, nonce}) ou ({erreur:'annule'|'echec'|'config'}).
// Le site termine avec supabase.auth.signInWithIdToken({provider:'google'}).
final class GoogleSignInBridge: NSObject, WKScriptMessageHandler, ASWebAuthenticationPresentationContextProviding {
    weak var webView: WKWebView?
    private var session: ASWebAuthenticationSession?

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              body["action"] as? String == "start",
              let clientId = body["clientId"] as? String,
              clientId.hasSuffix(".apps.googleusercontent.com") else {
            repondre(["erreur": "config"]); return
        }
        demarrer(clientId: clientId)
    }

    private func demarrer(clientId: String) {
        let prefixe = String(clientId.dropLast(".apps.googleusercontent.com".count))
        let schema = "com.googleusercontent.apps." + prefixe
        let redirection = schema + ":/oauth2redirect"
        let verificateur = GoogleSignInBridge.aleatoire(64)
        let defi = GoogleSignInBridge.base64url(Data(SHA256.hash(data: Data(verificateur.utf8))))
        let nonceBrut = GoogleSignInBridge.aleatoire(32)
        let etat = GoogleSignInBridge.aleatoire(24)

        var c = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        c.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirection),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: defi),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            // Comme pour Apple : Google recoit le SHA-256, Supabase le nonce brut.
            URLQueryItem(name: "nonce", value: GoogleSignInBridge.sha256hex(nonceBrut)),
            URLQueryItem(name: "state", value: etat),
            URLQueryItem(name: "prompt", value: "select_account"),
        ]
        guard let url = c.url else { repondre(["erreur": "config"]); return }

        let s = ASWebAuthenticationSession(url: url, callbackURLScheme: schema) { [weak self] retour, erreur in
            guard let self = self else { return }
            self.session = nil
            if let e = erreur as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                self.repondre(["erreur": "annule"]); return
            }
            guard let retour = retour,
                  let items = URLComponents(url: retour, resolvingAgainstBaseURL: false)?.queryItems,
                  items.first(where: { $0.name == "state" })?.value == etat,
                  let code = items.first(where: { $0.name == "code" })?.value else {
                self.repondre(["erreur": "echec"]); return
            }
            self.echanger(code: code, verificateur: verificateur, clientId: clientId, redirection: redirection, nonceBrut: nonceBrut)
        }
        s.presentationContextProvider = self
        s.prefersEphemeralWebBrowserSession = false   // reutilise la session Google deja ouverte sur l'iPhone
        session = s
        DispatchQueue.main.async { _ = s.start() }
    }

    // Echange du code contre les jetons. Un client iOS n'a pas de secret : le PKCE suffit.
    private func echanger(code: String, verificateur: String, clientId: String, redirection: String, nonceBrut: String) {
        var req = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let champs = [
            ("code", code), ("client_id", clientId), ("code_verifier", verificateur),
            ("redirect_uri", redirection), ("grant_type", "authorization_code"),
        ]
        req.httpBody = champs.map { "\($0.0)=\(GoogleSignInBridge.encoder($0.1))" }.joined(separator: "&").data(using: .utf8)
        URLSession.shared.dataTask(with: req) { [weak self] data, _, _ in
            guard let self = self else { return }
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let idToken = json["id_token"] as? String else {
                self.repondre(["erreur": "echec"]); return
            }
            self.repondre(["idToken": idToken, "nonce": nonceBrut])
        }.resume()
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        webView?.window ?? ASPresentationAnchor()
    }

    private func repondre(_ objet: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: objet),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.NS_GOOGLE_NATIF && window.NS_GOOGLE_NATIF(\(json));", completionHandler: nil)
        }
    }

    private static func aleatoire(_ longueur: Int) -> String {
        let alphabet = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._~")
        var octets = [UInt8](repeating: 0, count: longueur)
        _ = SecRandomCopyBytes(kSecRandomDefault, longueur, &octets)
        return String(octets.map { alphabet[Int($0) % alphabet.count] })
    }
    private static func sha256hex(_ texte: String) -> String {
        SHA256.hash(data: Data(texte.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    private static func base64url(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    private static func encoder(_ v: String) -> String {
        var permis = CharacterSet.alphanumerics
        permis.insert(charactersIn: "-._~")
        return v.addingPercentEncoding(withAllowedCharacters: permis) ?? v
    }
}

struct WebView: UIViewRepresentable {
    let url: URL
    var onPageLoaded: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onPageLoaded: onPageLoaded)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()
        controller.add(NinjaBridge(), name: "ninjaLiveActivity")
        let apple = AppleSignInBridge()
        controller.add(apple, name: "ninjaAppleSignIn")
        let google = GoogleSignInBridge()
        controller.add(google, name: "ninjaGoogleSignIn")
        controller.add(PrefsBridge(), name: "ninjaPrefs")
        controller.addUserScript(PrefsBridge.prefsScript())
        config.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: config)
        apple.webView = webView
        google.webView = webView
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        webView.load(request)
        PushTokenBridge.shared.attach(webView)
        NotificationRouter.shared.attach(webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    // Des que la page finit de charger, on prechauffe le calendrier (memes
    // fonctions que l'app utiliserait de toute facon en ouvrant l'ecran
    // Calendrier — NS_FIXTURES garde son propre cache, cet appel anticipe
    // juste le declenchement pendant que le splash est encore visible).
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let onPageLoaded: () -> Void
        init(onPageLoaded: @escaping () -> Void) { self.onPageLoaded = onPageLoaded }

        // Liens externes (CTA Telegram, bookmakers, stores). Sans uiDelegate,
        // un target="_blank" ou un window.open() ne faisait RIEN : au doigt
        // aucune reaction, et il fallait rester appuye pour obtenir le menu
        // natif de WebKit (signale par l'utilisateur le 16/09/2026). On sort
        // desormais dans Safari, et l'app garde sa page intacte.
        private func externe(_ url: URL) -> Bool {
            guard let hote = url.host?.lowercased() else {
                // mailto:, tel:, tg:, itms-apps: — c'est au systeme de gerer.
                return url.scheme != nil && url.scheme != "about"
            }
            return !(hote == "ninjascores.com" || hote.hasSuffix(".ninjascores.com"))
        }

        private func ouvrirDehors(_ url: URL) {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }

        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.allow); return }
            // Schemas non web (mailto:, tel:, tg:, itms-apps:) : la WKWebView
            // ne sait pas les charger, le systeme si.
            let web = url.scheme == "http" || url.scheme == "https" || url.scheme == "about"
            // Un lien TOUCHE par l'utilisateur, ou un target="_blank" (pas de
            // frame cible). Les redirections (.other) restent dans la vue :
            // c'est par la que passent les retours OAuth Supabase/Apple, les
            // envoyer dans Safari casserait la connexion.
            let geste = navigationAction.navigationType == .linkActivated
                || navigationAction.targetFrame == nil
            if !web || (geste && externe(url)) {
                ouvrirDehors(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        // window.open() et target="_blank" vers ninjascores.com : pas de
        // nouvelle vue, on charge dans la vue existante.
        func webView(_ webView: WKWebView,
                     createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction,
                     windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url {
                if externe(url) { ouvrirDehors(url) } else { webView.load(URLRequest(url: url)) }
            }
            return nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.evaluateJavaScript(
                // NS_IOS_LIENS_NATIFS : ce build sait ouvrir les liens
                // externes (uiDelegate + decidePolicyFor). Le site coupe
                // alors sa rustine `location.href` et laisse faire le natif.
                "window.NS_IOS_LIENS_NATIFS=true;window.NS_FIXTURES&&window.NS_FIXTURES(0);window.NS_FIXTURES&&window.NS_FIXTURES('live');",
                completionHandler: nil
            )
            // 1.2 : a CHAQUE chargement (1er lancement, rechargement apres connexion…)
            // on redonne le jeton de notification au site — il se perdait s'il arrivait
            // avant la page — et on ouvre le match d'une notification touchee app fermee.
            PushTokenBridge.shared.pageLoaded(webView)
            NotificationRouter.shared.pageLoaded(webView)
            onPageLoaded()
        }
    }
}

struct ContentView: View {
    @State private var pageLoaded = false
    @State private var minDurationElapsed = false

    private var showSplash: Bool { !(pageLoaded && minDurationElapsed) }

    var body: some View {
        ZStack {
            WebView(url: URL(string: "https://ninjascores.com/?source=ios-app")!) {
                pageLoaded = true
            }
            .opacity(showSplash ? 0 : 1)

            if showSplash {
                SplashView()
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.35), value: showSplash)
        .onAppear {
            // Petit retour haptique au lancement, comme un coup de sifflet.
            UIImpactFeedbackGenerator(style: .light).impactOccurred()

            // Duree plancher pour que l'animation ne clignote pas sur les
            // reseaux tres rapides, sans jamais retenir l'utilisateur plus
            // que necessaire si le chargement est plus lent.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.1) {
                minDurationElapsed = true
            }
        }
        .onChange(of: showSplash) { splash in
            // Petite vibration "c'est parti" quand le splash cede la place a l'app.
            if !splash {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                // Popup systeme de notifications une fois l'app visible plutot
                // qu'au tout premier instant (meilleur taux d'acceptation).
                PushNotificationManager.requestAuthorizationIfNeeded()
            }
        }
    }
}
