// Pronostics du jour, au format attendu par l'écran /pronostics/.
//
// Cet écran affichait 52 pronostics ECRITS EN DUR dans le bundle — matchs
// inventés, cotes inventées, indices inventés. Il sert désormais les articles
// réellement générés, et chaque ligne pointe vers son article.

// Traduction des libelles de marche vers le francais. Les articles sont rediges
// dans la langue de leur competition (nl, pt, de…) mais l'interface de l'app
// est en francais : on traduit le libelle du pari pour que l'onglet Pronostics
// soit lisible.
const FR = {
  'ou25+': 'Plus de 2,5 buts',
  'ou25-': 'Moins de 2,5 buts',
  'ou15+': 'Plus de 1,5 buts',
  'btts+': 'Les deux équipes marquent',
  'btts-': 'Une équipe ne marque pas',
  'mt1+':  'Plus de 0,5 but en 1re mi-temps',
  'mt2+':  'Plus de 0,5 but en 2e mi-temps',
  'dc1x':  '{dom} ou match nul',
  'dcx2':  '{ext} ou match nul',
};

// Patterns pour les articles sans `cle` (generes avant l'ajout du champ).
const PATTERNS = [
  [/over 2[.,]5|mehr als 2[.,]5|más de 2[.,]5|meer dan 2[.,]5|mais de 2[.,]5|über 2[.,]5|più di 2[.,]5/i, 'ou25+'],
  [/under 2[.,]5|weniger als 2[.,]5|menos de 2[.,]5|minder dan 2[.,]5|unter 2[.,]5|meno di 2[.,]5/i, 'ou25-'],
  [/over 1[.,]5|mehr als 1[.,]5|más de 1[.,]5|meer dan 1[.,]5|mais de 1[.,]5|über 1[.,]5|più di 1[.,]5/i, 'ou15+'],
  [/both teams? to score|beide ploegen scoren|beide teams treffen|ambos equipos marcan|ambas equip|entrambe le squadre/i, 'btts+'],
  [/one team to blank|uma equipa não marca|een ploeg scoort niet|un equipo no marca|eine Mannschaft.*nicht|una squadra non segna/i, 'btts-'],
  [/first half|1re mi-temps|eerste helft|primera parte|erste Halbzeit|primo tempo|1\.? tempo/i, 'mt1+'],
  [/second half|2e mi-temps|tweede helft|segundo tiempo|zweite Halbzeit|secondo tempo|2\.? tempo/i, 'mt2+'],
];

function traduire(libelle, cle, dom, ext) {
  if (cle && FR[cle]) {
    return FR[cle].replace('{dom}', dom).replace('{ext}', ext);
  }
  for (const [rx, k] of PATTERNS) {
    if (rx.test(libelle)) return FR[k].replace('{dom}', dom).replace('{ext}', ext);
  }
  if (/ou match nul|or draw|of gelijkspel|ou empate|o pareggio|oder Unentschieden|o empate/i.test(libelle)) {
    if (libelle.includes(dom)) return `${dom} ou match nul`;
    if (libelle.includes(ext)) return `${ext} ou match nul`;
  }
  return libelle;
}

