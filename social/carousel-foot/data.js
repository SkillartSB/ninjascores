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

  date: 'LUN 28.09',

  /* ── Slide 1 ────────────────────────────────────────────────── */
  cover: {
    eyebrow: 'Mes pronos du jour',
    l1: '5 pronos',
    l2a: 'Pour',
    l2b: 'ce soir',
    swipe: 'Glisse',
  },

  /* ── Slides 2 → 6 ───────────────────────────────────────────────
     Lundi 28 septembre : 3e journee de Ligue des Nations. Horaires et
     cotes Bet365 via /api/foot (relevees a 10h40). Frequences sur les
     7 a 8 derniers matchs de chaque selection, sans trou de calendrier.
     Les 5 retenus sortent du scan complet du slate (scan.mjs) : 104
     matchs du creneau, 149 lignes de pari classees par edge — toutes
     les meilleures sont en Ligue des Nations ce soir. Le 1er match sert
     de couverture au format court : Belgique - France, l'affiche qui
     parle le plus a une audience francaise.                          */
  matches: [
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Belgique', crest: 'assets/crests/flag-be.svg', color: '#FDDA24', round: true },
      away: { name: 'France',   crest: 'assets/crests/flag-fr.svg', color: '#002395', round: true },
      prono: ['Une équipe', 'finit à 0'],
      cote: '2.50',
      book: '',
      freq: '60%',
      note: 7,
      sample: 'France : 6 matchs sur 8 avec une équipe à 0',
      hook: ['La France :', '6 MATCHS SUR 8', 'avec une équipe qui finit à 0'],
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '18:00',
      home: { name: 'Arménie',    crest: 'assets/crests/flag-am.svg', color: '#D90012', round: true },
      away: { name: 'Monténégro', crest: 'assets/crests/flag-me.svg', color: '#C40308', round: true },
      prono: ['Les 2 équipes', 'marquent'],
      cote: '1.91',
      book: '',
      freq: '67%',
      note: 7,
      sample: 'Monténégro : 6 matchs sur 8 avec 2 buteurs',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '18:00',
      home: { name: 'Lettonie', crest: 'assets/crests/flag-lv.svg', color: '#9E3039', round: true },
      away: { name: 'Chypre',   crest: 'assets/crests/flag-cy.svg', color: '#D57800', round: true },
      prono: ['Une équipe', 'finit à 0'],
      cote: '1.73',
      book: '',
      freq: '67%',
      note: 7,
      sample: 'Lettonie : 6 matchs sur 7 avec une équipe à 0',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Turquie', crest: 'assets/crests/flag-tr.svg', color: '#E30A17', round: true },
      away: { name: 'Italie',  crest: 'assets/crests/flag-it.svg', color: '#008C45', round: true },
      prono: ['Une équipe', 'finit à 0'],
      cote: '2.38',
      book: '',
      freq: '80%',
      note: 9,
      sample: 'Sur 15 matchs des 2 sélections',
    },
    {
      league: { name: 'Ligue des Nations', country: 'Europe',
                badge: 'assets/leagues/nations-league.svg' },
      time: '20:45',
      home: { name: 'Suède',   crest: 'assets/crests/flag-se.svg', color: '#FECC00', round: true },
      away: { name: 'Pologne', crest: 'assets/crests/flag-pl.svg', color: '#DC143C', round: true },
      prono: ['Les 2 équipes', 'marquent'],
      cote: '1.57',
      book: '',
      freq: '75%',
      note: 8,
      sample: 'Suède : 7 matchs sur 8 avec 2 buteurs',
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
    more: '+ 90 autres matchs aujourd\'hui',   // 95 matchs au total le 28/09 selon l'API
    mention: 'Cotes relevées à 10h40 · fréquences sur 7 à 8 matchs',
  },
};
