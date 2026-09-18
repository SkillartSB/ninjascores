/* ═══════════════════════════════════════════════════════════════════════════
   ①  LES DONNÉES — c'est LE SEUL bloc à modifier chaque jour.
       Écussons  → assets/crests/*.png   (ou une URL https://…)
       Ligues    → assets/leagues/*.png
       color     → couleur du club, elle pilote le halo derrière l'écusson
       plate:'light' → écusson très sombre : on le pose sur un disque blanc
       light: true   → logo de ligue très sombre : badge sur fond blanc
   ═══════════════════════════════════════════════════════════════════════════ */
const CAROUSEL = {

  date: 'VEN 18.09',

  /* ── Slide 1 ────────────────────────────────────────────────── */
  cover: {
    eyebrow: 'Mes pronos du jour',
    l1: '5 pronos',
    l2a: 'Pour',
    l2b: 'ce soir',
    swipe: 'Glisse',
  },

  /* ── Slides 2 → 6 ───────────────────────────────────────────────
     Vendredi 18 septembre : les cinq championnats ouvrent leur
     journée le même soir. Horaires et cotes Bet365 via /api/foot,
     fréquences sur des historiques de championnat continus.      */
  matches: [
    {
      league: { name: 'Bundesliga', country: 'Allemagne',
                badge: 'assets/leagues/bundesliga.png', light: true },
      time: '20:30',
      home: { name: 'Bayern', crest: 'assets/crests/bayern.png', color: '#DC052D' },
      away: { name: 'Union Berlin', crest: 'assets/crests/union-berlin.png', color: '#EFB000' },
      prono: ['Union Berlin', 'marque un but'],
      cote: '1.80',
      book: '',
      freq: '80%',
      note: 8,
      sample: "Sur les 10 derniers matchs d'Union",
    },
    {
      league: { name: 'Ligue 1', country: 'France', badge: 'assets/leagues/ligue-1.png' },
      time: '20:45',
      home: { name: 'Monaco', crest: 'assets/crests/monaco.png', color: '#CE1126' },
      away: { name: 'Lens',   crest: 'assets/crests/lens.png',   color: '#F3D10E' },
      prono: ['Plus de', '2.5 buts'],
      cote: '1.58',   // cote relevée sur le book où le pari est placé
      book: '',
      freq: '65%',
      note: 7,
    },
    {
      league: { name: 'Serie A', country: 'Italie', badge: 'assets/leagues/serie-a.png' },
      time: '20:45',
      home: { name: 'Monza',    crest: 'assets/crests/monza.png',    color: '#E2001A' },
      away: { name: 'Sassuolo', crest: 'assets/crests/sassuolo.png', color: '#00A752' },
      prono: ['Moins de', '3.5 buts'],
      cote: '1.40',
      book: '',
      freq: '80%',
      note: 8,
      sample: 'Sur les 10 derniers matchs de Sassuolo',
    },
    {
      league: { name: 'Premier League', country: 'Angleterre',
                badge: 'assets/leagues/premier-league.png', light: true },
      time: '21:00',
      home: { name: 'Brentford', crest: 'assets/crests/brentford.png', color: '#E30613' },
      away: { name: 'Chelsea',   crest: 'assets/crests/chelsea.png',   color: '#1E56A8' },
      prono: ['Brentford', 'ou match nul'],
      cote: '1.57',
      book: '',
      freq: '80%',
      note: 8,
      sample: 'Sur les 10 derniers matchs de Brentford',
    },
    {
      league: { name: 'LaLiga', country: 'Espagne',
                badge: 'assets/leagues/la-liga.png', light: true },
      time: '21:00',
      home: { name: 'Espanyol', crest: 'assets/crests/espanyol.png', color: '#236BBE' },
      away: { name: 'Elche',    crest: 'assets/crests/elche.png',    color: '#00A14B' },
      prono: ['Elche marque', 'au moins 1 but'],
      cote: '1.44',
      book: '',
      freq: '90%',
      note: 9,
      sample: "Sur les 10 derniers matchs d'Elche",
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
    more: '+ 426 autres matchs aujourd\'hui',   // 431 matchs au total le 18/09 selon l'API
    mention: 'Cotes indicatives · fréquences sur les 10 derniers matchs',
  },
};
