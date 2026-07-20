#!/usr/bin/env node
// Verifie que la vraie premiere division de chaque pays a bien ete importee.
//
// La reprise retenait les deux championnats ayant le plus de saisons, ce qui
// est un mauvais critere : en Argentine la Primera Nacional (D2) a plus
// d'historique que la Liga Profesional (D1). Le bon critere est l'identifiant
// API-Football, qui suit le niveau au sein d'un pays.
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
  if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length)) throw new Error('api');
  return j;
}

const EST_FEM = /f[eé]min|women|femenin|frauen|damallsvenskan|\bnwsl\b|\bwsl\b/i;
const EST_JEUNE = /\bU\s?\d{2}\b|youth|junior|reserve|academy/i;

(async () => {
  const man = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).pays;
  const manquants = [];

  for (const [cle, info] of Object.entries(man)) {
    try {
      const j = await api({ path: 'leagues', country: cle.replace(/\s+/g, '-') });
      const ligues = (j.response || [])
        .filter((l) => l.league.type === 'League'
          && !EST_FEM.test(l.league.name) && !EST_JEUNE.test(l.league.name))
        .map((l) => ({ id: l.league.id, nom: l.league.name,
                       saisons: l.seasons.filter((s) => s.year >= 2010 && s.coverage && s.coverage.standings).length }))
        .filter((l) => l.saisons > 0)
        .sort((a, b) => a.id - b.id);
      if (!ligues.length) continue;

      const importees = Object.keys(info.ligues);
      const d1 = ligues[0];
      if (!importees.includes(d1.nom)) {
        manquants.push({ pays: info.nom, cle, d1: d1.nom, id: d1.id,
                         saisons: d1.saisons, importees });
      }
    } catch (e) { /* pays absent du catalogue */ }
  }

  console.log(`${manquants.length} pays dont la premiere division n'est pas importee\n`);
  manquants.forEach((m) => {
    console.log(`  ${m.pays}`);
    console.log(`     manque : ${m.d1} (id ${m.id}, ${m.saisons} saisons)`);
    console.log(`     presentes : ${m.importees.join(', ')}`);
  });
  console.log(`\n${depense} requetes`);
  fs.writeFileSync(path.join(__dirname, 'd1-manquantes.json'), JSON.stringify(manquants, null, 1));
})();
