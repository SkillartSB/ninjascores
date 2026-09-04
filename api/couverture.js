// Audit de couverture des données — /api/couverture/
//
// POURQUOI : jusqu'au 04/09 le système de détection des trous de données,
// c'était l'utilisateur. Il ouvrait l'app, tombait sur un match sans cotes,
// et le signalait. Réactif, coûteux, et on ne voyait que ce qu'il regardait.
//
// Cet endpoint répond tout seul à « est-ce que la donnée est complète ? ».
// Pour chaque match du jour il lit DIRECTEMENT les clés du cache Redis que
// le proxy écrit, et classe chaque bloc en trois états :
//
//   present  : la clé est en cache et contient de la donnée
//   vide     : la clé est en cache mais API-Football n'a rien pour ce match
//              (Kenyan Premier League sans cotes, équipes qui ne se sont
//              jamais rencontrées…) — c'est NORMAL, on n'alerte jamais dessus
//   manquant : la clé n'est pas en cache du tout — soit le préchauffage n'y
//              est pas arrivé, soit l'appel a échoué. C'EST LE SEUL ÉTAT QUI
//              COMPTE, et le seul sur lequel on alerte.
//
// La distinction vide/manquant est tout l'intérêt de l'endpoint : sans elle
// on alerterait en permanence sur des ligues qui n'auront jamais de cotes.
//
// AUCUN appel amont : on ne lit que Redis. L'audit ne coûte pas de quota et
// peut tourner aussi souvent qu'on veut.
//
// AUCUN import depuis lib/*.mjs (règle du projet : un api/*.js qui le fait
// plante au chargement).

import { gunzipSync } from 'node:zlib';

const SITE = 'https://ninjascores.com';
const GZ_PREFIXE = 'gz1:';

// Mêmes ligues prioritaires que api/prechauffe.js. C'est sur celles-là, et
// uniquement celles-là, qu'un trou est une anomalie : ce sont les matchs que
// nos utilisateurs ouvrent réellement.
const PRIORITAIRES = new Set([
  1, 4, 9, 6, 2, 3, 848, 531, 15,
  39, 140, 135, 78, 61,
  94, 88, 203, 144, 179,
  71, 128, 253, 262, 307, 98, 292,
  13, 11, 12, 20, 17, 16,
  5, 7, 22, 29, 30, 31, 32, 33, 34, 37, 960, 36,
  40, 62, 136, 79, 141,
]);
const FINIS = new Set(['FT', 'AET', 'PEN', 'CANC', 'ABD', 'PST', 'WO']);

// MEME fenetre que api/prechauffe.js (FENETRE_MS). On ne juge que les matchs
// que la chauffe etait censee avoir traites : un match a 21 h vu a 10 h du
// matin n'a aucune raison d'etre en cache, le signaler ferait hurler
// l'alerte toute la journee pour rien.
const FENETRE_MS = 3 * 3600 * 1000;
// Marge : on laisse un cycle de cron (30 min) au prechauffage pour faire son
// travail avant de considerer qu'un match aurait du etre couvert.
const GRACE_MS = 30 * 60 * 1000;
// MEME seuil d'urgence que api/prechauffe.js. La chauffe ne traite la forme
// des equipes (3 appels chacune, le poste le plus lourd) que pour les matchs
// imminents ; l'audit ne doit donc juger ces deux blocs QUE sur ces matchs-la.
// Sans cet alignement il reproche a la chauffe un travail qu'elle ne fait
// volontairement pas, et l'alerte se declenche pour rien.
const URGENT_MS = 2.5 * 3600 * 1000;

// Seuil d'alerte : sous ce taux de complétude sur les ligues prioritaires,
// l'endpoint répond sante:"degrade" et le workflow GitHub échoue (donc mail).
const SEUIL_ALERTE = 0.85;

