/* ═══════════════════════════════════════════════════════════════════════════
   ①  LES DONNÉES — c'est LE SEUL bloc à modifier chaque jour.
       Écussons  → assets/crests/*.png   (ou une URL https://…)
       Ligues    → assets/leagues/*.png
       color     → couleur du club, elle pilote le halo derrière l'écusson
       plate:'light' → écusson très sombre : on le pose sur un disque blanc
       light: true   → logo de ligue très sombre : badge sur fond blanc
   ═══════════════════════════════════════════════════════════════════════════ */
const CAROUSEL = {

  date: 'SAM 19.09',

  /* ── Slide 1 ────────────────────────────────────────────────── */
  cover: {
    eyebrow: 'Mes pronos du jour',
    l1: '5 pronos',
    l2a: 'Pour',
    l2b: 'ce soir',
    swipe: 'Glisse',
  },

  /* ── Slides 2 → 6 ───────────────────────────────────────────────
     Samedi 19 septembre. Horaires et cotes Bet365 relevés via
     /api/foot ; fréquences calculées sur les dix derniers matchs de
     championnat, échantillons continus uniquement.               */
  matches: [
    {
      league: { name: 'Premier League', country: 'Angleterre',
                badge: 'assets/leagues/premier-league.png', light: true },
      time: '16:00',
      home: { name: 'Brighton', crest: 'assets/crests/brighton.png', color: '#0057B8' },
      away: { name: 'Arsenal',  crest: 'assets/crests/arsenal.png',  color: '#EF0107' },
      prono: ['Victoire', "d'Arsenal"],
      cote: '1.70',
      book: '',
      freq: '80%',
      note: 8,
      sample: "Sur les 10 derniers matchs d'Arsenal",
    },
    {
      league: { name: 'Serie A', country: 'Italie', badge: 'assets/leagues/serie-a.png' },
      time: '18:00',
      home: { name: 'AS Roma', crest: 'assets/crests/roma.png',  color: '#C2394F' },
      away: { name: 'Inter',   crest: 'assets/crests/inter.png', color: '#2C46E8' },
      prono: ['AS Roma', 'ou match nul'],
      cote: '1.50',
      book: '',
      freq: '100%',
      note: 10,
      sample: 'Sur les 10 derniers matchs de la Roma',
    },
    {
      league: { name: 'Bundesliga', country: 'Allemagne',
                badge: 'assets/leagues/bundesliga.png', light: true },
      time: '18:30',
      home: { name: 'Stuttgart', crest: 'assets/crests/stuttgart.png', color: '#E32219' },
      away: { name: 'Dortmund',  crest: 'assets/crests/dortmund.png',  color: '#FDE100' },
      prono: ['Plus de', '2.5 buts'],
      cote: '1.40',
      book: '',
      freq: '80%',
      note: 8,
      sample: 'Sur les 10 derniers matchs de Stuttgart',
    },
    {
      league: { name: 'Ligue 1', country: 'France', badge: 'assets/leagues/ligue-1.png' },
      time: '20:45',
      home: { name: 'Lyon',   crest: 'assets/crests/lyon.png',   color: '#1B4FA0' },
      away: { name: 'Rennes', crest: 'assets/crests/rennes.png', color: '#D42A2E' },
      prono: ['Plus de', '2.5 buts'],
      cote: '1.53',
      book: '',
      freq: '80%',
      note: 8,
    },
    {
      league: { name: 'LaLiga', country: 'Espagne',
                badge: 'assets/leagues/la-liga.png', light: true },
      time: '21:00',
      home: { name: 'Séville',   crest: 'assets/crests/seville.png',   color: '#E02D1B' },
      away: { name: 'Barcelone', crest: 'assets/crests/barcelone.png', color: '#A50044' },
      prono: ['Séville marque', 'au moins 1 but'],
      cote: '1.50',
      book: '',
      freq: '80%',
      note: 8,
      sample: 'Sur les 10 derniers matchs de Séville',
    },
  ],

  /* ── Slide 7 ────────────────────────────────────────────────── */
  cta: {
    eyebrow: 'Tous les matchs, tous les pronos',
    l1: 'En live',
    l2a: 'sur',
    l2b: "l'app",
    search: 'NinjaScores : Scores en direct',
    claim: 'Gratuit · sans abonnement',
    site: 'ninjascores.com',
    more: '+ 1548 autres matchs aujourd\'hui',   // 1553 matchs au total le 19/09 selon l'API
    mention: 'Cotes indicatives · fréquences sur les 10 derniers matchs',
  },
};
