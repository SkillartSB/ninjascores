/* ═══════════════════════════════════════════════════════════════════════════
   ①  LES DONNÉES — c'est LE SEUL bloc à modifier chaque jour.
       Écussons  → assets/crests/*.png   (ou une URL https://…)
       Ligues    → assets/leagues/*.png
       color     → couleur du club, elle pilote le halo derrière l'écusson
       plate:'light' → écusson très sombre : on le pose sur un disque blanc
       light: true   → logo de ligue très sombre : badge sur fond blanc
   ═══════════════════════════════════════════════════════════════════════════ */
const CAROUSEL = {

  date: 'MAR 15.09',

  /* ── Slide 1 ────────────────────────────────────────────────── */
  cover: {
    eyebrow: 'Mes pronos du jour',
    l1: '4 pronos',
    l2a: 'Pour',
    l2b: 'ce soir',
    swipe: 'Glisse',
  },

  /* ── Slides 2 → 5 ───────────────────────────────────────────────
     Calendrier réel du mardi 15 septembre (jornada 6 de LaLiga,
     jouée en semaine, + Eredivisie). Horaires en heure française.
     Fréquences calculées sur les 10 derniers matchs réels de chaque
     équipe (marchés buts : les 2 équipes cumulées, soit 20 matchs ;
     double chance : uniquement l'équipe citée). À recouper dans l'app.
     Cotes Bet365 relevées via /api/foot?path=odds.                   */
  matches: [
    {
      league: { name: 'LaLiga', country: 'Espagne', badge: 'assets/leagues/la-liga.png', light: true },
      time: '19:00',
      home: { name: 'Rayo',     crest: 'assets/crests/rayo.png',     color: '#E23A33' },
      away: { name: 'Espanyol', crest: 'assets/crests/espanyol.png', color: '#236BBE' },
      prono: ['Rayo', 'ou match nul'],
      cote: '1.36',
      book: '',      // vide = « INDICATIVE » sans marque de paris
      freq: '80%',
      note: 8,
    },
    {
      league: { name: 'LaLiga', country: 'Espagne', badge: 'assets/leagues/la-liga.png', light: true },
      time: '20:00',
      home: { name: 'Alavés',  crest: 'assets/crests/alaves.png',  color: '#1A43A8' },
      away: { name: 'Valence', crest: 'assets/crests/valence.png', color: '#F0592B' },
      prono: ['Plus de', '1.5 buts'],
      cote: '1.36',
      book: '',      // vide = « INDICATIVE » sans marque de paris
      freq: '70%',
      note: 7,
    },
    {
      league: { name: 'Eredivisie', country: 'Pays-Bas', badge: 'assets/leagues/eredivisie.png', light: true },
      time: '20:00',
      home: { name: 'Ajax',      crest: 'assets/crests/ajax.png',   color: '#D2122E' },
      away: { name: 'Willem II', crest: 'assets/crests/willem.png', color: '#D8232A' },
      prono: ['Moins de', '4.5 buts'],
      cote: '1.67',
      book: '',      // vide = « INDICATIVE » sans marque de paris
      freq: '100%',
      note: 10,
      sample: "Sur les 10 derniers matchs de l'Ajax",
    },
    {
      league: { name: 'LaLiga', country: 'Espagne', badge: 'assets/leagues/la-liga.png', light: true },
      time: '21:30',
      home: { name: 'Elche',       crest: 'assets/crests/elche.png',       color: '#00A14B' },
      away: { name: 'Real Madrid', crest: 'assets/crests/real-madrid.png', color: '#D4B24A' },
      prono: ['Elche marque', 'au moins 1 but'],
      cote: '1.62',
      book: '',      // vide = « INDICATIVE » sans marque de paris
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
    more: '+ 244 autres matchs aujourd\'hui',   // 248 matchs au total le 15/09 selon l'API
    mention: 'Cotes indicatives · fréquences sur les 10 derniers matchs',
  },
};
