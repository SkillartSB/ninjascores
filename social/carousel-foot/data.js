/* ═══════════════════════════════════════════════════════════════════════════
   ①  LES DONNÉES — c'est LE SEUL bloc à modifier chaque jour.
       Écussons  → assets/crests/*.png   (ou une URL https://…)
       Ligues    → assets/leagues/*.png
       color     → couleur du club, elle pilote le halo derrière l'écusson
       plate:'light' → écusson très sombre : on le pose sur un disque blanc
       light: true   → logo de ligue très sombre : badge sur fond blanc
   ═══════════════════════════════════════════════════════════════════════════ */
const CAROUSEL = {

  date: 'JEU 17.09',

  /* ── Slide 1 ────────────────────────────────────────────────── */
  cover: {
    eyebrow: 'Soirée Ligue Europa',
    l1: '5 pronos',
    l2a: 'Pour',
    l2b: 'ce soir',
    swipe: 'Glisse',
  },

  /* ── Slides 2 → 6 ───────────────────────────────────────────────
     Jeudi 17 septembre : première journée de Ligue Europa, plus la fin
     de la 6e journée de LaLiga. Horaires et cotes Bet365 via /api/foot.
     Les fréquences ne comptent que les matchs de CHAMPIONNAT : la
     source ne couvre ni la coupe d'Europe, ni la Turquie, ni la
     Pologne. D'où les pronos adossés à l'équipe dont l'historique se
     suit vraiment, et le champ sample qui le dit sur la slide.     */
  matches: [
    {
      league: { name: 'LaLiga', country: 'Espagne', badge: 'assets/leagues/la-liga.png', light: true },
      time: '19:00',
      home: { name: 'Real Betis', crest: 'assets/crests/betis.png',  color: '#00B554' },
      away: { name: 'Getafe',     crest: 'assets/crests/getafe.png', color: '#1B54A8' },
      prono: ['Victoire', 'du Real Betis'],
      cote: '1.62',
      book: '',
      freq: '60%',
      note: 6,
      sample: 'Sur les 10 derniers matchs du Betis',
    },
    {
      league: { name: 'Ligue Europa', country: 'UEFA', badge: 'assets/leagues/ligue-europa.png', light: true },
      time: '21:00',
      home: { name: 'Beşiktaş',  crest: 'assets/crests/besiktas.png',  color: '#9AA4B2' },
      away: { name: 'Marseille', crest: 'assets/crests/marseille.png', color: '#2FAEE0' },
      prono: ["L'OM marque", 'au moins 1 but'],
      cote: '1.33',
      book: '',
      freq: '70%',
      note: 7,
      sample: "Sur les 10 derniers matchs de l'OM",
    },
    {
      league: { name: 'Ligue Europa', country: 'UEFA', badge: 'assets/leagues/ligue-europa.png', light: true },
      time: '21:00',
      home: { name: 'Juventus', crest: 'assets/crests/juventus.png', color: '#8E99A8',
               plate: 'light' },
      away: { name: 'NEC',      crest: 'assets/crests/nec.png',      color: '#D5202E' },
      prono: ['Moins de', '3.5 buts'],
      cote: '1.80',
      book: '',
      freq: '80%',
      note: 8,
    },
    {
      league: { name: 'Ligue Europa', country: 'UEFA', badge: 'assets/leagues/ligue-europa.png', light: true },
      time: '21:00',
      home: { name: 'Crystal Palace', crest: 'assets/crests/palace.png', color: '#1B458F' },
      away: { name: 'Lech Poznań',    crest: 'assets/crests/lech.png',   color: '#0B6E4F' },
      prono: ['Plus de', '2.5 buts'],
      cote: '1.53',
      book: '',
      freq: '80%',
      note: 8,
      sample: 'Sur les 10 derniers matchs de Palace',
    },
    {
      league: { name: 'Ligue Europa', country: 'UEFA', badge: 'assets/leagues/ligue-europa.png', light: true },
      time: '21:00',
      home: { name: 'Real Sociedad', crest: 'assets/crests/sociedad.png',    color: '#1273C4' },
      away: { name: 'Bournemouth',   crest: 'assets/crests/bournemouth.png', color: '#E01A33' },
      prono: ['Bournemouth', 'ou match nul'],
      cote: '1.40',
      book: '',
      freq: '90%',
      note: 9,
      sample: 'Sur les 10 derniers matchs de Bournemouth',
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
    more: '+ 173 autres matchs aujourd\'hui',   // 178 matchs au total le 17/09 selon l'API
    mention: 'Cotes indicatives · fréquences sur les 10 derniers matchs',
  },
};
