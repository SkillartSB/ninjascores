// Scan des lignes de pari du jour — /api/scan/
//
// POURQUOI CETTE ROUTE EXISTE
// Le classement quotidien des paris tournait dans une sandbox Vercel jetable
// (social/carousel-foot/scan.mjs). Deux fragilites l'ont tue le 15/10 : la
// creation de sandbox est tombee sur la limite « fair use » du compte, et la
// session n'avait pas d'acces reseau sortant vers ninjascores.com. Sans
// machine pour executer le script, l'analyse retombait a quelques matchs
// depouilles a la main — soit un quart du programme un soir de Ligue Europa.
//
// Ici le calcul se fait sur nos propres serveurs : une seule requete entrante,
// un classement compact en sortie. Plus de sandbox, plus de dependance a un
// environnement tiers, et la route est ouvrable depuis un telephone.
//
// TOUT PASSE PAR /api/foot/ : on herite du cache Redis, du coupe-circuit de
// quota et du compteur d'appels amont. Une relance dans la demi-heure ne
// coute presque rien (cotes 30 min, forme des equipes 1 h).
//
// AUCUN import depuis lib/*.mjs : un api/*.js qui le fait plante au
// chargement (FUNCTION_INVOCATION_FAILED). Tout est inline, comme prechauffe.
//
// Usage :
//   /api/scan/?dates=2026-10-15&leagues=3
//   /api/scan/?dates=2026-10-15,2026-10-16&hmin=15&cmin=1.45&cmax=3.30
//   /api/scan/?dates=2026-10-15&tri=freq&limit=40

const SITE = 'https://ninjascores.com';

// Bet365. Choisi comme reference parce que c'est le book le plus complet de
// la reponse API-Football et le plus proche du marche ; les cotes affichees
// au canal viennent d'ailleurs, donc ce qu'on cherche ici c'est un ECART,
// pas un prix a recopier.
const BOOKMAKER = 8;

// Identifiants de marche cote API-Football.
const BET_OU = 5;      // Goals Over/Under
const BET_BTTS = 8;    // Both Teams Score

// Fourchette de cotes par defaut. En dessous de 1,45 le gain ne paye pas le
// risque pour un canal ; au dessus de 3,30 on vend du hasard.
const COTE_MIN = 1.45;
const COTE_MAX = 3.30;

// Nombre minimum de matchs observes (domicile + exterieur cumules) sous
// lequel une frequence ne veut rien dire. 10 reste faible — voir l'avertissement
// renvoye dans la reponse.
const N_MIN = 10;

// Cadence : meme raisonnement que prechauffe.js. La limite amont tourne autour
// de 450 appels/min ; 5 appels par vague toutes les 700 ms = ~430/min en pointe
// mais la majorite des appels sont des hits Redis qui ne partent jamais en
// amont. Reglable par ?pause= si on tape le mur.
const VAGUE = 5;
const PAUSE_MS = 700;
const PAUSE_APRES_ECHEC_MS = 3000;
const FENETRE_ECHEC_MS = 8000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Heure de coup d'envoi a Paris, en nombre.
//
// PIEGE PAYE UNE FOIS : toLocaleString('fr-FR', { hour: '2-digit' }) renvoie
// « 20 h ». Number() donnait NaN, donc le filtre horaire ne filtrait RIEN et
// le scan rendait deux journees entieres. D'ou 'en-GB'.
const heureParis = (iso) => Number(new Date(iso).toLocaleString('en-GB', {
  timeZone: 'Europe/Paris', hour: '2-digit', hour12: false,
}));