// Priorite d'affichage et logo par competition. Plus le rang est bas, plus la
// ligue apparait haut. Les logos API-Football suivent un schema fixe.
const logo = (id) => `https://media.api-sports.io/football/leagues/${id}.png`;
const COMP = {
  'Ligue des Champions':      { rang: 1,  id: 2 },
  'Ligue Europa':             { rang: 2,  id: 3 },
  'Ligue Conférence':         { rang: 3,  id: 848 },
  'Premier League':           { rang: 10, id: 39 },
  'La Liga':                  { rang: 11, id: 140 },
  'Serie A':                  { rang: 12, id: 135 },
  'Bundesliga':               { rang: 13, id: 78 },
  'Ligue 1':                  { rang: 14, id: 61 },
  'Eredivisie':               { rang: 15, id: 88 },
  'Liga Portugal':            { rang: 16, id: 94 },
  'Jupiler Pro League':       { rang: 17, id: 144 },
  'Super League':             { rang: 18, id: 207 },
  'Scottish Premiership':     { rang: 19, id: 179 },
  'Brasileirão Série A':      { rang: 20, id: 71 },
  'Liga Profesional':         { rang: 21, id: 128 },
  'Major League Soccer':      { rang: 22, id: 253 },
  'Primera División':         { rang: 23, id: 265 },
  'Championship':             { rang: 30, id: 40 },
  'Ligue 2':                  { rang: 31, id: 62 },
  '2. Bundesliga':            { rang: 32, id: 79 },
  'Serie B':                  { rang: 33, id: 136 },
  'Segunda División':         { rang: 34, id: 141 },
  'Liga Portugal 2':          { rang: 35, id: 95 },
  'Eerste Divisie':           { rang: 36, id: 89 },
  'Brasileirão Série B':      { rang: 37, id: 72 },
  'Bundesliga (Autriche)':    { rang: 38, id: 218 },
  'Challenge League':         { rang: 39, id: 208 },
  'League One':               { rang: 40, id: 41 },
  'League Two':               { rang: 41, id: 42 },
  'Liga MX':                  { rang: 42, id: 262 },
  'LigaPro':                  { rang: 43, id: 242 },
  'Primera A':                { rang: 44, id: 239 },
  'Liga 1':                   { rang: 45, id: 281 },
};

