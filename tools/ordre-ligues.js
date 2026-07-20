#!/usr/bin/env node
// Ajoute au manifeste l'ordre hierarchique des championnats de chaque pays.
//
// Le tri alphabetique placait la deuxieme division devant la premiere :
// "1st Division" avant "Superliga" en Albanie, alors que la Superliga est
// le niveau 1. API-Football numerote les championnats par niveau au sein
// d'un pays (Ligue 1 = 61, Ligue 2 = 62 ; Superliga = 310, 1st Division = 311),
// verifie sur huit pays. On trie donc sur l'identifiant.
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
    throw new Error('api');
  }
  return j;
}

(async () => {
  const fichier = path.join(DIR, 'manifest.json');
  const man = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  let traites = 0, sansOrdre = [];

  for (const [cle, info] of Object.entries(man.pays)) {
    const noms = Object.keys(info.ligues);
    if (noms.length < 2) { info.ordre = noms; continue; }   // rien a trier
    try {
      const j = await api({ path: 'leagues', country: cle.replace(/\s+/g, '-') });
      const parNom = {};
      (j.response || []).forEach((l) => { parNom[l.league.name] = l.league.id; });
      // les championnats inconnus du catalogue passent a la fin
      info.ordre = noms.slice().sort((a, b) => {
        const ia = parNom[a] === undefined ? 1e9 : parNom[a];
        const ib = parNom[b] === undefined ? 1e9 : parNom[b];
        return ia !== ib ? ia - ib : a.localeCompare(b, 'fr');
      });
      if (info.ordre[0] !== noms.slice().sort()[0]) traites++;
    } catch (e) {
      info.ordre = noms.slice().sort();
      sansOrdre.push(info.nom);
    }
  }

  fs.writeFileSync(fichier, JSON.stringify(man));
  console.log(`${traites} pays dont l'ordre change par rapport a l'alphabetique`);
  console.log(`${depense} requetes`);
  if (sansOrdre.length) console.log(`sans ordre (repli alphabetique) : ${sansOrdre.join(', ')}`);
})();
