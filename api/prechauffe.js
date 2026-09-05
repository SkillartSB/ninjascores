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
// Copie du RANG_COMPET de assets/inline/s6.js (importer un fichier navigateur
// d'ici est impossible). Un rang plus bas = chauffe plus tot a urgence egale.
// Refait le 04/09 en meme temps que celui du calendrier : les coupes
// continentales hors Europe passaient avant les cinq grands championnats.
const RANG = {
  1: 0, 4: 1, 9: 2, 6: 3,
  2: 5, 3: 6, 848: 7, 531: 8, 15: 9,
  39: 10, 140: 11, 135: 12, 78: 13, 61: 14,
  94: 15, 88: 16, 203: 17, 144: 18, 179: 19,
  71: 23, 128: 24, 253: 25, 262: 26, 307: 27, 98: 28, 292: 29,
  13: 32, 11: 33, 12: 34, 20: 35, 17: 36, 16: 37,
  5: 38, 7: 39, 22: 42,
  29: 40, 30: 40, 31: 40, 32: 40, 33: 40, 34: 40, 37: 40, 960: 41, 36: 41,
  40: 46, 62: 47, 136: 48, 79: 49, 141: 50,
};
const RANG_INCONNU = 90;
const rang = (id) => (RANG[id] != null ? RANG[id] : RANG_INCONNU);
// « Prioritaire » = present au bareme. Sert a l'audit de couverture, qui ne
// juge que ces ligues-la.
const PRIORITAIRES = new Set(Object.keys(RANG).map(Number));
const FINIS = new Set(['FT', 'AET', 'PEN', 'CANC', 'ABD', 'PST', 'WO']);

// Fenêtre de chauffe : matchs qui commencent d'ici 3 h (ou déjà en cours,
// pour les compos officielles qui tombent après le coup d'envoi).
// Historique : 2 h 30 à l'origine, élargie à 4 h le 04/09 après la
// parallélisation — ce qui a fait passer les cibles de 154 à 342 et remis la
// chauffe en troncature. 3 h est le compromis : assez large pour qu'un
// visiteur de fin d'après-midi trouve une fiche pleine, assez étroit pour que
// la chauffe finisse son travail à la cadence sûre de 6,7 appels/s.
const FENETRE_MS = 3 * 3600 * 1000;
// Dans cette fenetre, ce qui demarre dans moins de 2 h 30 est URGENT : c'est
// ce que les visiteurs ouvrent maintenant. Le reste (2 h 30 -> 4 h) est du
// bonus, rattrape au cron suivant si le budget manque.
const URGENT_MS = 2.5 * 3600 * 1000;
const BUDGET_MS = 700000;         // maxDuration 800 s, marge de sécurité
// Les appels d'un meme match sont independants : on les tire EN PARALLELE
// puis on marque une pause. En sequentiel pur (code d'avant le 04/09) chaque
// match coutait ~1,8 s : 121 matchs ne rentraient pas dans le budget et la
// chauffe tronquait au milieu de la Ligue 1 — PSG-Monaco chauffe,
// Lyon-Auxerre non.
//
// CADENCE : 5 appels par vague / 750 ms ≈ 6,7 appels/s, soit 400/min, sous
// la limite minute amont (~450/min) avec de la marge pour le trafic
// concurrent. La valeur precedente (400 ms) datait d'une vague de 4 appels ;
// en ajoutant `predictions` sans reajuster on est passe a 12,5 appels/s, et
// la chauffe du 04/09 a encaisse 893 echecs sur 3 311 appels (27 %). Le
// rattrapage les a presque tous repris (19 persistants), mais taper le mur
// pour reparer derriere gaspille du quota et du temps.
const PAUSE_MS = 750;

function jourUTC() { return new Date().toISOString().slice(0, 10); }

async function via(chemin, rejeu) {
  // Barre finale obligatoire côté /api/foot/ (redirection 308 sinon).
  try {
    // _prechauffe=1 : (a) le proxy repond no-store, donc chaque passage atteint
    // la fonction au lieu d'etre servi par le CDN ; (b) une cle a moins de
    // 30 min de vie est rafraichie en amont au lieu d'etre servie telle
    // quelle. Sans ca la chauffe ne prolongeait jamais rien (voir foot.js,
    // REFRESH_AHEAD_S). Le proxy ne transmet pas ce parametre a API-Football.
    const r = await fetch(SITE + '/api/foot/?path=' + chemin + '&_prechauffe=1', { signal: AbortSignal.timeout(25000) });
    if (!r.ok) { if (!rejeu) echecs.push(chemin); return null; }
    // 200 mais ecriture Redis ratee (X-Cache-Write: failed) : la donnee est
    // dans la reponse, pas dans le cache. Pour la chauffe c'est un echec —
    // on la rejoue en seconde passe, sinon l'audit la trouve « manquante »
    // alors que le rapport de chauffe annonce 0 % d'echec (05/09).
    if (r.headers.get('x-cache-write') === 'failed') { if (!rejeu) echecs.push(chemin); resume.ecrituresRatees = (resume.ecrituresRatees || 0) + 1; }
    return await r.json();
  } catch (e) { if (!rejeu) echecs.push(chemin); return null; }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
// Rapport du run courant, hisse au module pour que via() puisse y compter
// les ecritures Redis ratees. Reinitialise a chaque invocation du handler.
let resume = {};

// Chemins dont l'appel a rendu null (502 amont, timeout, limite minute). Ils
// sont rejoues en fin de run — voir « seconde passe » plus bas.
let echecs = [];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const t0 = Date.now();
  // Variable de module : une instance serverless reutilisee garderait les
  // echecs du run precedent et rejouerait des appels deja reussis.
  echecs = [];
  resume = { cibles: 0, appels: 0, sansCotes: [], compos: 0, tronque: false };

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
      // A urgence egale, les grandes competitions d'abord — bareme fin, pas
      // un simple booleen prioritaire/non : la Premier League doit passer
      // avant la Ligue des Champions de la CAF.
      const rx = rang(x.league.id), ry = rang(y.league.id);
      if (rx !== ry) return rx - ry;
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
        // last=20 : c'est la cle que LIT la fiche match (s6.js NS_FORME, defaut
        // n=20). Jusqu'au 05/09 la chauffe ecrivait last=10 — une cle que le
        // client ne demandait jamais. Resultat : forme jamais chauffee, 2 appels
        // amont a chaque ouverture de fiche, et 'Forme recente' vide pendant
        // les rafales (Bournemouth absent sur Newcastle-Bournemouth, 05/09).
        via('fixtures&team=' + t + '&last=20'),
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
