import FacebookCore
import UIKit
import UserNotifications
import WebKit

// Pont natif <-> JS pour le device token APNs. La WebView s'enregistre elle-
// meme des sa creation (voir ContentView.swift) ; si le token APNs arrive
// avant que la page web soit prete a le recevoir, on le garde en attente et
// on l'injecte des que possible.
final class PushTokenBridge {
    static let shared = PushTokenBridge()
    private weak var webView: WKWebView?
    private var token: String? = UserDefaults.standard.string(forKey: "ns_apns_token")

    func attach(_ webView: WKWebView) {
        self.webView = webView
    }

    func receive(_ token: String) {
        self.token = token
        UserDefaults.standard.set(token, forKey: "ns_apns_token")
        inject()
    }

    // Appele a chaque fin de chargement de page (voir ContentView.Coordinator) :
    // si le jeton est arrive avant que le site soit pret, il est redonne ici.
    func pageLoaded(_ webView: WKWebView) {
        self.webView = webView
        inject()
    }

    private func inject() {
        guard let token = token, let webView = webView else { return }
        let t = jsString(token)
        // NS_APNS_TOKEN : relu par le site (s10.js) s'il n'a pas encore son ecouteur.
        let js = "window.NS_APNS_TOKEN=" + t + ";window.NS_APNS_TOKEN_RECEIVED&&window.NS_APNS_TOKEN_RECEIVED(" + t + ");"
        DispatchQueue.main.async { webView.evaluateJavaScript(js, completionHandler: nil) }
    }

    private func jsString(_ s: String) -> String {
        "\"" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
    }
}

// Appui sur une notification : ouvre la fiche du match. Le serveur (api/push-goals.js)
// envoie `url` (/football/match/<slug>-<id>/) et `fixtureId`. App fermee, la page
// n'est pas encore chargee au moment de l'appui : on garde l'adresse et on l'ouvre
// au premier chargement.
final class NotificationRouter {
    static let shared = NotificationRouter()
    private weak var webView: WKWebView?
    private var enAttente: String?
    private var pageChargee = false

    func attach(_ webView: WKWebView) { self.webView = webView }

    func pageLoaded(_ webView: WKWebView) {
        self.webView = webView
        pageChargee = true
        if let chemin = enAttente { enAttente = nil; ouvrir(chemin) }
    }

    func open(userInfo: [AnyHashable: Any]) {
        var chemin: String? = userInfo["url"] as? String
        if chemin == nil || chemin?.hasPrefix("/") != true {
            if let id = userInfo["fixtureId"] as? Int { chemin = "/football/match/" + String(id) + "/" }
            else if let id = userInfo["fixtureId"] as? String, !id.isEmpty { chemin = "/football/match/" + id + "/" }
        }
        guard let c = chemin, c.hasPrefix("/") else { return }
        if pageChargee, webView != nil { ouvrir(c) } else { enAttente = c }
    }

    private func ouvrir(_ chemin: String) {
        guard let url = URL(string: "https://ninjascores.com" + chemin) else { return }
        DispatchQueue.main.async { [weak self] in self?.webView?.load(URLRequest(url: url)) }
    }
}

// Demande l'autorisation et enregistre l'app aupres d'APNs. Appele une fois
// le splash termine (voir ContentView.swift) plutot qu'au tout premier
// instant, pour laisser le contexte de l'app s'etablir avant la popup
// systeme — meilleure UX, taux d'acceptation plus eleve.
enum PushNotificationManager {
    static func requestAuthorizationIfNeeded() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            guard settings.authorizationStatus == .notDetermined else {
                if settings.authorizationStatus == .authorized {
                    DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
                }
                return
            }
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                guard granted else { return }
                DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
            }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        MetaSDK.demarrer(application, options: launchOptions)
        MetaSDK.demanderSuivi()
        return true
    }

    // Reouverture de l'app : Meta compte les sessions ici, pas au lancement.
    func applicationDidBecomeActive(_ application: UIApplication) {
        MetaSDK.appActive()
    }

    // Retour depuis une page Facebook/Instagram (deferred deep link).
    func application(_ app: UIApplication, open url: URL,
                     options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        ApplicationDelegate.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        PushTokenBridge.shared.receive(token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[Push] echec enregistrement APNs: \(error)")
    }

    // Appui sur la notification (app ouverte, en arriere-plan ou fermee).
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        NotificationRouter.shared.open(userInfo: response.notification.request.content.userInfo)
        completionHandler()
    }

    // Affiche la notif meme si l'app est deja au premier plan (comportement
    // par defaut d'iOS : rien ne s'affiche sans ce delegate).
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .list])
    }
}
