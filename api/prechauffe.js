// Préchauffage du cache des pages match — /api/prechauffe/
//
// POURQUOI : la richesse d'une page match (cotes, confrontations, forme,
// compos, blessés) dépendait du hasard — premier visiteur ou robot à payer
// l'appel amont, quota du moment, TTL expirée ou non. Résultat constaté le
// 30/08 : des pages inégales d'un match à l'autre (Naples complet, Augsburg
// squelettique). Ce cron chauffe le cache Redis du proxy pour les matchs des
// compétitions couvertes qui démarrent bientôt : quand un utilisateur ouvre
// la page, tous les blocs sont déjà là.
//
// IDEMPOTENT PAR CONSTRUCTION : les appels passent par /api/foot/, donc une
// clé encore en cache est servie par Redis et ne coûte AUCUN appel amont.
// Relancer toutes les 30 min ne repaye que ce qui a expiré (cotes 30 min,
// forme 1 h, confrontations 24 h). Les compos n'existent côté API qu'à
// l'approche du coup d'envoi — c'est précisément pour les attraper qu'on
// repasse régulièrement.
//
// Déclenché par GitHub Actions (.github/workflows/prechauffe.yml), comme
// capture-mt et archive-matches.
//
// AUCUN import depuis lib/*.mjs : un api/*.js qui le fait plante au
// chargement (FUNCTION_INVOCATION_FAILED — vu deux fois, seo.js en août
// puis les compteurs le 29/08). Tout est inline.

const SITE = 'https://ninjascores.com';

// TOUTES les ligues sont chauffées (demande utilisateur du 30/08 : « toutes
// les ligues où API-Football a de la donnée », pas seulement les grandes).
// La liste ci-dessous ne sert plus qu'à PRIORISER : grandes compétitions
// d'abord, pour que le budget temps, s'il est dépassé un soir de grosse
// affiche, tronque les ligues exotiques et jamais la Liga.
// (RANG_COMPET de assets/inline/s6.js — copie assumée, importer un fichier
// navigateur d'ici est impossible.)
const PRIORITAIRES = new Set([
  2, 3, 848, 531, 15, 13, 11, 12, 20, 17, 16, 1, 4, 6, 9, 7, 5,
  29, 30, 31, 32, 33, 34, 37, 960, 36, 22, 39, 140, 135, 78, 61,
  94, 88, 203, 144, 71, 128, 262, 253, 307, 98, 292, 179, 40, 62, 136, 79, 141,
]);
const FINIS = new Set(['FT', 'AET', 'PEN', 'CANC', 'ABD', 'PST', 'WO']);

// Fenêtre de chauffe : matchs qui commencent d'ici 2 h 30 (ou déjà en cours,
// pour les compos officielles qui tombent après le coup d'envoi).
const FENETRE_MS = 2.5 * 3600 * 1000;
const BUDGET_MS = 280000;         // maxDuration 300 s, marge de sécurité
const PAUSE_MS = 250;             // 4 appels/s — loin de la limite minute amont

function jourUTC() { return new Date().toISOString().slice(0, 10); }

async function via(chemin) {
  // Barre finale obligatoire côté /api/foot/ (redirection 308 sinon).
  try {
    const r = await fetch(SITE + '/api/foot/?path=' + chemin, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const t0 = Date.now();
  const resume = { cibles: 0, appels: 0, sansCotes: [], compos: 0, tronque: false };

  try {
    const cal = await via('fixtures&date=' + jourUTC());
    const tous = (cal && cal.response) || [];
    const maintenant = Date.now();
    const cibles = tous.filter((f) => {
      if (FINIS.has(f.fixture.status.short)) return false;
      const debut = new Date(f.fixture.date).getTime();
      return debut - maintenant < FENETRE_MS;   // inclut les matchs en cours
    });
    // Grandes competitions d'abord, puis coup d'envoi le plus proche.
    cibles.sort((x, y) => {
      const px = PRIORITAIRES.has(x.league.id) ? 0 : 1;
      const py = PRIORITAIRES.has(y.league.id) ? 0 : 1;
      if (px !== py) return px - py;
      return new Date(x.fixture.date) - new Date(y.fixture.date);
    });
    resume.cibles = cibles.length;

    const equipes = new Set();
    for (const f of cibles) {
      if (Date.now() - t0 > BUDGET_MS) { resume.tronque = true; break; }
      const fid = f.fixture.id;
      const a = f.teams.home.id, b = f.teams.away.id;
      equipes.add(a); equipes.add(b);

      const cotes = await via('odds&fixture=' + fid); await dormir(PAUSE_MS);
      const compo = await via('fixtures/lineups&fixture=' + fid); await dormir(PAUSE_MS);
      await via('injuries&fixture=' + fid); await dormir(PAUSE_MS);
      await via('fixtures/headtohead&h2h=' + a + '-' + b + '&last=20'); await dormir(PAUSE_MS);
      resume.appels += 4;

      if (!(cotes && cotes.response && cotes.response.length)) {
        // Compte complet mais exemples plafonnes : sur 900 matchs toutes
        // ligues, la liste exhaustive rendrait la reponse illisible.
        resume.sansCotesTotal = (resume.sansCotesTotal || 0) + 1;
        if (resume.sansCotes.length < 15) resume.sansCotes.push(f.teams.home.name + ' - ' + f.teams.away.name);
      }
      if (compo && compo.response && compo.response.length) resume.compos++;
    }

    for (const t of equipes) {
      if (Date.now() - t0 > BUDGET_MS) { resume.tronque = true; break; }
      await via('fixtures&team=' + t + '&last=10'); await dormir(PAUSE_MS);
      resume.appels++;
    }

    res.status(200).json(resume);
  } catch (e) {
    res.status(500).json({ error: e.message, resume });
  }
}