// ── Pronostics CALCULES, sans article ────────────────────────────────────────
// Les articles ne couvrent que la Ligue 1/Ligue 2 (pause hors-fr, et ~15
// appels API par article). Pour les autres grands championnats, l'ecran
// Pronostics se nourrit directement de `predictions` API-Football (deja en
// cache Redis : la chauffe les tire pour les matchs a venir) et des cotes de
// l'agregat du calendrier. Zero article a ecrire (demande utilisateur du
// 12/09/2026), et une ligne sans `slug` s'affiche sans lien — le client sait.
const SITE = 'https://ninjascores.com';
const NOM_PAR_ID = Object.fromEntries(Object.entries(COMP).map(([nom, c]) => [c.id, nom]));
async function proxy(chemin) {
  try {
    const r = await fetch(SITE + '/api/foot/?path=' + chemin, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}
async function enFile(taches, largeur) {
  const sortie = new Array(taches.length); let i = 0;
  const fil = async () => { while (i < taches.length) { const k = i++; sortie[k] = await taches[k](); } };
  await Promise.all(Array.from({ length: Math.min(largeur, taches.length) || 1 }, fil));
  return sortie;
}
const pct = (v) => parseInt(String(v || '0'), 10) || 0;
const arrondi = (x) => Math.round(x * 100) / 100;

async function pronosCalcules(dejaFixtures) {
  const jour = new Date().toISOString().slice(0, 10);
  const [cal, cj] = await Promise.all([proxy('fixtures&date=' + jour), proxy('cotes-jour&date=' + jour)]);
  const cotes = (cj && cj.matchs) || {};
  const candidats = ((cal && cal.response) || [])
    .filter((f) => NOM_PAR_ID[f.league.id] && f.fixture.status.short === 'NS' && !dejaFixtures.has(f.fixture.id))
    .sort((a, b) => (COMP[NOM_PAR_ID[a.league.id]].rang - COMP[NOM_PAR_ID[b.league.id]].rang)
      || String(a.fixture.date).localeCompare(String(b.fixture.date)))
    .slice(0, 40);
  const preds = await enFile(candidats.map((f) => () => proxy('predictions&fixture=' + f.fixture.id)), 4);
  const sortie = [];
  candidats.forEach((f, i) => {
    const r = preds[i] && preds[i].response && preds[i].response[0];
    const p = r && r.predictions;
    if (!p || !p.winner || !p.percent) return;
    const dom = f.teams.home, ext = f.teams.away;
    const pc = { home: pct(p.percent.home), draw: pct(p.percent.draw), away: pct(p.percent.away) };
    const coteDom = pc.home >= pc.away;                  // camp favori
    const nomFav = coteDom ? dom.name : ext.name;
    const lot = (cotes[f.fixture.id] || []).find((b) => b && b.c1 && b.c2) || null;
    const c1 = lot ? parseFloat(lot.c1) : 0, cN = lot ? parseFloat(lot.cN) : 0, c2 = lot ? parseFloat(lot.c2) : 0;
    let pick, prob, odds = null;
    if (p.win_or_draw) {
      pick = nomFav + ' ou match nul';
      prob = (coteDom ? pc.home : pc.away) + pc.draw;
      const cf = coteDom ? c1 : c2;
      if (cf && cN) odds = arrondi(1 / (1 / cf + 1 / cN));
    } else {
      pick = nomFav + ' gagne';
      prob = coteDom ? pc.home : pc.away;
      odds = (coteDom ? c1 : c2) || null;
    }
    if (!prob) return;
    sortie.push({
      ligue: NOM_PAR_ID[f.league.id],
      pick: {
        id: 'calc-' + f.fixture.id,
        fixtureId: f.fixture.id,
        match: dom.name + ' - ' + ext.name,
        pick, odds, prob,
        score: prob >= 70 ? 5 : prob >= 60 ? 4 : prob >= 50 ? 3 : 2,
        slug: null,
        heure: f.fixture.date,
        langue: 'fr',
        equipes: [dom, ext].map((x) => ({ id: x.id, nom: x.name, logo: x.logo })),
      },
    });
  });
  return sortie;
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { res.status(200).json({ foot: [] }); return; }

  try {
    const depuis = new Date(Date.now() - 4 * 3600 * 1000).toISOString();
    const r = await fetch(
      `${url}/rest/v1/articles?coup_envoi=gte.${depuis}&select=slug,fixture_id,competition,coup_envoi,langue,payload&order=coup_envoi.asc&limit=200`,
      { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    if (!r.ok) throw new Error('Supabase ' + r.status);
    const lignes = await r.json();

    const par = new Map();
    lignes.forEach((a) => {
      const p = a.payload?.entete?.pronostic;
      const dom = a.payload?.entete?.domicile?.nom;
      const ext = a.payload?.entete?.exterieur?.nom;
      if (!p || !dom || !ext) return;
      const comp = a.competition || 'Football';
      if (!par.has(comp)) par.set(comp, []);
      par.get(comp).push({
        id: a.slug,
        match: `${dom} - ${ext}`,
        pick: traduire(p.libelle, p.cle, dom, ext),
        odds: p.cote,
        score: Math.max(1, Math.round(p.fiabilite / 2)),
        prob: p.fiabilite * 10,
        slug: a.slug,
        heure: a.coup_envoi,
        langue: a.langue || 'fr',
        equipes: [a.payload?.entete?.domicile, a.payload?.entete?.exterieur]
          .filter((x) => x && x.id).map((x) => ({ id: x.id, nom: x.nom, logo: x.logo })),
      });
    });

    // Complement calcule pour les grands championnats sans article.
    const deja = new Set(lignes.map((a) => a.fixture_id).filter(Boolean));
    try {
      (await pronosCalcules(deja)).forEach(({ ligue, pick }) => {
        if (!par.has(ligue)) par.set(ligue, []);
        par.get(ligue).push(pick);
      });
    } catch (e) { console.warn('[pronostics-jour] calcules :', e.message); }

    const foot = [...par.entries()]
      .map(([league, picks]) => {
        const c = COMP[league];
        return {
          lid: league.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          league,
          emoji: '⚽',
          compLogo: c ? logo(c.id) : null,
          rang: c ? c.rang : 99,
          picks,
        };
      })
      .sort((a, b) => a.rang - b.rang);

    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    res.status(200).json({ foot });
  } catch (err) {
    console.error('[pronostics-jour]', err.message);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ foot: [] });
  }
}
