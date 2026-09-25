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

  date: 'VEN 25.09',

  /* ── Slide 1 ────────────────────────────────────────────────── */
  cover: {
    eyebrow: 'Mes pronos du jour',
    l1: '5 pronos',
    l2a: 'Pour',
    l2b: 'ce soir',
    swipe: 'Glisse',
  },

  /* ── Slides 2 → 6 ───────────────────────────────────────────────
     Vendredi 25 septembre : 2e journée de Ligue des Nations et
     qualifications CAN. Horaires et cotes Bet365 via /api/foot
     (relevées à 12h35). Fréquences calculées sur les 8 derniers
     matchs de chaque sélection, sans trou de calendrier.           */
  matches: [
    {
      league: { name: 'Qualif. CAN', country: 'Afrique',
                badge: 'assets/leagues/can-qualif.svg' },
      time: '18:00',
      home: { name: 'Nigeria',    crest: 'assets/crests/flag-ng.svg', color: '#008751', round: true },
      away: { name: 'Madagascar', crest: 'assets/crests/flag-mg.svg', color: '#FC3D32', round: true },
      prono: ['Plus de', '2.5 buts'],
      cote: '1.73',
      book: '',
      freq: '77%',
      note: 8,
      sample: 'Sur 13 matchs des 2 sélections',
    },
    {
      league: { name: 'Qualif. CAN', country: 'Afrique',
                badge: 'assets/leagues/can-qualif.svg' },
      time: '18:00',
      home: { name: 'Malawi',  crest: 'assets/crests/flag-mw.svg', color: '#CE1126', round: true },
      away: { name: 'S. Sud',  crest: 'assets/crests/flag-ss.svg', color: '#0F47AF', round: true },
      prono: ['Moins de', '2.5 buts'],
      cote: '1.57',
      book: '',
      freq: '79%',
      note: 8,
      sample: 'Malawi : 0 match à +2,5 buts sur 6',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Turquie', crest: 'assets/crests/flag-tr.svg', color: '#E30A17', round: true },
      away: { name: 'France',  crest: 'assets/crests/flag-fr.svg', color: '#1E5BC6', round: true },
      prono: ['Victoire', 'de la France'],
      cote: '1.33',
      book: '',
      freq: '75%',
      note: 7,
      sample: 'France : 6 victoires sur 8',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Italie',   crest: 'assets/crests/flag-it.svg', color: '#1A62B3', round: true },
      away: { name: 'Belgique', crest: 'assets/crests/flag-be.svg', color: '#FDDA24', round: true },
      prono: ['Une équipe', 'finit à 0'],
      cote: '2.25',
      book: '',
      freq: '57%',
      note: 7,
      sample: 'Italie : 5 clean sheets sur 7',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Suède',    crest: 'assets/crests/flag-se.svg', color: '#FECC02', round: true },
      away: { name: 'Roumanie', crest: 'assets/crests/flag-ro.svg', color: '#002B7F', round: true },
      prono: ['Les 2 équipes', 'marquent'],
      cote: '1.73',
      book: '',
      freq: '75%',
      note: 8,
      sample: 'Suède : 0 clean sheet sur 8',
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
    more: '+ 247 autres matchs aujourd\'hui',   // 252 matchs au total le 25/09 selon l'API
    mention: 'Cotes relevées à 12h35 · fréquences sur 8 matchs',
  },
};
