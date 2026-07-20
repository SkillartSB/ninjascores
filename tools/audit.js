#!/usr/bin/env node
// Audit complet des classements : logos manquants, ordre des championnats,
// poules mal decoupees, anomalies de donnees. Pays par pays, toutes saisons.
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const DIR = path.join(RACINE, 'data', 'standings');

const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const LOGOS = JSON.parse(fs.readFileSync(path.join(DIR, 'logos.json'), 'utf8'));
const MAN = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).pays;

// noms couverts par la table interne du site
const CLUB = new Set();
for (const m of html.matchAll(/"([^"]+)"\s*:\s*"https?:\/\/[^"]+"/g)) CLUB.add(m[1]);

const SPEC = { 'İ':'I','ı':'i','ğ':'g','ş':'s','ə':'e','ç':'c','ö':'o','ü':'u','ł':'l','ø':'o','å':'a','đ':'d','ț':'t','ș':'s' };
const norm = (s) => String(s || '').split('').map((c) => SPEC[c] || c).join('')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();
const CLUBN = new Set([...CLUB].map(norm));
const LOGN = new Set(Object.keys(LOGOS).map(norm));

// reproduit NS_POULES du front pour verifier le decoupage
function poules(lignes) {
  const out = []; let cour = null, prec = 0;
  for (const r of lignes) {
    const nom = r.groupe || null;
    const rupture = !cour || (nom ? cour.nom !== nom : false) || r.rank <= prec;
    if (rupture) { cour = { nom, lignes: [] }; out.push(cour); }
    cour.lignes.push(r); prec = r.rank;
  }
  const joue = out.filter((g) => g.lignes.reduce((a, r) => a + (r.played || 0), 0) > 0);
  return joue.length ? joue : out;
}

const pb = { logos: [], ordre: [], poules: [], donnees: [], vides: [] };
let nbEquipes = 0, nbSansLogo = 0, nbSaisons = 0;

const pays = Object.entries(MAN).sort((a, b) => a[1].nom.localeCompare(b[1].nom, 'fr'));

for (const [cle, info] of pays) {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, info.fichier), 'utf8'));
  // _logos n'est pas un championnat
  for (const k of Object.keys(d)) if (k.startsWith('_')) delete d[k];
  const noms = Object.keys(d);

  // -- ordre des championnats
  if (!info.ordre || !info.ordre.length) pb.ordre.push(`${info.nom} : aucun ordre defini`);
  else if (noms.length > 1 && info.ordre[0] !== noms[0] && !info.ordre.includes(noms[0])) {
    pb.ordre.push(`${info.nom} : ordre incoherent`);
  }

  const sansLogo = new Set();
  for (const [ligue, saisons] of Object.entries(d)) {
    for (const [saison, lignes] of Object.entries(saisons)) {
      nbSaisons++;
      if (!lignes.length) { pb.vides.push(`${info.nom} · ${ligue} ${saison}`); continue; }

      // -- logos
      for (const r of lignes) {
        if (!r.team) continue;
        nbEquipes++;
        const n = norm(r.team);
        if (!LOGOS[r.team] && !LOGN.has(n) && !CLUB.has(r.team) && !CLUBN.has(n)) {
          nbSansLogo++; sansLogo.add(r.team);
        }
      }

      // -- poules : le decoupage doit produire des rangs strictement croissants
      const gs = poules(lignes);
      for (const g of gs) {
        const rangs = g.lignes.map((x) => x.rank);
        const croissant = rangs.every((v, i) => i === 0 || v > rangs[i - 1]);
        if (!croissant) {
          pb.poules.push(`${info.nom} · ${ligue} ${saison} : rangs non croissants dans "${g.nom || 'poule unique'}"`);
        }
      }

      // -- anomalies de donnees
      const joues = lignes.reduce((a, r) => a + (r.played || 0), 0);
      if (joues === 0 && saison !== Object.keys(saisons).sort().reverse()[0]) {
        pb.donnees.push(`${info.nom} · ${ligue} ${saison} : aucun match joue`);
      }
      const sansPts = lignes.filter((r) => r.pts === undefined || r.pts === null).length;
      if (sansPts) pb.donnees.push(`${info.nom} · ${ligue} ${saison} : ${sansPts} lignes sans points`);
      let doublons = 0;
      for (const g of gs) doublons += g.lignes.length - new Set(g.lignes.map((r) => r.team)).size;
      if (doublons > 0) pb.donnees.push(`${info.nom} · ${ligue} ${saison} : ${doublons} equipes en double dans une meme poule`);
    }
  }
  if (sansLogo.size) pb.logos.push(`${info.nom} : ${sansLogo.size} — ${[...sansLogo].slice(0, 6).join(', ')}`);
}

const titre = (t) => console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`);
console.log(`${pays.length} pays · ${nbSaisons} saisons · ${nbEquipes} lignes`);
console.log(`equipes sans aucun logo : ${nbSansLogo} lignes (${(100 * nbSansLogo / nbEquipes).toFixed(2)} %)`);

titre(`LOGOS MANQUANTS — ${pb.logos.length} pays concernes`);
pb.logos.forEach((x) => console.log('  ' + x));
titre(`POULES MAL DECOUPEES — ${pb.poules.length}`);
pb.poules.slice(0, 25).forEach((x) => console.log('  ' + x));
titre(`ORDRE DES CHAMPIONNATS — ${pb.ordre.length}`);
pb.ordre.forEach((x) => console.log('  ' + x));
titre(`SAISONS VIDES — ${pb.vides.length}`);
pb.vides.slice(0, 20).forEach((x) => console.log('  ' + x));
titre(`ANOMALIES DE DONNEES — ${pb.donnees.length}`);
pb.donnees.slice(0, 25).forEach((x) => console.log('  ' + x));
