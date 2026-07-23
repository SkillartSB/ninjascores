// Vercel serverless function — fil des derniers transferts.
//
// L'endpoint `transfers` d'API-Football n'accepte ni date ni championnat : il
// exige une equipe. Un fil « derniers transferts » impose donc de balayer les
// clubs un par un. On le fait ICI, une fois toutes les six heures, plutot que
// dans le navigateur de chaque visiteur : le balayage coute ~100 requetes,
// mais il est mutualise par le cache CDN.
//
// Trois pieges du fournisseur, traites plus bas :
//  1. le meme mouvement est reemis a des dates voisines (Tielemans apparait
//     le 12 ET le 13 juillet) — sans deduplication le fil affiche des doublons ;
//  2. le champ `type` melange quatre notions (Loan, Free, N/A, « € 20M ») et
//     moins de 4 % des mouvements portent un montant ;
//  3. « Return from loan » n'est pas un transfert : c'est la fin d'un pret,
//     et cela representerait un tiers du fil si on le laissait passer.

import fs from 'fs';
import path from 'path';

const BASE = 'https://v3.football.api-sports.io';

// Fichier enrichi (montants Transfermarkt) produit tous les 3-4 jours par le
// job GitHub Actions. Present : on le sert tel quel. Absent : on retombe sur
// le balayage en direct, sans montants — le site reste debout quoi qu'il arrive.
const FICHIER = path.join(process.cwd(), 'data', 'transferts.json');

// Les championnats ou la donnee est reellement dense. Hors de ceux-ci la
// couverture s'effondre (Zeleznicar Pancevo : zero mouvement en 2026), donc
// un fil « tous pays » serait vide pour la majorite d'entre eux.
const LIGUES = [
  { id: 61,  nom: 'Ligue 1' },
  { id: 39,  nom: 'Premier League' },
  { id: 140, nom: 'La Liga' },
  { id: 135, nom: 'Serie A' },
  { id: 78,  nom: 'Bundesliga' },
  { id: 94,  nom: 'Liga Portugal' },
  { id: 88,  nom: 'Eredivisie' },
  { id: 144, nom: 'Jupiler Pro League' },
  { id: 203, nom: 'Süper Lig' },
];

const JOURS = 90;          // profondeur du fil
const MAX = 150;           // mouvements renvoyes au maximum
const LARGEUR = 4;         // requetes simultanees : api-sports rejette les
                           // grosses rafales (200 + errors), d'ou ce plafond bas

const dors = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(chemin, cle, essai) {
  essai = essai || 0;
  try {
    const r = await fetch(BASE + '/' + chemin, { headers: { 'x-apisports-key': cle } });
    // 429 = quota par minute atteint : on attend et on reessaie, sinon le
    // club disparait purement et simplement du fil
    if ((r.status === 429 || r.status >= 500) && essai < 5) {
      await dors(700 * (essai + 1));
      return api(chemin, cle, essai + 1);
    }
    if (!r.ok) return [];
    const j = await r.json();
    // le vrai signal de rate-limit : un 200 avec errors non vide et response
    // vide. Sans cette detection, le club etait juste absent, sans bruit.
    const err = j.errors;
    const bloque = err && (Array.isArray(err) ? err.length : Object.keys(err).length);
    if (bloque && essai < 5) {
      await dors(700 * (essai + 1));
      return api(chemin, cle, essai + 1);
    }
    return j.response || [];
  } catch (e) {
    if (essai < 4) { await dors(500 * (essai + 1)); return api(chemin, cle, essai + 1); }
    return [];
  }
}

// n promesses au maximum en vol : ouvrir 100 connexions d'un coup ferait
// echouer une partie des appels
async function enFile(taches, largeur) {
  const res = [];
  let i = 0;
  async function suivant() {
    while (i < taches.length) {
      const k = i++;
      try { res[k] = await taches[k](); } catch (e) { res[k] = []; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(largeur, taches.length) }, suivant));
  return res;
}

