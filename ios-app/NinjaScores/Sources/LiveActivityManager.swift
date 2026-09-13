import ActivityKit
import Foundation

// Démarre/actualise/termine la Live Activity d'un match, à partir des
// messages envoyés par le site web via le pont JS (voir ContentView.swift).
// Le payload attendu (posté depuis app.compiled.js) :
//   { action:'start', fixtureId, homeTeam, awayTeam, homeLogo, awayLogo,
//     competition, homeScore, awayScore, minute, status }
final class LiveActivityManager {
    static let shared = LiveActivityManager()
    private var current: Activity<MatchActivityAttributes>?

    func start(from payload: [String: Any]) {
        guard #available(iOS 16.2, *),
              ActivityAuthorizationInfo().areActivitiesEnabled,
              let fixtureId = payload["fixtureId"] as? Int,
              let homeTeam = payload["homeTeam"] as? String,
              let awayTeam = payload["awayTeam"] as? String
        else { return }

        // Une seule Live Activity NinjaScores à la fois : on remplace
        // l'éventuelle activité précédente plutôt que d'en empiler deux.
        if current != nil { end() }

        let attributes = MatchActivityAttributes(
            fixtureId: fixtureId,
            homeTeam: homeTeam,
            awayTeam: awayTeam,
            homeLogoURL: payload["homeLogo"] as? String ?? "",
            awayLogoURL: payload["awayLogo"] as? String ?? "",
            competition: payload["competition"] as? String ?? ""
        )
        let state = MatchActivityAttributes.ContentState(
            homeScore: payload["homeScore"] as? Int ?? 0,
            awayScore: payload["awayScore"] as? Int ?? 0,
            minute: payload["minute"] as? Int,
            status: payload["status"] as? String ?? "live",
            lastEvent: payload["lastEvent"] as? String
        )

        do {
            current = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil),
                pushType: nil // demarrage local ; mise a jour a distance via APNs a brancher plus tard
            )
        } catch {
            print("[LiveActivity] echec du demarrage: \(error)")
        }
    }

    func update(from payload: [String: Any]) {
        guard #available(iOS 16.2, *), let activity = current else { return }
        let state = MatchActivityAttributes.ContentState(
            homeScore: payload["homeScore"] as? Int ?? 0,
            awayScore: payload["awayScore"] as? Int ?? 0,
            minute: payload["minute"] as? Int,
            status: payload["status"] as? String ?? "live",
            lastEvent: payload["lastEvent"] as? String
        )
        Task { await activity.update(.init(state: state, staleDate: nil)) }
    }

    func end() {
        guard #available(iOS 16.2, *), let activity = current else { return }
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
        current = nil
    }
}
