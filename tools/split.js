#!/usr/bin/env node
// Decoupe standings_api.json en un fichier par pays + un manifeste leger.
//
// Trois sorties dans data/standings/ :
//   manifest.json  — pays -> championnats -> saisons disponibles (petit, charge
//                    au demarrage pour savoir quoi proposer sans rien telecharger)
//   logos.json     — nom d'equipe -> URL d'ecusson, dedoublonne
//   <Pays>.json    — les classements du pays, sans les logos
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'standings_api.json');
const DIR = path.join(__dirname, '..', 'data', 'standings');
const MAP = require('./pays.js');

// API -> francais affiche, pour que le manifeste parle la langue du site
const VERS_FR = {};
for (const [fr, api] of Object.entries(MAP)) VERS_FR[api] = fr;

fs.mkdirSync(DIR, { recursive: true });
for (const f of fs.readdirSync(DIR)) fs.unlinkSync(path.join(DIR, f));

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const logos = {};
const manifest = { genere: new Date().toISOString().slice(0, 10), pays: {} };

let octets = 0;
for (const [paysApi, ligues] of Object.entries(data)) {
  const sortie = {};
  const entree = { fichier: paysApi + '.json', nom: VERS_FR[paysApi] || paysApi, ligues: {} };

  for (const [ligue, saisons] of Object.entries(ligues)) {
    sortie[ligue] = {};
    for (const [saison, lignes] of Object.entries(saisons)) {
      sortie[ligue][saison] = lignes.map((r) => {
        if (r.logo && r.team && !logos[r.team]) logos[r.team] = r.logo;
        const { logo, ...reste } = r;
        // les cles undefined alourdissent inutilement le JSON
        if (reste.groupe === undefined) delete reste.groupe;
        return reste;
      });
    }
    // trie decroissant : la saison la plus recente en premier
    entree.ligues[ligue] = Object.keys(sortie[ligue]).sort().reverse();
  }

  // Ecussons propres au pays : deux clubs homonymes de pays differents
  // (Al Ittihad en Arabie saoudite et a Bahrein) ne peuvent pas etre
  // distingues par une table globale nom -> logo.
  const logosPays = {};
  for (const saisons of Object.values(ligues)) {
    for (const lignes of Object.values(saisons)) {
      for (const r of lignes) {
        if (r.team && r.logo && !logosPays[r.team]) logosPays[r.team] = r.logo;
      }
    }
  }
  sortie._logos = logosPays;

  const txt = JSON.stringify(sortie);
  fs.writeFileSync(path.join(DIR, paysApi + '.json'), txt);
  octets += txt.length;
  manifest.pays[paysApi] = entree;
}

fs.writeFileSync(path.join(DIR, 'logos.json'), JSON.stringify(logos));
fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(manifest));

const ko = (n) => Math.round(n / 1024);
console.log(`${Object.keys(data).length} fichiers pays  ${ko(octets)} Ko au total`);
console.log(`logos.json      ${ko(fs.statSync(path.join(DIR, 'logos.json')).size)} Ko  (${Object.keys(logos).length} equipes)`);
console.log(`manifest.json   ${ko(fs.statSync(path.join(DIR, 'manifest.json')).size)} Ko`);
console.log(`\nCharge au demarrage : manifest seul. Le reste vient a la demande.`);
