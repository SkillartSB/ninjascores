import AdSupport
import AppTrackingTransparency
import FacebookCore
import UIKit

/// SDK Meta (mesure des campagnes d'installation).
///
/// L'equivalent Android tourne depuis la 1.0.2 ; cote iOS il faut en plus
/// gerer l'App Tracking Transparency : sans consentement, Meta ne recoit que
/// les conversions agregees de SKAdNetwork (pas d'IDFA), ce qui reste
/// suffisant pour optimiser une campagne d'installs.
///
/// Les identifiants viennent de Config/Meta.xcconfig (hors depot public) et
/// sont injectes dans Info.plist au moment du build.
enum MetaSDK {

    /// Demarre le SDK. A appeler dans didFinishLaunchingWithOptions.
    static func demarrer(_ application: UIApplication,
                         options: [UIApplication.LaunchOptionsKey: Any]?) {
        // Sans jeton client, le SDK leve une exception au demarrage : on
        // prefere une app qui marche sans mesure plutot qu'un crash au
        // lancement si le xcconfig n'a pas ete rempli.
        guard let jeton = Bundle.main.object(forInfoDictionaryKey: "FacebookClientToken") as? String,
              !jeton.isEmpty, jeton != "A_REMPLACER" else {
            print("[Meta] jeton client absent — SDK non demarre (voir ios-app/Config/Meta.xcconfig)")
            return
        }
        ApplicationDelegate.shared.application(application, didFinishLaunchingWithOptions: options)
    }

    /// Signale l'ouverture de l'app (evenement d'activation Meta).
    static func appActive() {
        guard estDemarre else { return }
        AppEvents.shared.activateApp()
    }

    /// Demande l'autorisation de suivi. iOS exige que l'app soit au premier
    /// plan : on attend donc que la scene soit active, sinon la boite de
    /// dialogue ne s'affiche jamais et le statut reste « notDetermined ».
    ///
    /// Le delai laisse l'ecran d'accueil s'afficher avant la demande : une
    /// popup qui arrive sur un ecran vide se fait refuser bien plus souvent.
    static func demanderSuivi(apres delai: TimeInterval = 2) {
        guard estDemarre, #available(iOS 14.5, *) else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + delai) {
            guard UIApplication.shared.applicationState == .active else { return }
            ATTrackingManager.requestTrackingAuthorization { statut in
                let autorise = (statut == .authorized)
                // Sans consentement, on coupe la collecte de l'IDFA : la
                // mesure passe alors uniquement par SKAdNetwork.
                Settings.shared.isAdvertiserIDCollectionEnabled = autorise
                Settings.shared.isAutoLogAppEventsEnabled = true
                print("[Meta] suivi \(autorise ? "autorise" : "refuse") (statut \(statut.rawValue))")
            }
        }
    }

    private static var estDemarre: Bool {
        guard let jeton = Bundle.main.object(forInfoDictionaryKey: "FacebookClientToken") as? String else { return false }
        return !jeton.isEmpty && jeton != "A_REMPLACER"
    }
}
