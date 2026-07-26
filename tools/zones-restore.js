// Ré-applique les zones montée/descente APRÈS la régénération (split.js +
// divisions-inf.js), depuis le snapshot pris par zones-snapshot.js.
//
// Réapplication positionnelle : on repose row.zone sur la ligne du MÊME rang,
// dans la même compétition/saison du même fichier pays. Sûr et sans appel API.
//
// Note : les zones restent « figées » à leur dernier état connu ; un
// rafraîchissement des règles de qualif se fait à part (via API-Football,
// manuellement). Ici on garantit surtout qu'une régénération ne les EFFACE pas.
//
// Usage : node tools/zones-restore.js [--dry]
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'standings');
const SNAP = path.join(__dirname, 'zones-snapshot.json');
const dry = process.argv.includes('--dry');

if (!fs.existsSync(SNAP)) {
  console.error('zones-restore : snapshot introuvable — on ne touche à rien.');
  process.exit(0);
}

const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
let applied = 0, files = 0, manquants = 0;

for (const f of Object.keys(snap)) {
  const fp = path.join(DIR, f);
  if (!fs.existsSync(fp)) { manquants++; continue; }
  const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
  let changed = false;
  for (const comp of Object.keys(snap[f])) {
    const seasons = d[comp];
    if (!seasons || typeof seasons !== 'object') continue;
    for (const s of Object.keys(snap[f][comp])) {
      const rows = seasons[s];
      if (!Array.isArray(rows)) continue;
      const byIdx = snap[f][comp][s];
      rows.forEach(function (r, i) {
        if (r && byIdx[i]) {
          if (!dry) r.zone = byIdx[i];
          applied++;
          changed = true;
        }
      });
    }
  }
  if (changed && !dry) { fs.writeFileSync(fp, JSON.stringify(d)); files++; }
}

console.log('zones-restore' + (dry ? ' (dry-run)' : '') + ' : ' + applied +
  ' lignes rezonées' + (dry ? '' : ' sur ' + files + ' fichiers') +
  (manquants ? ' | ' + manquants + ' fichiers pays disparus (ignorés)' : ''));