function decompresser(stocke) {
  if (typeof stocke !== 'string' || !stocke.startsWith(GZ_PREFIXE)) return stocke;
  try { return gunzipSync(Buffer.from(stocke.slice(GZ_PREFIXE.length), 'base64')).toString('utf8'); }
  catch (e) { return null; }
}

async function redisPipeline(commandes) {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(url + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(commandes),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// Reconstruit EXACTEMENT la clé que le proxy écrit : 'foot:' + path + '?' +
// querystring triée. Toute divergence ici ferait croire à un trou permanent.
function cle(path, params) {
  const qs = new URLSearchParams(params);
  qs.sort();
  return 'foot:' + path + '?' + qs.toString();
}

// present | vide | manquant, à partir de la valeur brute lue dans Redis.
function etat(valeurBrute) {
  if (valeurBrute == null) return 'manquant';
  const texte = decompresser(valeurBrute);
  if (texte == null) return 'manquant';
  try {
    const j = JSON.parse(texte);
    const rep = j && j.response;
    if (Array.isArray(rep)) return rep.length ? 'present' : 'vide';
    return rep ? 'present' : 'vide';
  } catch (e) { return 'manquant'; }
}

function jourUTC() { return new Date().toISOString().slice(0, 10); }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    // Le calendrier passe par le proxy : s'il est en cache, l'audit ne coûte
    // rien du tout. S'il ne l'est pas, c'est UN appel amont — acceptable.
    //
    // Trois tentatives espacées : depuis que le coupe-circuit quota distingue
    // la limite MINUTE (blocage 8 s) du quota JOUR, un 502 isolé ne veut plus
    // rien dire — il se résorbe tout seul. Abandonner au premier échec
    // ferait rapporter « inconnu » pour un hoquet de huit secondes, et le
    // workflow crierait au loup. Constaté le 04/09 : essai 1 en 502, essai 2
    // en 200 dix secondes plus tard.
    let tous = null;
    for (let essai = 0; essai < 3 && tous === null; essai++) {
      if (essai) await new Promise((r) => setTimeout(r, 6000));
      try {
        const rCal = await fetch(SITE + '/api/foot/?path=fixtures&date=' + jourUTC(),
                                 { signal: AbortSignal.timeout(20000) });
        if (rCal.ok) tous = ((await rCal.json()).response) || [];
      } catch (e) { /* on retente */ }
    }
    if (tous === null) {
      // Trois échecs d'affilée sur 12 s : là c'est une vraie panne, pas une
      // rafale. On répond « inconnu » et non « degrade » : on ne sait pas
      // dire si la donnée est complète, ce n'est pas la même chose que
      // savoir qu'elle ne l'est pas.
      return res.status(503).json({ sante: 'inconnu', raison: 'calendrier indisponible apres 3 tentatives' });
    }

    // On n'audite que ce que le préchauffage est censé avoir couvert :
    //  - ligues prioritaires (auditer le Bhoutan produirait des « manquant »
    //    légitimes qui noieraient le signal) ;
    //  - matchs non terminés ;
    //  - dont le coup d'envoi est DANS la fenêtre de chauffe depuis au moins
    //    un cycle de cron, sinon on reproche au préchauffage un travail qu'il
    //    n'avait pas encore à faire.
    const maintenant = Date.now();
    const cibles = tous.filter((f) => {
      if (FINIS.has(f.fixture.status.short)) return false;
      if (!PRIORITAIRES.has(f.league.id)) return false;
      const restant = new Date(f.fixture.date).getTime() - maintenant;
      return restant < FENETRE_MS - GRACE_MS;
    });

    if (!cibles.length) {
      return res.status(200).json({ sante: 'ok', jour: jourUTC(), matchs: 0,
                                    note: 'aucun match prioritaire dans la fenêtre de chauffe' });
    }

    // Un GET par bloc et par match, en un seul pipeline Redis.
    const blocs = [];
    for (const f of cibles) {
      const fid = f.fixture.id;
      const a = f.teams.home.id, b = f.teams.away.id;
      blocs.push(
        { fid, nom: f.teams.home.name + ' - ' + f.teams.away.name, ligue: f.league.name,
          coupEnvoi: f.fixture.date,
          urgent: new Date(f.fixture.date).getTime() - maintenant < URGENT_MS,
          cles: {
            cotes: cle('odds', { fixture: fid }),
            compos: cle('fixtures/lineups', { fixture: fid }),
            pronostics: cle('predictions', { fixture: fid }),
            tat: cle('fixtures/headtohead', { h2h: a + '-' + b, last: '20' }),
            formeDom: cle('fixtures', { team: a, last: '10' }),
            formeExt: cle('fixtures', { team: b, last: '10' }),
          } },
      );
    }

    const toutesCles = [];
    for (const b of blocs) for (const k of Object.keys(b.cles)) toutesCles.push(b.cles[k]);
    // MGET par paquets : une seule commande Redis pour 200 clés, mais on
    // évite les corps de requête démesurés un soir de grosse affiche.
    const valeurs = {};
    for (let i = 0; i < toutesCles.length; i += 200) {
      const lot = toutesCles.slice(i, i + 200);
      const rep = await redisPipeline([['MGET', ...lot]]);
      const arr = (rep && rep[0] && rep[0].result) || [];
      lot.forEach((k, j) => { valeurs[k] = arr[j]; });
    }

    // Deux familles de blocs, jugees sur des perimetres differents :
    //  - PAR MATCH : chauffes sur toute la fenetre (4 h)
    //  - PAR EQUIPE : chauffes seulement pour les matchs imminents (2 h 30)
    const CHAMPS_MATCH = ['cotes', 'compos', 'pronostics', 'tat'];
    const CHAMPS_EQUIPE = ['formeDom', 'formeExt'];
    const totaux = {};
    CHAMPS_MATCH.concat(CHAMPS_EQUIPE).forEach((c) => {
      totaux[c] = { present: 0, vide: 0, manquant: 0, horsPerimetre: 0 };
    });

    let attendus = 0, manquantsTotal = 0;
    const incomplets = [];
    for (const b of blocs) {
      const champs = b.urgent ? CHAMPS_MATCH.concat(CHAMPS_EQUIPE) : CHAMPS_MATCH;
      if (!b.urgent) CHAMPS_EQUIPE.forEach((c) => { totaux[c].horsPerimetre++; });
      const manque = [];
      for (const c of champs) {
        const e = etat(valeurs[b.cles[c]]);
        totaux[c][e]++;
        attendus++;
        if (e === 'manquant') { manquantsTotal++; manque.push(c); }
      }
      if (manque.length) {
        incomplets.push({ fixture: b.fid, match: b.nom, ligue: b.ligue,
                          coupEnvoi: b.coupEnvoi, urgent: b.urgent, manque });
      }
    }

    // Taux de complétude : sur l'ensemble des blocs ATTENDUS (donc hors blocs
    // par équipe des matchs non imminents), la part qui n'est PAS manquante.
    // Un bloc « vide » compte comme couvert : on a bien interrogé l'API, elle
    // n'avait rien, il n'y a rien à corriger de notre côté.
    const complet = attendus ? (attendus - manquantsTotal) / attendus : 1;

    const sante = complet >= SEUIL_ALERTE ? 'ok' : 'degrade';

    res.status(200).json({
      sante,
      jour: jourUTC(),
      matchs: blocs.length,
      completude: Math.round(complet * 1000) / 10 + '%',
      seuil: SEUIL_ALERTE * 100 + '%',
      parBloc: totaux,
      // Plafonné : un soir de panne totale, la liste exhaustive serait
      // illisible et le compteur suffit à dire l'ampleur.
      matchsIncomplets: incomplets.length,
      exemples: incomplets.slice(0, 20),
    });
  } catch (e) {
    res.status(500).json({ sante: 'inconnu', erreur: e.message });
  }
}
