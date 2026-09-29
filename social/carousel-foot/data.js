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

  date: 'MAR 29.09',

  /* ── Slide 1 ────────────────────────────────────────────────── */
  cover: {
    eyebrow: 'Mes pronos du jour',
    l1: '5 pronos',
    l2a: 'Pour',
    l2b: 'ce soir',
    swipe: 'Glisse',
  },

  /* ── Slides 2 → 6 ───────────────────────────────────────────────
     Mardi 29 septembre : 4e journee de Ligue des Nations. Horaires et
     cotes Bet365 via /api/foot (relevees a 10h50). Frequences sur les
     6 a 8 derniers matchs de chaque selection, sans trou de calendrier.
     Les 5 retenus sortent du scan complet du slate (scan.mjs) : 145
     matchs du creneau, 246 lignes de pari classees par edge. Tout ce
     qui les depasse est du non-league anglais ou des U20 : donnee
     fragile et invendable. Le 1er match sert de couverture au format
     court.                                                          */
  matches: [
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Tchéquie',   crest: 'assets/crests/flag-cz.svg',     color: '#11457E', round: true },
      away: { name: 'Angleterre', crest: 'assets/crests/flag-gb-eng.svg', color: '#C8102E', round: true },
      prono: ['Les 2 équipes', 'marquent'],
      cote: '2.00',
      book: '',
      freq: '77%',
      note: 9,
      sample: 'Tchéquie : 5 matchs sur 6 avec 2 buteurs',
      hook: ['La Tchéquie :', '5 MATCHS SUR 6', 'avec les 2 équipes qui marquent'],
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '18:00',
      home: { name: 'Finlande',     crest: 'assets/crests/flag-fi.svg', color: '#003580', round: true },
      away: { name: 'Biélorussie',  crest: 'assets/crests/flag-by.svg', color: '#C8102E', round: true },
      prono: ['Plus de', '2.5 buts'],
      cote: '2.15',
      book: '',
      freq: '67%',
      note: 8,
      sample: 'Sur 15 matchs des 2 sélections',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Luxembourg', crest: 'assets/crests/flag-lu.svg', color: '#00A1DE', round: true },
      away: { name: 'Islande',    crest: 'assets/crests/flag-is.svg', color: '#02529C', round: true },
      prono: ['Une équipe', 'finit à 0'],
      cote: '1.83',
      book: '',
      freq: '75%',
      note: 8,
      sample: 'Luxembourg : 7 matchs sur 8 avec un 0',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Saint-Marin', crest: 'assets/crests/flag-sm.svg', color: '#5EB6E4', round: true },
      away: { name: 'Albanie',     crest: 'assets/crests/flag-al.svg', color: '#E41E20', round: true },
      prono: ['Moins de', '2.5 buts'],
      cote: '3.00',
      book: '',
      freq: '50%',
      note: 7,
      sample: 'Albanie : 6 matchs sur 8 sous les 2,5 buts',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Slovaquie',  crest: 'assets/crests/flag-sk.svg', color: '#0B4EA2', round: true },
      away: { name: 'Kazakhstan', crest: 'assets/crests/flag-kz.svg', color: '#FEC50C', round: true },
      prono: ['Moins de', '2.5 buts'],
      cote: '1.95',
      book: '',
      freq: '67%',
      note: 8,
      sample: 'Kazakhstan : 6 matchs sur 7 sous les 2,5 buts',
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
    more: '+ 178 autres matchs aujourd\'hui',   // 183 matchs au total le 29/09 selon l'API
    mention: 'Cotes relevées à 10h50 · fréquences sur 6 à 8 matchs',
  },
};
