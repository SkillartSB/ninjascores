/* ═══════════════════════════════════════════════════════════════════════════
   ①  LES DONNÉES — c'est LE SEUL bloc à modifier chaque jour.
       Écussons  → assets/crests/*.png   (ou une URL https://…)
       Ligues    → assets/leagues/*.png
       color     → couleur du club, elle pilote le halo derrière l'écusson
       plate:'light' → écusson très sombre : on le pose sur un disque blanc
       light: true   → logo de ligue très sombre : badge sur fond blanc
       round: true   → drapeau de sélection : recadré en pastille ronde
   ═══════════════════════════════════════════════════════════════════════════ */
const CAROUSEL = {

  date: 'JEU 24.09',

  /* ── Slide 1 ────────────────────────────────────────────────── */
  cover: {
    eyebrow: 'Mes pronos du jour',
    l1: '5 pronos',
    l2a: 'Pour',
    l2b: 'ce soir',
    swipe: 'Glisse',
  },

  /* ── Slides 2 → 6 ───────────────────────────────────────────────
     Jeudi 24 septembre : trêve internationale. Première journée de
     Ligue des Nations et qualifications CAN. Horaires et cotes Bet365
     via /api/foot (relevées à 12h20). Fréquences calculées sur les
     8 derniers matchs de chaque sélection, sans trou de calendrier.  */
  matches: [
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Pays-Bas',  crest: 'assets/crests/flag-nl.svg', color: '#F36C21', round: true },
      away: { name: 'Allemagne', crest: 'assets/crests/flag-de.svg', color: '#DD0000', round: true },
      prono: ['Plus de', '2.5 buts'],
      cote: '1.44',
      book: '',
      freq: '86%',
      note: 9,
      sample: 'Sur 14 matchs des 2 sélections',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Norvège',  crest: 'assets/crests/flag-no.svg', color: '#00205B', round: true },
      away: { name: 'Danemark', crest: 'assets/crests/flag-dk.svg', color: '#C60C30', round: true },
      prono: ['Plus de', '2.5 buts'],
      cote: '1.57',
      book: '',
      freq: '86%',
      note: 9,
      sample: 'Sur 14 matchs des 2 sélections',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Kosovo',  crest: 'assets/crests/flag-xk.svg', color: '#244AA5', round: true },
      away: { name: 'Irlande', crest: 'assets/crests/flag-ie.svg', color: '#169B62', round: true },
      prono: ['Une équipe', 'finit à 0'],
      cote: '1.80',
      book: '',
      freq: '67%',
      note: 7,
      sample: "Irlande : 3 buts encaissés en 7 matchs",
    },
    {
      league: { name: 'Qualif. CAN', country: 'Afrique',
                badge: 'assets/leagues/can-qualif.svg' },
      time: '21:00',
      home: { name: "Côte d'Ivoire", crest: 'assets/crests/flag-ci.svg', color: '#FF8200', round: true },
      away: { name: 'Ghana',         crest: 'assets/crests/flag-gh.svg', color: '#CE1126', round: true },
      prono: ['Victoire', "Côte d'Ivoire"],
      cote: '1.57',
      book: '',
      freq: '75%',
      note: 8,
      sample: 'Ghana : 1 victoire sur 8 matchs',
    },
    {
      league: { name: 'Qualif. CAN', country: 'Afrique',
                badge: 'assets/leagues/can-qualif.svg' },
      time: '21:00',
      home: { name: 'Cameroun', crest: 'assets/crests/flag-cm.svg', color: '#007A5E', round: true },
      away: { name: 'Comores',  crest: 'assets/crests/flag-km.svg', color: '#3A75C4', round: true },
      prono: ['Moins de', '2.5 buts'],
      cote: '1.75',
      book: '',
      freq: '77%',
      note: 8,
      sample: 'Sur 13 matchs des 2 sélections',
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
    more: '+ 102 autres matchs aujourd\'hui',   // 107 matchs au total le 24/09 selon l'API
    mention: 'Cotes relevées à 12h20 · fréquences sur 8 matchs',
  },
};
