#!/usr/bin/env node
// Corrige les libelles de saison, deduits a tort des DATES au lieu de
// l'annee officielle du fournisseur.
//
// Au Congo, la saison 2020 se joue de janvier a juillet 2021 : elle etait
// donc etiquetee "2021". Et les saisons 2024 (janv-avr 2025) et 2025
// (sept-dec 2025) recevaient toutes deux "2025" — l'une ecrasait l'autre
// dans le fichier, d'ou des saisons disparues.
//
// Regle retenue : l'annee vient du fournisseur, le "/AA" seulement si la
// saison franchit le 31 decembre.
//
//   node tools/saisons-libelles.js          diagnostic
//   node tools/saisons-libelles.js --faire  corrige et retelecharge
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const DIR = path.join(RACINE, 'data', 'standings');
const SRC = path.join(RACINE, 'standings_api.json');
const BASE = 'https://ninjascores.com/api/foot';
let depense = 0;

async function api(params) {
  const r = await fetch(`${BASE}?${new URLSearchParams(params)}`);
  depense++;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length)) throw new Error('api');
  return j;
}

const ancien = (s) => {
  const a = new Date(s.start).getUTCFullYear(), b = new Date(s.end).getUTCFullYear();
  return a === b ? String(a) : `${a}/${String(b).slice(2)}`;
};
const correct = (s) => {
  const d1 = new Date(s.start), d2 = new Date(s.end);
  const a = d1.getUTCFullYear(), b = d2.getUTCFullYear();
  const y = s.year;
  const paire = (p) => `${p}/${String(p + 1).slice(2)}`;
  // Saison dans une seule annee civile : on suit l'annee officielle.
  if (a === b) {
    // ex Cote d'Ivoire 2020 jouee entierement en 2021 : c'est la campagne 2020/21
    if (a === y + 1) return paire(y);
    return String(y);
  }
  // Saison a cheval sur deux annees.
  const mois = (b - a) * 12 + (d2.getUTCMonth() - d1.getUTCMonth());
  // L'annee officielle marque le debut : campagne classique Y/Y+1.
  if (y === a) return paire(y);
  // L'annee officielle marque la fin (fournisseur decale) :
  //  - ~12 mois = annee civile decalee (Indonesie 2017, nov16->nov17) -> "Y"
  //  - saison plus courte = campagne d'hiver Y-1/Y (Irak 2021, oct20->juil21)
  if (mois >= 11) return String(y);
  return paire(y - 1);
};

function normalise(rep) {
  if (!rep || !rep.length) return null;
  const g = rep[0].league && rep[0].league.standings;
  if (!g || !g.length) return null;
  const out = [];
  g.forEach((grp, gi) => grp.forEach((r) => out.push({
    rank: r.rank, team: r.team && r.team.name, logo: r.team && r.team.logo,
    played: r.all && r.all.played, won: r.all && r.all.win,
    drawn: r.all && r.all.draw, lost: r.all && r.all.lose,
    gd: String(r.goalsDiff > 0 ? '+' + r.goalsDiff : r.goalsDiff), pts: r.points,
    groupe: g.length > 1 ? (r.group || `Groupe ${gi + 1}`) : undefined,
  })));
  return out.length ? out : null;
}

(async () => {
  const faire = process.argv.includes('--faire');
  const man = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).pays;
  const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));

  let renommees = 0, perdues = [], paysTouches = new Set();

  for (const [cle, info] of Object.entries(man)) {
    if (!src[cle]) continue;
    let j;
    try { j = await api({ path: 'leagues', country: cle.replace(/\s+/g, '-') }); }
    catch (e) { continue; }

    for (const l of j.response || []) {
      const nom = l.league.name;
      if (!src[cle][nom]) continue;
      const bloc = src[cle][nom];
      const util = l.seasons.filter((s) => s.year >= 2010 && s.coverage && s.coverage.standings);

      // collisions : plusieurs saisons vers un meme ancien libelle
      const parAncien = {};
      util.forEach((s) => { (parAncien[ancien(s)] = parAncien[ancien(s)] || []).push(s); });

      const neuf = {};
      for (const s of util) {
        const a = ancien(s), c = correct(s);
        const collision = parAncien[a].length > 1;
        // Le script doit pouvoir etre rejoue : la saison peut deja porter
        // son libelle corrige, ou celui d'une version precedente de la regle.
        const candidats = [c, a, String(s.year), `${s.year}/${String(s.year + 1).slice(2)}`];
        const trouve = candidats.find((k) => bloc[k] && !(k === a && collision));
        if (trouve) {
          if (trouve !== c) { renommees++; paysTouches.add(info.nom); }
          neuf[c] = bloc[trouve];
        } else {
          // saison perdue par ecrasement, ou absente : a retelecharger
          perdues.push({ cle, nom, id: l.league.id, annee: s.year, libelle: c, pays: info.nom });
        }
      }
      if (faire && Object.keys(neuf).length) src[cle][nom] = neuf;
    }
  }

  console.log(`${renommees} saisons a renommer sur ${paysTouches.size} pays`);
  console.log(`${perdues.length} saisons a retelecharger (collisions d'etiquette)\n`);
  const parPays = {};
  perdues.forEach((p) => { parPays[p.pays] = (parPays[p.pays] || 0) + 1; });
  Object.entries(parPays).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([p, n]) => console.log(`  ${p} : ${n}`));

  if (!faire) { console.log(`\n(diagnostic — relancer avec --faire)`); return; }

  console.log('\nRetelechargement...');
  for (const p of perdues) {
    try {
      const st = await api({ path: 'standings', league: p.id, season: p.annee });
      const lignes = normalise(st.response);
      if (lignes) { src[p.cle][p.nom] = src[p.cle][p.nom] || {}; src[p.cle][p.nom][p.libelle] = lignes; }
    } catch (e) { /* indisponible */ }
  }
  fs.writeFileSync(SRC, JSON.stringify(src));
  console.log(`termine · ${depense} requetes`);
})();
