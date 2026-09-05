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

// PERIMETRE : les ligues du bareme ci-dessous, et elles seules (decision du
// 05/09 sur la matrice quota : le « tier C » — toutes les autres ligues —
// est servi a la demande, jamais pousse). Du 30/08 au 05/09 la chauffe
// traitait TOUTES les ligues : un samedi, 821 a 1 333 matchs par run, le
// budget de 700 s epuise a chaque fois, la boucle « forme des equipes »
// jamais atteinte, et ~1 500 appels par demi-heure pour du Kenya que
// personne n'ouvre. L'audit /api/couverture/ juge exactement ce perimetre.
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
// « Prioritaire » = present au bareme. C'est le filtre des cibles ET le
// perimetre de l'audit de couverture.
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
// 900 ms depuis le 05/09 : le refresh-ahead (10:09) a transforme les hits Redis
// de la chauffe en appels amont REELS. A 750 ms, 5 appels/vague = 400/min vers
// API-Football, plus le trafic de fond : on depassait les ~450/min et la chauffe
// s'infligeait un flux de 502 a chaque passage (logs Vercel 05/09, 11:01-11:02).
// 900 ms = 333/min, ~120/min de marge pour les visiteurs.
const PAUSE_MS = 900;
// Backoff adaptatif : apres un echec (502, timeout, ecriture ratee), la vague
// suivante attend 3 s au lieu de 900 ms — le temps que la fenetre minute d'API-
// Football retombe. Sans ca une rafale de 502 s'auto-entretient.
const PAUSE_APRES_ECHEC_MS = 3000;
const FENETRE_ECHEC_MS = 8000;
let dernierEchecMs = 0;
async function respirer() {
  await dormir(Date.now() - dernierEchecMs < FENETRE_ECHEC_MS ? PAUSE_APRES_ECHEC_MS : PAUSE_MS);
}

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
    if (!r.ok) { dernierEchecMs = Date.now(); if (!rejeu) echecs.push(chemin); return null; }
    // 200 mais ecriture Redis ratee (X-Cache-Write: failed) : la donnee est
    // dans la reponse, pas dans le cache. Pour la chauffe c'est un echec —
    // on la rejoue en seconde passe, sinon l'audit la trouve « manquante »
    // alors que le rapport de chauffe annonce 0 % d'echec (05/09).
    if (r.headers.get('x-cache-write') === 'failed') { dernierEchecMs = Date.now(); if (!rejeu) echecs.push(chemin); resume.ecrituresRatees = (resume.ecrituresRatees || 0) + 1; }
    return await r.json();
  } catch (e) { dernierEchecMs = Date.now(); if (!rejeu) echecs.push(chemin); return null; }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Calendrier du jour SANS _prechauffe : servi par Redis/CDN comme pour un
