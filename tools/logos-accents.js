#!/usr/bin/env node
// Derniere passe : retrouver les ecussons dont le nom differe seulement par
// des caracteres speciaux. "İstanbul Basaksehir" chez nous, "Istanbul
// Basaksehir" chez le fournisseur — la recherche brute echoue, la recherche
// normalisee reussit.
//
// La correspondance reste STRICTE : on compare les deux noms une fois
// normalises. Un ecusson faux serait pire qu'une initiale.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'standings');
const BASE = 'https://ninjascores.com/api/foot';
let depense = 0;

// Au-dela des accents latins : turc, azeri, roumain, polonais.
const SPECIAUX = {
  'İ': 'I', 'ı': 'i', 'ğ': 'g', 'Ğ': 'G', 'ş': 's', 'Ş': 'S',
  'ə': 'e', 'Ə': 'E', 'ç': 'c', 'Ç': 'C', 'ö': 'o', 'Ö': 'O',
  'ü': 'u', 'Ü': 'U', 'ń': 'n', 'ł': 'l', 'Ł': 'L', 'ø': 'o',
  'å': 'a', 'æ': 'ae', 'ß': 'ss', 'đ': 'd', 'ț': 't', 'ș': 's',
};

function normalise(s) {
  return String(s || '')
    .split('').map((c) => (SPECIAUX[c] !== undefined ? SPECIAUX[c] : c)).join('')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim().toLowerCase();
}

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
  const fichier = path.join(DIR, 'logos.json');
  const logos = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  const man = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).pays;

  const besoin = new Set();
  for (const info of Object.values(man)) {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, info.fichier), 'utf8'));
    for (const lg of Object.values(d)) {
      for (const s of Object.values(lg)) {
        for (const r of s) if (r.team && !logos[r.team]) besoin.add(r.team);
      }
    }
  }
  console.log(`${besoin.size} equipes sans ecusson\n`);

  let ajoutes = 0; const echecs = [];
  for (const eq of besoin) {
    const requete = normalise(eq);
    if (requete.length < 3) { echecs.push(`${eq} (nom trop court)`); continue; }
    try {
      const j = await api({ path: 'teams', search: requete });
      const cand = (j.response || [])
        .filter((t) => t.team && t.team.logo && normalise(t.team.name) === requete);
      if (cand.length === 1) {
        logos[eq] = cand[0].team.logo;
        ajoutes++;
        console.log(`  ${eq}  ->  ${cand[0].team.name}`);
      } else {
        echecs.push(`${eq}${cand.length > 1 ? ' (ambigu)' : ''}`);
      }
    } catch (e) {
      echecs.push(`${eq} (${e.message.slice(0, 40)})`);
    }
  }

  fs.writeFileSync(fichier, JSON.stringify(logos));
  console.log(`\n${ajoutes} ecussons ajoutes · ${echecs.length} restants · ${depense} requetes`);
  if (echecs.length) console.log('\nrestants : ' + echecs.join(', '));
})();