// Date UTC du match, telle qu'API-Football l'attend dans ?date= pour les cotes.
const jourUTC = (iso) => new Date(iso).toISOString().slice(0, 10);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Le resultat depend de cotes a 30 min de TTL : 5 min de CDN suffisent a
  // absorber les rafraichissements d'un ecran ouvert, sans servir du perime.
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  const q = req.query || {};
  const t0 = Date.now();

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const dates = String(q.dates || q.date || aujourdhui).split(',').map((s) => s.trim()).filter(Boolean);

  // Perimetre de ligues. Vide = tout le programme. Un soir de coupe d'Europe,
  // `leagues=3` ramene le scan a ~40 appels et 7 secondes.
  const ligues = String(q.leagues || '').split(',').map((s) => Number(s.trim())).filter(Boolean);

  const hMin = q.hmin != null ? Number(q.hmin) : null;
  const hMax = q.hmax != null ? Number(q.hmax) : null;
  const coteMin = Number(q.cmin || COTE_MIN);
  const coteMax = Number(q.cmax || COTE_MAX);
  const nMin = Number(q.n || N_MIN);
  const limite = Number(q.limit || 30);
  const tri = String(q.tri || 'edge');
  const pauseMs = Number(q.pause || PAUSE_MS);

  // Exclut par defaut feminines, jeunes, reserves et non-league : ces lignes
  // truste(nt) le haut du classement avec des echantillons ininterpretables,
  // et aucune ne peut etre postee a un canal grand public.
  const filtrerBruit = String(q.bruit || '') !== '1';
  const BRUIT = /(\bW\b|Women|Femin|U1[5-9]|U2[0-3]|\bII\b|Youth|Reserve|Non League|Amateur)/i;

  let dernierEchecMs = 0;
  const echecs = [];
  let appels = 0;

  // Un appel au proxy. Rend null plutot que de jeter : un trou isole ne doit
  // pas faire tomber tout le scan.
  async function via(requete) {
    appels++;
    try {
      const r = await fetch(SITE + '/api/foot/?' + requete, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) { dernierEchecMs = Date.now(); echecs.push(requete); return null; }
      return await r.json();
    } catch (e) {
      dernierEchecMs = Date.now(); echecs.push(requete); return null;
    }
  }

  // Execute les requetes par vagues, en respirant entre chaque.
  async function parVagues(requetes) {
    const out = [];
    for (let i = 0; i < requetes.length; i += VAGUE) {
      const lot = requetes.slice(i, i + VAGUE);
      out.push(...await Promise.all(lot.map(via)));
      if (i + VAGUE < requetes.length) {
        await dormir(Date.now() - dernierEchecMs < FENETRE_ECHEC_MS ? PAUSE_APRES_ECHEC_MS : pauseMs);
      }
    }
    return out;
  }

  try {
    // ── 1. Le calendrier ────────────────────────────────────────────────────
    const calendriers = await parVagues(dates.map((d) => 'path=fixtures&date=' + d));
    let matchs = [];
    for (const c of calendriers) for (const f of (c && c.response) || []) matchs.push(f);

    if (ligues.length) matchs = matchs.filter((f) => ligues.includes(f.league.id));
    if (hMin != null || hMax != null) {
      matchs = matchs.filter((f) => {
        const h = heureParis(f.fixture.date);
        return (hMin == null || h >= hMin) && (hMax == null || h <= hMax);
      });
    }
    if (filtrerBruit) {
      matchs = matchs.filter((f) => !BRUIT.test(f.teams.home.name + ' ' + f.teams.away.name)
        && !BRUIT.test(f.league.name));
    }
    // Un match deja joue n'a plus rien a nous dire.
    matchs = matchs.filter((f) => f.fixture.status.short === 'NS');

    const nbMatchs = matchs.length;

    // ── 2. Les cotes ────────────────────────────────────────────────────────
    //
    // PIEGE PAYE UNE FOIS : l'endpoint odds ne renvoie rien d'exploitable avec
    // un simple ?date=. Il FAUT league + season + date. On regroupe donc les
    // matchs par triplet, ce qui au passage divise le nombre d'appels par le
    // nombre de matchs de chaque ligue.
    const groupes = new Map();
    for (const f of matchs) {
      const cle = `${f.league.id}|${f.league.season}|${jourUTC(f.fixture.date)}`;
      if (!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle).push(f);
    }

    const requetesCotes = [];
    for (const cle of groupes.keys()) {
      const [lid, saison, date] = cle.split('|');
      for (const bet of [BET_OU, BET_BTTS]) {
        requetesCotes.push(`path=odds&league=${lid}&season=${saison}&date=${date}&bookmaker=${BOOKMAKER}&bet=${bet}`);
      }
    }
    let reponsesCotes = await parVagues(requetesCotes);

    // Pagination : API-Football plafonne a 10 resultats par page. Sans cette
    // seconde passe, un soir de Ligue Europa (18 matchs) on perdait huit
    // affiches sans s'en apercevoir.
    const suites = [];
    reponsesCotes.forEach((rep, i) => {
      const total = rep && rep.paging && rep.paging.total;
      for (let p = 2; p <= (total || 1); p++) suites.push(requetesCotes[i] + '&page=' + p);
    });
    if (suites.length) reponsesCotes = reponsesCotes.concat(await parVagues(suites));

    // fixtureId -> { 'Over 2.5': 1.44, 'Yes': 1.57, … }
    const cotes = new Map();
    for (const rep of reponsesCotes) {
      for (const ligne of (rep && rep.response) || []) {
        const id = ligne.fixture && ligne.fixture.id;
        if (!id) continue;
        if (!cotes.has(id)) cotes.set(id, {});
        const dedans = cotes.get(id);
        for (const bk of ligne.bookmakers || []) {
          for (const b of bk.bets || []) {
            for (const v of b.values || []) {
              const prix = Number(v.odd);
              if (prix > 0) dedans[v.value] = prix;
            }
          }
        }
      }
    }

    // ── 3. La forme des equipes ─────────────────────────────────────────────
    // Seulement pour les matchs qui ont au moins une cote dans la fourchette :
    // inutile de payer deux appels pour une affiche qu'on ecartera.
    const dansFourchette = (c) => c != null && c >= coteMin && c <= coteMax;
    const candidats = matchs.filter((f) => {
      const c = cotes.get(f.fixture.id);
      if (!c) return false;
      return dansFourchette(c['Over 2.5']) || dansFourchette(c['Under 2.5'])
        || dansFourchette(c['Yes']) || dansFourchette(c['No']);
    });

    const equipes = new Set();
    for (const f of candidats) { equipes.add(f.teams.home.id); equipes.add(f.teams.away.id); }

    const idsEquipes = [...equipes];
    const reponsesForme = await parVagues(idsEquipes.map((id) => `path=fixtures&team=${id}&last=8`));

    // teamId -> [{ total, btts }]
    const formes = new Map();
    idsEquipes.forEach((id, i) => {
      const rep = reponsesForme[i];
      const lignes = [];
      for (const m of (rep && rep.response) || []) {
        if (m.fixture.status.short !== 'FT') continue;
        if (m.goals.home == null || m.goals.away == null) continue;
        lignes.push({
          total: m.goals.home + m.goals.away,
          btts: m.goals.home > 0 && m.goals.away > 0,
        });
      }
      formes.set(id, lignes);
    });

    // ── 4. Les lignes ───────────────────────────────────────────────────────
    const MARCHES = [
      { nom: 'Plus de 2,5 buts',       cle: 'Over 2.5',  test: (m) => m.total > 2.5 },
      { nom: 'Moins de 2,5 buts',      cle: 'Under 2.5', test: (m) => m.total < 2.5 },
      { nom: 'Les 2 équipes marquent', cle: 'Yes',       test: (m) => m.btts },
      { nom: 'Une équipe finit à 0',   cle: 'No',        test: (m) => !m.btts },
    ];

    const lignes = [];
    for (const f of candidats) {
      const c = cotes.get(f.fixture.id) || {};
      const dom = formes.get(f.teams.home.id) || [];
      const ext = formes.get(f.teams.away.id) || [];
      const tous = dom.concat(ext);
      if (tous.length < nMin) continue;

      for (const m of MARCHES) {
        const cote = c[m.cle];
        if (!dansFourchette(cote)) continue;
        const okDom = dom.filter(m.test).length;
        const okExt = ext.filter(m.test).length;
        const freq = (okDom + okExt) / tous.length;
        lignes.push({
          marche: m.nom,
          cote,
          freq: Math.round(freq * 1000) / 1000,
          implicite: Math.round((1 / cote) * 1000) / 1000,
          edge: Math.round((freq - 1 / cote) * 1000) / 1000,
          n: tous.length,
          detail: `${okDom}/${dom.length} + ${okExt}/${ext.length}`,
          heure: new Date(f.fixture.date).toLocaleString('en-GB', {
            timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
          }),
          match: `${f.teams.home.name} - ${f.teams.away.name}`,
          ligue: `${f.league.country} / ${f.league.name}`,
          fixture: f.fixture.id,
        });
      }
    }

    lignes.sort(tri === 'freq'
      ? (a, b) => b.freq - a.freq || b.edge - a.edge
      : (a, b) => b.edge - a.edge);

    res.status(200).json({
      // Ce que le classement vaut vraiment. Ecrit dans la reponse pour qu'on
      // ne le perde pas de vue : une frequence observee sur 16 matchs n'est
      // PAS une probabilite. Deux soirs de suite (13 et 14/10) la ligne la
      // mieux classee est tombee alors que le marche avait raison sur
      // l'ensemble du programme. Tant qu'aucun backtest n'a tourne, « edge »
      // designe un ecart de comptage, pas un avantage demontre.
      avertissement: 'freq est une frequence brute sur les 8 derniers matchs de chaque equipe, sans ajustement adversaire ni domicile/exterieur. Marge d\'erreur large, methode non backtestee.',
      parametres: { dates, ligues, hMin, hMax, coteMin, coteMax, nMin, tri, filtrerBruit },
      resume: {
        matchsDuCreneau: nbMatchs,
        groupesDeCotes: groupes.size,
        matchsAvecCotes: cotes.size,
        candidats: candidats.length,
        equipesChargees: idsEquipes.length,
        lignesEvaluees: lignes.length,
        appels,
        echecs: echecs.length,
        dureeMs: Date.now() - t0,
      },
      lignes: lignes.slice(0, limite),
    });
  } catch (e) {
    res.status(500).json({ error: 'scan impossible', details: String(e && e.message || e) });
  }
}