// « Loan » / « Free » / « € 20M » / « N/A » designent des situations
// differentes : on les ramene a trois categories affichables, et on garde le
// montant quand il existe.
function classer(brut) {
  const s = String(brut || '').trim();
  if (/back from loan|return from loan/i.test(s)) return null;   // fin de pret, pas un transfert
  const m = s.match(/€\s*([\d.,]+)\s*([MK])/i);
  if (m) {
    const n = parseFloat(m[1].replace(',', '.'));
    return { type: 'transfert', valeur: n + (m[2].toUpperCase() === 'M' ? ' M€' : ' K€') };
  }
  if (/loan/i.test(s)) return null;   // pret : exclu, on ne garde que le definitif
  if (/free/i.test(s)) return { type: 'libre', valeur: null };
  return { type: 'transfert', valeur: null };
}

function initiales(nom) {
  const p = String(nom || '').replace(/\./g, ' ').split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const cle = process.env.API_FOOTBALL_KEY;
  if (!cle) return res.status(500).json({ error: 'clé absente' });

  // Six heures de cache : le mercato bouge par jours, pas par minutes, et le
  // balayage complet ne doit pas repartir a chaque visite.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400');

  // Cas normal : servir le fichier enrichi. `?raw=1` force le balayage en
  // direct — c'est ce que le job appelle pour reconstituer la base avant
  // d'y ajouter les montants (sinon il se relirait lui-meme, en boucle).
  if (!req.query.raw) {
    try {
      const txt = fs.readFileSync(FICHIER, 'utf8');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).send(txt);
    } catch (e) { /* pas encore de fichier : on balaie en direct ci-dessous */ }
  }

  try {
    const auj = new Date();
    const saison = auj.getMonth() >= 6 ? auj.getFullYear() : auj.getFullYear() - 1;
    const limite = new Date(auj.getTime() - JOURS * 86400000).toISOString().slice(0, 10);

    // 1. les clubs des grands championnats
    const lots = await enFile(
      LIGUES.map((l) => () => api('teams?league=' + l.id + '&season=' + saison, cle)),
      LIGUES.length);
    const clubs = [];
    lots.forEach((lot, i) => (lot || []).forEach((x) => {
      if (x && x.team && x.team.id) clubs.push({ id: x.team.id, ligue: LIGUES[i].nom });
    }));
    if (!clubs.length) return res.status(200).json({ genere: auj.toISOString(), total: 0, transferts: [] });

    // 2. leurs mouvements
    const suivis = new Set(clubs.map((c) => c.id));
    const nomLigue = new Map(clubs.map((c) => [c.id, c.ligue]));

    const parClub = await enFile(
      clubs.map((c) => () => api('transfers?team=' + c.id, cle)), LARGEUR);

    // 3. mise a plat, filtrage et deduplication
    const vus = new Map();
    parClub.forEach((rep, i) => (rep || []).forEach((p) => {
      (p.transfers || []).forEach((t) => {
        const date = t.date || '';
        if (date < limite) return;
        const dedans = (t.teams || {}).in || {};
        const dehors = (t.teams || {}).out || {};
        if (!dedans.id || !dehors.id || dedans.id === dehors.id) return;
        // au moins un des deux clubs doit faire partie des championnats
        // suivis, sinon le fil derive vers des divisions qu'il n'affiche pas
        if (!suivis.has(dedans.id) && !suivis.has(dehors.id)) return;
        const cat = classer(t.type);
        if (!cat) return;
        // Le fournisseur reemet le meme mouvement a des dates voisines : la
        // cle ignore donc la date, et on garde la plus recente.
        const k = p.player.id + ':' + dehors.id + ':' + dedans.id;
        const ancien = vus.get(k);
        if (ancien && ancien.date >= date) return;
        vus.set(k, {
          id: k,
          date,
          joueur: p.player.name,
          initiales: initiales(p.player.name),
          de: dehors.name, deLogo: dehors.logo, deId: dehors.id,
          vers: dedans.name, versLogo: dedans.logo, versId: dedans.id,
          type: cat.type,
          valeur: cat.valeur,
          ligue: nomLigue.get(dedans.id) || nomLigue.get(dehors.id) || clubs[i].ligue,
        });
      });
    }));

    const transferts = Array.from(vus.values())
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, MAX);

    return res.status(200).json({
      genere: auj.toISOString(),
      clubs: clubs.length,
      total: transferts.length,
      transferts,
    });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