// visiteur. Voir l'appelant pour le pourquoi.
async function calendrier(date) {
  try {
    const r = await fetch(SITE + '/api/foot/?path=fixtures&date=' + date, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}
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
  echecs = []; dernierEchecMs = 0;
  resume = { cibles: 0, appels: 0, sansCotes: [], compos: 0, tronque: false };

  try {
    // L'agrégat des cotes du jour (calendrier client, TTL 900 s) : le chauffer
    // ici garantit que le premier visiteur du quart d'heure ne paie jamais
    // l'assemblage complet.
    await via('cotes-jour&date=' + jourUTC());
    // Le calendrier est la colonne vertebrale du run : s'il manque, il n'y a
    // AUCUNE cible et le run se termine en 15 s sans rien chauffer (crons de
    // 12:00 et 13:00 le 05/09, un seul 502 a chaque fois). Donc : pas de mode
    // chauffe pour lui (TTL 300 s < seuil refresh-ahead, chaque passage
    // repartait en amont chercher 1,5 Mo pour rien — la clientele le
    // rafraichit deja toutes les 5 min), et trois tentatives espacees.
    let cal = null;
    for (let essai = 0; essai < 3 && !(cal && cal.response); essai++) {
      if (essai) await dormir(4000);
      cal = await calendrier(jourUTC());
    }
    if (!(cal && cal.response)) resume.calendrierIndisponible = true;
    // cotes-jour peut declencher ~25 appels amont d'un coup (agregat non cache).
    // Enchainer aussitot les vagues de 5 faisait deborder la minute des les
    // premiers matchs — les grandes ligues, en tete de file. On souffle.
    await dormir(3000);
    const tous = (cal && cal.response) || [];
    const maintenant = Date.now();
    const cibles = tous.filter((f) => {
      if (!PRIORITAIRES.has(f.league.id)) return false;
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
    // Le corps de boucle est une fonction pour etre applique a deux lots
    // (urgents puis autres) avec un rattrapage entre les deux.
    const chaufferMatch = async (f) => {
      const fid = f.fixture.id;
      const a = f.teams.home.id, b = f.teams.away.id;
      // La forme et la compo probable ne sont chauffees que pour les matchs
      // IMMINENTS : 3 appels par equipe, c'est le poste le plus lourd de la
      // chauffe (614 equipes sur une fenetre de 4 h = 1 842 appels, plus de
      // la moitie du total). Les matchs lointains se contentent des blocs
      // par match ; leurs equipes seront chauffees quand ils deviendront
      // urgents.
      const urgent = new Date(f.fixture.date).getTime() - maintenant < URGENT_MS;

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
      await respirer();
      resume.appels += 5;

      if (!(cotes && cotes.response && cotes.response.length)) {
        // Compte complet mais exemples plafonnes : sur 900 matchs toutes
        // ligues, la liste exhaustive rendrait la reponse illisible.
        resume.sansCotesTotal = (resume.sansCotesTotal || 0) + 1;
        if (resume.sansCotes.length < 15) resume.sansCotes.push(f.teams.home.name + ' - ' + f.teams.away.name);
      }
      if (compo && compo.response && compo.response.length) resume.compos++;

      // Forme et compo probable des deux equipes, DANS la foulee du match
      // urgent. Jusqu'au 05/09 c'etait une boucle separee en fin de run,
      // apres tous les matchs : des que le budget tronquait, elle n'etait
      // jamais atteinte — 46 formes manquantes sur 48 a l'audit de 12:14.
      if (urgent) {
        for (const t of [a, b]) {
          if (equipes.has(t)) continue;          // deja chauffee via un autre match
          equipes.add(t);
          await chaufferEquipe(t);
        }
      }
    };

    // 3 appels par equipe. `last=20` : c'est la cle que LIT la fiche match
    // (s6.js NS_FORME, defaut n=20). `last=1` + sa feuille de match : chemin
    // « compo probable » de NS_LINEUP, cles distinctes, a chauffer aussi
    // sinon l'onglet Compo reste au placeholder avant l'heure officielle.
    const chaufferEquipe = async (t) => {
      const [, dernier] = await Promise.all([
        via('fixtures&team=' + t + '&last=20'),
        via('fixtures&team=' + t + '&last=1'),
      ]);
      await respirer();
      const fidDernier = dernier && dernier.response && dernier.response[0] && dernier.response[0].fixture.id;
      if (fidDernier) { await via('fixtures/lineups&fixture=' + fidDernier + '&team=' + t); await respirer(); }
      resume.appels += fidDernier ? 3 : 2;
    };

    // Deux lots. Les URGENTS (< 2 h 30) d'abord, puis un rattrapage immediat de
    // leurs echecs, puis seulement les autres. Avant le 05/09 le rattrapage
    // etait en fin de run, apres le tier C : un samedi a 530 cibles le budget
    // etait mort avant qu'il demarre, et les grandes ligues en tete de file —
    // les premieres a encaisser la rafale de demarrage — restaient vides.
    const urgents = cibles.filter((f) => new Date(f.fixture.date).getTime() - maintenant < URGENT_MS);
    const autres  = cibles.filter((f) => new Date(f.fixture.date).getTime() - maintenant >= URGENT_MS);
    resume.urgents = urgents.length;

    for (const f of urgents) {
      if (Date.now() - t0 > BUDGET_MS) { resume.tronque = true; break; }
      await chaufferMatch(f);
    }
    if (echecs.length && Date.now() - t0 < BUDGET_MS) {
      const aRejouer = echecs.splice(0);        // vide la liste, on la reconstitue
      resume.rattrapageUrgent = { tentes: aRejouer.length, persistants: 0 };
      await dormir(5000);                       // la fenetre minute retombe
      for (const chemin of aRejouer) {
        if (Date.now() - t0 > BUDGET_MS) { resume.tronque = true; break; }
        const r = await via(chemin, true);
        if (r == null) { resume.rattrapageUrgent.persistants++; echecs.push(chemin); }  // 3e chance en fin de run
        await respirer();
        resume.appels++;
      }
    }
    for (const f of autres) {
      if (Date.now() - t0 > BUDGET_MS) { resume.tronque = true; break; }
      await chaufferMatch(f);
    }

    resume.equipes = equipes.size;

    // ── Seconde passe : rattrapage des echecs ────────────────────────────
    // `via()` avale ses erreurs en renvoyant null : une rafale amont, un 502
    // transitoire ou une seconde de limite-minute laissait un trou definitif
    // jusqu'au prochain cron (30 min plus tard). On garde donc la trace des
    // appels qui ont rendu null et on les rejoue une fois, apres une pause
    // plus longue. C'est ce qui manquait pour que la chauffe soit fiable
    // sans qu'un humain vienne constater le trou (demande du 04/09).
    if (echecs.length && Date.now() - t0 < BUDGET_MS) {
      resume.echecs1rePasse = echecs.length;
      await dormir(5000);            // laisse retomber la fenetre minute
      const restants = [];
      for (const chemin of echecs) {
        if (Date.now() - t0 > BUDGET_MS) { resume.tronque = true; break; }
        const r = await via(chemin, true);
        if (r == null) restants.push(chemin);
        await respirer();
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
