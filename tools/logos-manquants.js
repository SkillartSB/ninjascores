#!/usr/bin/env node
// Complete logos.json pour les equipes dont le classement ne portait pas d'ecusson.
//
// On passe par /teams?league=&season= plutot que par /teams?search= : la
// recherche par nom est ambigue ("Dukla" renvoie trois clubs differents),
// alors que l'appartenance a un championnat-saison est exacte.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'standings');
const BASE = 'https://ninjascores.com/api/foot';
let depense = 0;

async function api(params) {
  const r = await fetch(`${BASE}?${new URLSearchParams(params)}`);
  depense++;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length)) {
    throw new Error(JSON.stringify(j.errors));
  }
  return j;
}

(async () => {
  const logos = JSON.parse(fs.readFileSync(path.join(DIR, 'logos.json'), 'utf8'));
  const man = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).pays;

  // 1. recenser les equipes sans ecusson et OU elles jouent
  const besoin = new Map();          // equipe -> {pays, ligue, saison}
  for (const [cle, info] of Object.entries(man)) {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, info.fichier), 'utf8'));
    for (const [ligue, saisons] of Object.entries(d)) {
      for (const [saison, lignes] of Object.entries(saisons)) {
        for (const r of lignes) {
          if (r.team && !logos[r.team] && !besoin.has(r.team)) {
            besoin.set(r.team, { pays: cle, ligue, saison });
          }
        }
      }
    }
  }
  console.log(`${besoin.size} equipes sans ecusson`);

  // 2. recherche par nom, avec correspondance EXACTE obligatoire.
  //    "Dukla" renvoie Dukla Praha et Dukla Banska Bystrica : sans egalite
  //    stricte on collerait un ecusson faux, ce qui est pire qu'aucun.
  let trouves = 0, ambigus = [];
  for (const eq of besoin.keys()) {
    try {
      const j = await api({ path: 'teams', search: eq });
      const exact = (j.response || []).filter(
        (t) => t.team && t.team.name && t.team.name.toLowerCase() === eq.toLowerCase() && t.team.logo
      );
      if (exact.length === 1) { logos[eq] = exact[0].team.logo; trouves++; }
      else if (exact.length > 1) { ambigus.push(eq); }
    } catch (e) {
      // "search" exige 3 caracteres minimum : certains noms courts echouent
    }
  }

  fs.writeFileSync(path.join(DIR, 'logos.json'), JSON.stringify(logos));
  console.log(`${trouves} ecussons ajoutes · ${besoin.size - trouves} restants · ${depense} requetes`);
  if (ambigus.length) console.log(`ambigus (non traites) : ${ambigus.join(', ')}`);
})();
