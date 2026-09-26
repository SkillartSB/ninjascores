/* ═══════════════════════════════════════════════════════════════════════════
   ①  LES DONNÉES — c'est LE SEUL bloc à modifier chaque jour.
       Écussons  → assets/crests/*.png   (ou une URL https://…)
       Ligues    → assets/leagues/*.png
       color     → couleur du club, elle pilote le halo derrière l'écusson
       plate:'light' → écusson très sombre : on le pose sur un disque blanc
       light: true   → logo de ligue très sombre : badge sur fond blanc
       round: true   → drapeau de sélection : recadré en pastille ronde
       hook          → la phrase choc du 1er match, utilisée par le format
                       court (court.html) comme couverture. Une seule idée,
                       lisible en miniature dans le fil.
   ═══════════════════════════════════════════════════════════════════════════ */
const CAROUSEL = {

  date: 'SAM 26.09',

  /* ── Slide 1 ────────────────────────────────────────────────── */
  cover: {
    eyebrow: 'Mes pronos du jour',
    l1: '5 pronos',
    l2a: 'Pour',
    l2b: 'ce soir',
    swipe: 'Glisse',
  },

  /* ── Slides 2 → 6 ───────────────────────────────────────────────
     Samedi 26 septembre : 3e journée de Ligue des Nations. Horaires
     et cotes Bet365 via /api/foot (relevées à 11h30). Fréquences sur
     les 8 derniers matchs de chaque sélection, sans trou de calendrier.
     Le 1er match sert de couverture au format court.                */
  matches: [
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Angleterre', crest: 'assets/crests/flag-gb-eng.svg', color: '#C8102E', round: true },
      away: { name: 'Espagne',    crest: 'assets/crests/flag-es.svg',     color: '#FFC400', round: true },
      prono: ['Une équipe', 'finit à 0'],
      cote: '2.20',
      book: '',
      freq: '57%',
      note: 7,
      sample: 'Espagne : 1 but encaissé en 7 matchs',
      hook: ["L'Espagne a encaissé", '1 SEUL BUT', 'sur ses 7 derniers matchs'],
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Tchéquie', crest: 'assets/crests/flag-cz.svg', color: '#11457E', round: true },
      away: { name: 'Croatie',  crest: 'assets/crests/flag-hr.svg', color: '#D10000', round: true },
      prono: ['Plus de', '2.5 buts'],
      cote: '1.85',
      book: '',
      freq: '79%',
      note: 9,
      sample: 'Sur 14 matchs des 2 sélections',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '18:00',
      home: { name: 'Bulgarie',   crest: 'assets/crests/flag-bg.svg', color: '#00966E', round: true },
      away: { name: 'Luxembourg', crest: 'assets/crests/flag-lu.svg', color: '#00A1DE', round: true },
      prono: ['Une équipe', 'finit à 0'],
      cote: '1.67',
      book: '',
      freq: '75%',
      note: 8,
      sample: 'Luxembourg : 0 match sur 8 avec 2 buteurs',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Slovaquie', crest: 'assets/crests/flag-sk.svg', color: '#0B4EA2', round: true },
      away: { name: 'Moldavie',  crest: 'assets/crests/flag-md.svg', color: '#FFD200', round: true },
      prono: ['Les 2 équipes', 'marquent'],
      cote: '2.50',
      book: '',
      freq: '56%',
      note: 7,
      sample: 'Moldavie : 0 clean sheet sur 8 matchs',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '18:00',
      home: { name: 'Féroé',      crest: 'assets/crests/flag-fo.svg', color: '#0065BD', round: true },
      away: { name: 'Kazakhstan', crest: 'assets/crests/flag-kz.svg', color: '#FEC50C', round: true },
      prono: ['Moins de', '2.5 buts'],
      cote: '1.60',
      book: '',
      freq: '69%',
      note: 7,
      sample: 'Kazakhstan : 1 match à +2,5 buts sur 7',
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
    more: '+ 1172 autres matchs aujourd\'hui',   // 1177 matchs au total le 26/09 selon l'API
    mention: 'Cotes relevées à 11h30 · fréquences sur 8 matchs',
  },
};
