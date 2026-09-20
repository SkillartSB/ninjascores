/* ═══════════════════════════════════════════════════════════════════════════
   ①  LES DONNÉES — c'est LE SEUL bloc à modifier chaque jour.
       Écussons  → assets/crests/*.png   (ou une URL https://…)
       Ligues    → assets/leagues/*.png
       color     → couleur du club, elle pilote le halo derrière l'écusson
       plate:'light' → écusson très sombre : on le pose sur un disque blanc
       light: true   → logo de ligue très sombre : badge sur fond blanc
   ═══════════════════════════════════════════════════════════════════════════ */
const CAROUSEL = {

  date: 'DIM 20.09',

  /* ── Slide 1 ────────────────────────────────────────────────── */
  cover: {
    eyebrow: 'Mes pronos du jour',
    l1: '5 pronos',
    l2a: 'Pour',
    l2b: 'ce soir',
    swipe: 'Glisse',
  },

  /* ── Slides 2 → 6 ───────────────────────────────────────────────
     Dimanche 20 septembre : derby de Madrid, Classique OM – PSG et
     Clássico portugais le même jour. Horaires et cotes Bet365 via
     /api/foot ; fréquences sur des historiques de championnat
     continus.                                                    */
  matches: [
    {
      league: { name: 'LaLiga', country: 'Espagne',
                badge: 'assets/leagues/la-liga.png', light: true },
      time: '16:15',
      home: { name: 'Atlético',    crest: 'assets/crests/atletico.png',    color: '#E03127' },
      away: { name: 'Real Madrid', crest: 'assets/crests/real-madrid.png', color: '#D4B24A' },
      prono: ['Atlético', 'ou match nul'],
      cote: '1.80',
      book: '',
      freq: '70%',
      note: 7,
      sample: "Sur les 10 derniers matchs de l'Atlético",
    },
    {
      league: { name: 'Premier League', country: 'Angleterre',
                badge: 'assets/leagues/premier-league.png', light: true },
      time: '17:30',
      home: { name: 'Fulham',     crest: 'assets/crests/fulham.png',     color: '#9FA8B8' },
      away: { name: 'Man United', crest: 'assets/crests/man-united.png', color: '#DA291C' },
      prono: ['Moins de', '3.5 buts'],
      cote: '1.62',
      book: '',
      freq: '70%',
      note: 7,
    },
    {
      league: { name: 'Serie A', country: 'Italie', badge: 'assets/leagues/serie-a.png' },
      time: '18:00',
      home: { name: 'Juventus', crest: 'assets/crests/juventus.png', color: '#8E99A8',
              plate: 'light' },
      away: { name: 'Atalanta', crest: 'assets/crests/atalanta.png', color: '#2A7FD4' },
      prono: ['Moins de', '2.5 buts'],
      cote: '1.91',
      book: '',
      freq: '75%',
      note: 8,
    },
    {
      league: { name: 'Ligue 1', country: 'France', badge: 'assets/leagues/ligue-1.png' },
      time: '20:45',
      home: { name: 'Marseille', crest: 'assets/crests/marseille.png', color: '#2FAEE0' },
      away: { name: 'PSG',       crest: 'assets/crests/psg.png',       color: '#E31837' },
      prono: ['Moins de', '4.5 buts'],
      cote: '1.40',
      book: '',
      freq: '95%',
      note: 10,
    },
    {
      league: { name: 'Liga Portugal', country: 'Portugal',
                badge: 'assets/leagues/liga-portugal.png' },
      time: '21:30',
      home: { name: 'Porto',   crest: 'assets/crests/porto.png',   color: '#0057B8' },
      away: { name: 'Benfica', crest: 'assets/crests/benfica.png', color: '#E00000' },
      prono: ['Benfica', 'ou match nul'],
      cote: '1.44',
      book: '',
      freq: '100%',
      note: 10,
      sample: 'Sur les 10 derniers matchs de Benfica',
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
    more: '+ 1149 autres matchs aujourd\'hui',   // 1154 matchs au total le 20/09 selon l'API
    mention: 'Cotes indicatives · fréquences sur les 10 derniers matchs',
  },
};
