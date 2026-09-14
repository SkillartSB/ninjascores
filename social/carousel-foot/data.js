/* ═══════════════════════════════════════════════════════════════════════════
   ①  LES DONNÉES — c'est LE SEUL bloc à modifier chaque jour.
       Écussons  → assets/crests/*.png   (ou une URL https://…)
       Ligues    → assets/leagues/*.png
       color     → couleur du club, elle pilote le halo derrière l'écusson
       plate:'light' → écusson très sombre : on le pose sur un disque blanc
       light: true   → logo de ligue très sombre : badge sur fond blanc
   ═══════════════════════════════════════════════════════════════════════════ */
const CAROUSEL = {

  date: 'LUN 14.09',

  /* ── Slide 1 ────────────────────────────────────────────────── */
  cover: {
    eyebrow: 'Mes pronos du jour',
    l1: '5 pronos',
    l2a: 'Pour',
    l2b: 'ce soir',
    swipe: 'Glisse',
  },

  /* ── Slides 2 → 6 ───────────────────────────────────────────── */
  matches: [
    {
      league: { name: 'Serie A', country: 'Italie', badge: 'assets/leagues/serie-a.png' },
      time: '18:30',
      home: { name: 'Torino',  crest: 'assets/crests/torino.png', color: '#A32020' },
      away: { name: 'AS Roma', crest: 'assets/crests/roma.png',   color: '#C2394F' },
      prono: ['Victoire', 'de la Roma'],
      cote: '1.55',
      book: 'Bet365',
      freq: '90%',
      note: 9,
    },
    {
      league: { name: 'Serie A', country: 'Italie', badge: 'assets/leagues/serie-a.png' },
      time: '20:45',
      home: { name: 'Inter',   crest: 'assets/crests/inter.png',   color: '#2C46E8' },
      away: { name: 'Udinese', crest: 'assets/crests/udinese.png', color: '#98A3B5' },
      prono: ['Plus de', '2.5 buts'],
      cote: '1.62',
      book: 'Bet365',
      freq: '80%',
      note: 8,
    },
    {
      league: { name: 'Ligue 1', country: 'France', badge: 'assets/leagues/ligue-1.png' },
      time: '20:45',
      home: { name: 'Lens', crest: 'assets/crests/lens.png', color: '#E01A33' },
      away: { name: 'Metz', crest: 'assets/crests/metz.png', color: '#9E1B2A', plate: 'light' },
      prono: ['Victoire', 'de Lens'],
      cote: '1.48',
      book: 'Bet365',
      freq: '90%',
      note: 9,
    },
    {
      league: { name: 'Premier League', country: 'Angleterre', badge: 'assets/leagues/premier-league.png', light: true },
      time: '21:00',
      home: { name: 'Leeds',     crest: 'assets/crests/leeds.png',     color: '#2C5FC8' },
      away: { name: 'Newcastle', crest: 'assets/crests/newcastle.png', color: '#AEBACA' },
      prono: ['Newcastle', 'ou match nul'],
      cote: '1.57',
      book: 'Bet365',
      freq: '90%',
      note: 9,
    },
    {
      league: { name: 'LaLiga', country: 'Espagne', badge: 'assets/leagues/la-liga.png', light: true },
      time: '21:00',
      home: { name: 'Villarreal', crest: 'assets/crests/villarreal.png', color: '#FFD64D' },
      away: { name: 'Real Betis', crest: 'assets/crests/betis.png',      color: '#00B554' },
      prono: ['Real Betis', 'ou match nul'],
      cote: '1.82',
      book: 'Bet365',
      freq: '90%',
      note: 9,
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
    more: '+ 38 autres matchs aujourd\'hui',
    mention: 'Cotes indicatives · 18+ · Jouer comporte des risques',
  },
};
