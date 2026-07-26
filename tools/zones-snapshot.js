// Snapshot des zones montée/descente AVANT la régénération des classements.
//
// split.js fait un unlink complet de data/standings/ puis régénère depuis
// standings_api.json — SANS le champ row.zone. On capture donc les zones
// existantes par (fichier pays, compétition, saison, RANG) pour les
// réappliquer après (zones-restore.js).
//
// Pourquoi par rang et pas par équipe : une bande de qualification est
// positionnelle (ex. rangs 1-6 -> Ligue des Champions). Si une équipe change
// de rang, la zone doit suivre le rang, pas l'équipe.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'standings');
const OUT = path.join(__dirname, 'zones-snapshot.json');

const snap = {};
let n = 0;

for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.json') || f === 'manifest.json' || f === 'logos.json') continue;
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  for (const comp of Object.keys(d)) {
    if (comp === '_logos') continue;
    const seasons = d[comp];
    if (!seasons || typeof seasons !== 'object') continue;
    for (const s of Object.keys(seasons)) {
      const rows = seasons[s];
      if (!Array.isArray(rows)) continue;
      // clé = index de la ligne dans le tableau (slot positionnel). Les zones
      // sont un habillage du i-ème rang du tableau ; ni le rang seul ni
      // (groupe|rang) ne sont uniques (poules multiples, groupes homonymes aux
      // zones différentes). L'ordre des lignes est stable d'une régé à l'autre.
      rows.forEach(function (r, i) {
        if (r && r.zone) {
          snap[f] = snap[f] || {};
          snap[f][comp] = snap[f][comp] || {};
          snap[f][comp][s] = snap[f][comp][s] || {};
          snap[f][comp][s][i] = r.zone;
          n++;
        }
      });
    }
  }
}

fs.writeFileSync(OUT, JSON.stringify(snap));
console.log('zones-snapshot : ' + n + ' lignes zonées capturées -> ' +
  path.relative(process.cwd(), OUT));
