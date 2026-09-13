import SwiftUI

// Ecran de lancement anime, affiche pendant que le WKWebView charge le site
// ET que le calendrier des matchs se prechauffe en arriere-plan (voir
// ContentView : NS_FIXTURES declenche des la fin du chargement de la page).
// DA "sport" : violet de marque (#6133E0, theme-color de index.html), lignes
// de vitesse diagonales, wordmark incline façon maillot, chip scoreboard
// pour le slogan. Tete de ninja fidele a icons/icon-512.png (cercle blanc,
// bandeau violet avec yeux en amande, chignon).
struct SplashView: View {
    @State private var logoPulse = false
    @State private var barProgress: CGFloat = 0.08
    @State private var ballSpin = false
    @State private var contentVisible = false
    @State private var streaksShift: CGFloat = 0

    private let brandPurple = Color(red: 0x61 / 255, green: 0x33 / 255, blue: 0xE0 / 255)
    private let deepPurple = Color(red: 0x12 / 255, green: 0x05 / 255, blue: 0x2A / 255)
    private let lavender = Color.white.opacity(0.78)

    var body: some View {
        GeometryReader { geo in
            ZStack {
                background(in: geo.size)
                    .frame(width: geo.size.width, height: geo.size.height)
                    .clipped()

                VStack(spacing: 0) {
                    Spacer()

                    logo
                        .scaleEffect(logoPulse ? 1.05 : 0.98)
                        .opacity(contentVisible ? 1 : 0)

                    wordmark
                        .padding(.top, 22)
                        .opacity(contentVisible ? 1 : 0)
                        .offset(y: contentVisible ? 0 : 8)

                    tagline
                        .padding(.top, 16)
                        .opacity(contentVisible ? 1 : 0)

                    Spacer()
                    Spacer()

                    progressBar
                        .padding(.horizontal, 56)
                        .opacity(contentVisible ? 1 : 0)

                    Text("CHARGEMENT…")
                        .font(.system(size: 12, weight: .bold, design: .default))
                        .italic()
                        .tracking(1.8)
                        .foregroundStyle(lavender)
                        .padding(.top, 10)
                        .opacity(contentVisible ? 1 : 0)

                    Spacer().frame(height: geo.size.height * 0.1)
                }
                .frame(width: geo.size.width)
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.easeOut(duration: 0.5)) { contentVisible = true }
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) {
                logoPulse = true
            }
            withAnimation(.linear(duration: 1.6).repeatForever(autoreverses: false)) {
                ballSpin = true
            }
            withAnimation(.easeInOut(duration: 1.3).repeatForever(autoreverses: true)) {
                barProgress = 0.92
            }
            withAnimation(.linear(duration: 5).repeatForever(autoreverses: false)) {
                streaksShift = 1
            }
        }
    }

    // MARK: - Fond : violet de marque + lignes de vitesse

    private func background(in size: CGSize) -> some View {
        ZStack {
            LinearGradient(colors: [brandPurple, deepPurple], startPoint: .top, endPoint: .bottom)

            // Lueur derriere le logo, pour du relief.
            RadialGradient(
                colors: [Color.white.opacity(0.16), .clear],
                center: .init(x: 0.5, y: 0.4), startRadius: 10, endRadius: size.width * 0.7
            )

            // Lignes de vitesse diagonales, façon graphisme sportif.
            Canvas { ctx, canvasSize in
                let count = 7
                let spacing = canvasSize.width / CGFloat(count - 1) * 1.6
                let shift = streaksShift * spacing
                for i in -2...count {
                    let x = CGFloat(i) * spacing - shift.truncatingRemainder(dividingBy: spacing)
                    var path = Path()
                    path.move(to: CGPoint(x: x, y: -40))
                    path.addLine(to: CGPoint(x: x - canvasSize.height * 0.5, y: canvasSize.height + 40))
                    ctx.stroke(path, with: .color(.white.opacity(0.05)), lineWidth: 26)
                }
            }

            // Bandeau diagonal d'accent, comme un liseré de maillot.
            Rectangle()
                .fill(.white.opacity(0.08))
                .frame(width: size.width * 1.6, height: 46)
                .rotationEffect(.degrees(-8))
                .offset(y: -size.height * 0.18)
        }
    }

    // MARK: - Logo ninja (fidele a icons/icon-512.png)

    private var logo: some View {
        ZStack {
            Circle()
                .stroke(.white.opacity(0.25), lineWidth: 2)
                .frame(width: 132, height: 132)

            Circle()
                .fill(.white)
                .frame(width: 118, height: 118)
                .shadow(color: .black.opacity(0.22), radius: 16, y: 8)

            // Chignon, sommet du crane (forme en virgule).
            ZStack {
                Circle().fill(.white).frame(width: 30, height: 30)
                Circle().fill(brandPurple).frame(width: 30, height: 30).offset(x: 10, y: 8)
            }
            .frame(width: 30, height: 30)
            .clipShape(Circle())
            .offset(x: -20, y: -54)

            // Bandeau violet, plus large que la tete, yeux en amande decoupes.
            ZStack {
                Ellipse()
                    .fill(brandPurple)
                    .frame(width: 138, height: 34)
                HStack(spacing: 12) {
                    eye
                    eye
                }
            }
            .offset(y: 4)
        }
    }

    private var eye: some View {
        Ellipse()
            .fill(.white)
            .frame(width: 22, height: 11)
    }

    // MARK: - Wordmark, incline façon maillot de sport

    private var wordmark: some View {
        VStack(alignment: .center, spacing: -6) {
            Text("NINJA")
                .font(.system(size: 34, weight: .black, design: .default))
                .italic()
                .tracking(-0.5)
                .foregroundStyle(.white)
            HStack(spacing: 8) {
                Text("SCORES")
                    .font(.system(size: 24, weight: .black, design: .default))
                    .italic()
                    .tracking(1.5)
                    .foregroundStyle(lavender)
                Capsule()
                    .fill(lavender)
                    .frame(width: 24, height: 3)
                    .rotationEffect(.degrees(-18))
                    .offset(y: -1)
            }
        }
        .rotationEffect(.degrees(-3))
    }

    // MARK: - Slogan, chip façon scoreboard

    private var tagline: some View {
        Text("RAPIDE COMME UN NINJA")
            .font(.system(size: 12, weight: .heavy, design: .default))
            .italic()
            .tracking(1.2)
            .foregroundStyle(brandPurple)
            .padding(.horizontal, 16)
            .padding(.vertical, 7)
            .background(
                Capsule().fill(.white)
            )
    }

    // MARK: - Barre de progression, façon jauge de tableau de score

    private var progressBar: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(.white.opacity(0.18))
                    .frame(height: 6)

                RoundedRectangle(cornerRadius: 2)
                    .fill(.white)
                    .frame(width: max(10, g.size.width * barProgress), height: 6)

                Image(systemName: "soccerball")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .rotationEffect(.degrees(ballSpin ? 360 : 0))
                    .offset(x: max(10, g.size.width * barProgress) - 7, y: -0.5)
            }
        }
        .frame(height: 18)
    }
}
