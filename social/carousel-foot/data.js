/* ═══════════════════════════════════════════════════════════════════════════
   ①  LES DONNÉES — c'est LE SEUL bloc à modifier chaque jour.
       Écussons  → assets/crests/*.png   (ou une URL https://…)
       Ligues    → assets/leagues/*.png
       color     → couleur du club, elle pilote le halo derrière l'écusson
       plate:'light' → écusson très sombre : on le pose sur un disque blanc
       light: true   → logo de ligue très sombre : badge sur fond blanc
   ═══════════════════════════════════════════════════════════════════════════ */
const CAROUSEL = {

  date: 'MER 16.09',

  /* ── Slide 1 ────────────────────────────────────────────────── */
  cover: {
    eyebrow: 'Mes pronos du jour',
    l1: '4 pronos',
    l2a: 'Pour',
    l2b: 'ce soir',
    swipe: 'Glisse',
  },

  /* ── Slides 2 → 5 ───────────────────────────────────────────────
     Mercredi 16 septembre, fin de la 6e journée de LaLiga.
     Horaires et cotes (Bet365) relevés via /api/foot.
     Fréquences calculées sur des historiques CONTINUS : Deportivo et
     Racing sortent de deuxième division, leur historique a des trous,
     donc chaque prono s'appuie sur l'équipe dont les dix derniers
     matchs se suivent — le champ sample le dit sur la slide.      */
  matches: [
    {
      league: { name: 'LaLiga', country: 'Espagne', badge: 'assets/leagues/la-liga.png', light: true },
      time: '19:00',
      home: { name: 'Atlético', crest: 'assets/crests/atletico.png', color: '#E03127' },
      away: { name: 'Osasuna',  crest: 'assets/crests/osasuna.png',  color: '#1A3A7A' },
      prono: ['Osasuna marque', 'au moins 1 but'],
      cote: '1.80',
      book: '',
      freq: '80%',
      note: 8,
      sample: "Sur les 10 derniers matchs d'Osasuna",
    },
    {
      league: { name: 'LaLiga', country: 'Espagne', badge: 'assets/leagues/la-liga.png', light: true },
      time: '19:00',
      home: { name: 'Deportivo', crest: 'assets/crests/deportivo.png', color: '#1C77D4' },
      away: { name: 'Séville',   crest: 'assets/crests/seville.png',   color: '#E02D1B' },
      prono: ['Les deux équipes', 'marquent'],
      cote: '1.91',
      book: '',
      freq: '70%',
      note: 7,
      sample: 'Sur les 10 derniers matchs de Séville',
    },
    {
      league: { name: 'LaLiga', country: 'Espagne', badge: 'assets/leagues/la-liga.png', light: true },
      time: '21:30',
      home: { name: 'Barcelone', crest: 'assets/crests/barcelone.png', color: '#A50044' },
      away: { name: 'Racing',    crest: 'assets/crests/racing.png',    color: '#00A859' },
      prono: ['Moins de', '5.5 buts'],
      cote: '1.53',
      book: '',
      freq: '90%',
      note: 9,
      sample: 'Sur les 10 derniers matchs du Barça',
    },
    {
      league: { name: 'LaLiga', country: 'Espagne', badge: 'assets/leagues/la-liga.png', light: true },
      time: '21:30',
      home: { name: 'Levante',  crest: 'assets/crests/levante.png',  color: '#1B4FA0' },
      away: { name: 'Athletic', crest: 'assets/crests/athletic.png', color: '#E8322E' },
      prono: ['Levante', 'ou match nul'],
      cote: '1.70',
      book: '',
      freq: '70%',
      note: 7,
      sample: 'Sur les 10 derniers matchs de Levante',
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
    more: '+ 417 autres matchs aujourd\'hui',   // 421 matchs au total le 16/09 selon l'API
    mention: 'Cotes indicatives · fréquences sur les 10 derniers matchs',
  },
};
