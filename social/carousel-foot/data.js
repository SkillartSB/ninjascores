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

  date: 'DIM 27.09',

  /* ── Slide 1 ────────────────────────────────────────────────── */
  cover: {
    eyebrow: 'Mes pronos du jour',
    l1: '5 pronos',
    l2a: 'Pour',
    l2b: 'ce soir',
    swipe: 'Glisse',
  },

  /* ── Slides 2 → 6 ───────────────────────────────────────────────
     Dimanche 27 septembre : 2e journee de Ligue des Nations. Horaires
     et cotes Bet365 via /api/foot (relevees a 13h20). Frequences sur
     les 7 a 8 derniers matchs de chaque selection, sans trou de
     calendrier. Les 5 retenus sortent du scan complet du slate
     (scan.mjs) : 611 matchs du creneau, 655 lignes de pari classees
     par edge. Le 1er match sert de couverture au format court.       */
  matches: [
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '18:00',
      home: { name: 'Serbie',   crest: 'assets/crests/flag-rs.svg', color: '#C6363C', round: true },
      away: { name: 'Pays-Bas', crest: 'assets/crests/flag-nl.svg', color: '#FF6B00', round: true },
      prono: ['Les 2 équipes', 'marquent'],
      cote: '1.73',
      book: '',
      freq: '71%',
      note: 8,
      sample: 'Pays-Bas : 6 matchs sur 7 avec 2 buteurs',
      hook: ['Les Pays-Bas :', '6 MATCHS SUR 7', 'avec les 2 équipes qui marquent'],
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '18:00',
      home: { name: 'Danemark',       crest: 'assets/crests/flag-dk.svg',     color: '#C8102E', round: true },
      away: { name: 'Pays de Galles', crest: 'assets/crests/flag-gb-wls.svg', color: '#00AD48', round: true },
      prono: ['Les 2 équipes', 'marquent'],
      cote: '1.83',
      book: '',
      freq: '71%',
      note: 8,
      sample: 'Sur 14 matchs des 2 sélections',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '18:00',
      home: { name: 'Autriche', crest: 'assets/crests/flag-at.svg', color: '#ED2939', round: true },
      away: { name: 'Kosovo',   crest: 'assets/crests/flag-xk.svg', color: '#244AA5', round: true },
      prono: ['Une équipe', 'finit à 0'],
      cote: '1.83',
      book: '',
      freq: '60%',
      note: 7,
      sample: 'Kosovo : 5 matchs sur 8 avec un 0',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Allemagne', crest: 'assets/crests/flag-de.svg', color: '#FFCC00', round: true },
      away: { name: 'Grèce',     crest: 'assets/crests/flag-gr.svg', color: '#0D5EAF', round: true },
      prono: ['Les 2 équipes', 'marquent'],
      cote: '1.57',
      book: '',
      freq: '67%',
      note: 6,
      sample: 'Allemagne : 6 matchs sur 7 avec 2 buteurs',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Israël',  crest: 'assets/crests/flag-il.svg', color: '#0038B8', round: true },
      away: { name: 'Irlande', crest: 'assets/crests/flag-ie.svg', color: '#169B62', round: true },
      prono: ['Une équipe', 'finit à 0'],
      cote: '1.91',
      book: '',
      freq: '60%',
      note: 7,
      sample: 'Irlande : 5 matchs sur 7 avec un 0',
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
    // Le canal Telegram : c'est LE lien de la bio, donc la destination
    // reelle du « lien en bio ». On ne montre jamais l'URL (personne ne
    // recopie une invite t.me/+xxxx), on renvoie vers la bio.
    telegram: {
      t1: 'Mes pronos en direct',
      t2: 'Sur Telegram · lien en bio',
    },
    more: '+ 887 autres matchs aujourd\'hui',   // 892 matchs au total le 27/09 selon l'API
    mention: 'Cotes relevées à 13h20 · fréquences sur 7 à 8 matchs',
  },
};
