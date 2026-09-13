import SwiftUI

@main
struct NinjaScoresApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .ignoresSafeArea(edges: .bottom)
        }
    }
}
