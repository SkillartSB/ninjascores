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

// Fenêtre de chauffe : matchs qui commencent d'ici 4 h (ou déjà en cours,
// pour les compos officielles qui tombent après le coup d'envoi). Élargie de
// 2 h 30 à 4 h le 04/09 : depuis la parallélisation la chauffe ne consomme
// plus tout son budget (337 s sur 700 pour 154 matchs), autant couvrir les
// matchs du soir plus tôt pour qu'un visiteur de fin d'après-midi trouve
// déjà une fiche pleine.
const FENETRE_MS = 4 * 3600 * 1000;
// Dans cette fenetre, ce qui demarre dans moins de 2 h 30 est URGENT : c'est
// ce que les visiteurs ouvrent maintenant. Le reste (2 h 30 -> 4 h) est du
// bonus, rattrape au cron suivant si le budget manque.
const URGENT_MS = 2.5 * 3600 * 1000;
const BUDGET_MS = 700000;         // maxDuration 800 s, marge de sécurité
// Les appels d'un meme match sont independants : on les tire EN PARALLELE
// puis on marque une pause. 4 appels par vague / 600 ms ≈ 6,7 appels/s, sous
// la limite minute amont (~450/min = 7,5/s) avec de la marge pour le trafic
// concurrent. En sequentiel pur (ancien code) chaque match coutait ~1,8 s :
// 121 matchs ne rentraient pas dans le budget et la chauffe tronquait au
// milieu de la Ligue 1 — PSG-Monaco chauffe, Lyon-Auxerre non (constat du
// 04/09, l'utilisateur voyait deux matchs de la meme journee inegalement
// remplis).
const PAUSE_MS = 400;

function jourUTC() { return new Date().toISOString().slice(0, 10); }

async function via(chemin, rejeu) {
  // Barre finale obligatoire côté /api/foot/ (redirection 308 sinon).
  try {
    const r = await fetch(SITE + '/api/foot/?path=' + chemin, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) { if (!rejeu) echecs.push(chemin); return null; }
    return await r.json();
  } catch (e) { if (!rejeu) echecs.push(chemin); return null; }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Chemins dont l'appel a rendu null (502 amont, timeout, limite minute). Ils
// sont rejoues en fin de run — voir « seconde passe » plus bas.
let echecs = [];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const t0 = Date.now();
  // Variable de module : une instance serverless reutilisee garderait les
  // echecs du run precedent et rejouerait des appels deja reussis.
  echecs = [];
  const resume = { cibles: 0, appels: 0, sansCotes: [], compos: 0, tronque: false };

  try {
    // L'agrégat des cotes du jour (calendrier client, TTL 900 s) : le chauffer
    // ici garantit que le premier visiteur du quart d'heure ne paie jamais
    // l'assemblage complet.
    await via('cotes-jour&date=' + jourUTC());
    const cal = await via('fixtures&date=' + jourUTC());
    const tous = (cal && cal.response) || [];
    const maintenant = Date.now();
    const cibles = tous.filter((f) => {
      if (FINIS.has(f.fixture.status.short)) return false;
      const debut = new Date(f.fixture.date).getTime();
      return debut - maintenant < FENETRE_MS;   // inclut les matchs en cours
    });
    // Tri en deux etages. L'URGENCE prime sur la taille de la competition :
    // l'ancien tri mettait les grandes ligues en tete toutes heures
    // confondues, donc un match de Ligue 1 a 21 h passait avant un match de
    // CAF a 15 h — alors que c'est celui de 15 h que les visiteurs ouvrent
    // maintenant. Quand la chauffe tronque, elle doit sacrifier les matchs
    // lointains (rattrapes au cron suivant), jamais les imminents.
    cibles.sort((x, y) => {
      const ux = (new Date(x.fixture.date).getTime() - maintenant) < URGENT_MS ? 0 : 1;
      const uy = (new Date(y.fixture.date).getTime() - maintenant) < URGENT_MS ? 0 : 1;
      if (ux !== uy) return ux - uy;
      // A urgence egale, les grandes competitions d'abord.
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
      // La forme et la compo probable ne sont chauffees que pour les matchs
      // IMMINENTS : 3 appels par equipe, c'est le poste le plus lourd de la
      // chauffe (614 equipes sur une fenetre de 4 h = 1 842 appels, plus de
      // la moitie du total). Les matchs lointains se contentent des blocs
      // par match ; leurs equipes seront chauffees quand ils deviendront
      // urgents.
      if (new Date(f.fixture.date).getTime() - maintenant < URGENT_MS) {
        equipes.add(a); equipes.add(b);
      }

      // `predictions` etait ABSENT de cette liste jusqu'au 04/09 : l'onglet
      // Pronostics de la fiche match l'appelle pourtant a chaque ouverture.
      // Resultat, il n'etait jamais en cache — chaque visiteur payait un
      // appel a froid, et au moindre hoquet amont l'onglet tombait en 502.
      // C'est l'audit /api/couverture/ qui l'a revele (100 % de « manquant »
      // sur ce bloc des sa premiere execution).
      const [cotes, compo] = await Promise.all([
        via('odds&fixture=' + fid),
        via('fixtures/lineups&fixture=' + fid),
        via('injuries&fixture=' + fid),
        via('fixtures/headtohead&h2h=' + a + '-' + b + '&last=20'),
        via('predictions&fixture=' + fid),
      ]);
      await dormir(PAUSE_MS);
      resume.appels += 5;

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
      // Chemin « compo probable » de NS_LINEUP : le dernier match joue, puis
      // sa feuille de match. Cles distinctes de last=10 — les chauffer aussi,
      // sinon l'onglet Compo reste au placeholder avant l'heure officielle.
      const [, dernier] = await Promise.all([
        via('fixtures&team=' + t + '&last=10'),
        via('fixtures&team=' + t + '&last=1'),
      ]);
      await dormir(PAUSE_MS);
      const fidDernier = dernier && dernier.response && dernier.response[0] && dernier.response[0].fixture.id;
      if (fidDernier) { await via('fixtures/lineups&fixture=' + fidDernier + '&team=' + t); await dormir(PAUSE_MS); }
      resume.appels += fidDernier ? 3 : 2;
    }

    // ── Seconde passe : rattrapage des echecs ────────────────────────────
    // `via()` avale ses erreurs en renvoyant null : une rafale amont, un 502
    // transitoire ou une seconde de limite-minute laissait un trou definitif
    // jusqu'au prochain cron (30 min plus tard). On garde donc la trace des
    // appels qui ont rendu null et on les rejoue une fois, apres une pause
    // plus longue. C'est ce qui manquait pour que la chauffe soit fiable
    // sans qu'un humain vienne constater le trou (demande du 04/09).
    if (echecs.length && Date.now() - t0 < BUDGET_MS) {
      resume.echecs1rePasse = echecs.length;
      await dormir(2000);            // laisse retomber une eventuelle rafale
      const restants = [];
      for (const chemin of echecs) {
        if (Date.now() - t0 > BUDGET_MS) { resume.tronque = true; break; }
        const r = await via(chemin, true);
        if (r == null) restants.push(chemin);
        await dormir(PAUSE_MS);
        resume.appels++;
      }
      resume.echecsPersistants = restants.length;
      // Plafonne : on veut un signal, pas un dump.
      if (restants.length) resume.exemplesEchecs = restants.slice(0, 10);
    }

    res.status(200).json(resume);
  } catch (e) {
    res.status(500).json({ error: e.message, resume });
  }
}
