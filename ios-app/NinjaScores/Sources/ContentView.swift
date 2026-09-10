import SwiftUI
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
        config.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: config)
        apple.webView = webView
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = context.coordinator
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        webView.load(request)
        PushTokenBridge.shared.attach(webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    // Des que la page finit de charger, on prechauffe le calendrier (memes
    // fonctions que l'app utiliserait de toute facon en ouvrant l'ecran
    // Calendrier — NS_FIXTURES garde son propre cache, cet appel anticipe
    // juste le declenchement pendant que le splash est encore visible).
    final class Coordinator: NSObject, WKNavigationDelegate {
        let onPageLoaded: () -> Void
        init(onPageLoaded: @escaping () -> Void) { self.onPageLoaded = onPageLoaded }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.evaluateJavaScript(
                "window.NS_FIXTURES&&window.NS_FIXTURES(0);window.NS_FIXTURES&&window.NS_FIXTURES('live');",
                completionHandler: nil
            )
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
