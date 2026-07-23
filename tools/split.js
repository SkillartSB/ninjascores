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

const crypto = require('crypto');
// Le fournisseur renvoie parfois le classement d'une saison a l'identique
// pour la suivante (Jamaique 2020/21 == 2021/22). On deduplique ICI, a chaque
// regeneration, plutot qu'en etape separee qu'un retelechargement annulerait.
function sigClassement(rows) {
  return crypto.createHash('md5')
    .update(JSON.stringify(rows.map((r) => [r.rank, r.team, r.pts, r.played])))
    .digest('hex');
}
function dedupPays(ligues) {
  for (const saisons of Object.values(ligues)) {
    const vus = {};
    for (const s of Object.keys(saisons).sort()) {
      const rows = saisons[s];
      if (!rows || !rows.length) continue;
      const g = sigClassement(rows);
      if (vus[g]) delete saisons[s]; else vus[g] = s;
    }
  }
}

// Images generiques du fournisseur (placeholder "image not available",
// "official logo soon", boucliers gris...), reperees par tools/placeholders-scan.js
// : partagees par des clubs de plusieurs pays, donc jamais un vrai ecusson.
let GENERIQUES = new Set();
try { GENERIQUES = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'placeholder-urls.json'), 'utf8'))); } catch (e) {}

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const logos = {};
// pays -> championnats ordonnes, premiere division en tete
const ORDRE = require('./ordre-ligues.json');
// libelles historiques du lookup, sinon un meme pays forme deux groupes
const ALIAS = require('./alias-pays.json');

const manifest = { genere: new Date().toISOString().slice(0, 10), pays: {} };

let octets = 0;
for (const [paysApi, ligues] of Object.entries(data)) {
  dedupPays(ligues);
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

  // Ordre hierarchique des championnats, premiere division en tete.
  // La colonne laterale s'en sert pour classer les ligues ET pour afficher
  // leur nombre des le demarrage : sans cette cle elle retombait sur le
  // lookup, qui n'est rempli qu'a la visite du pays, et l'Allemagne
  // s'affichait avec "1" championnat au lieu de 3.
  //
  // L'ordre force est applique ICI, a chaque regeneration. Le faire dans un
  // script separe ne tenait pas : split.js reecrit le manifeste de zero, et
  // l'Irlande du Nord comme le Kazakhstan etaient repasses D2 devant D1.
  {
    const voulu = ORDRE[paysApi] || [];
    const restants = Object.keys(entree.ligues);
    const tete = voulu.filter((l) => restants.includes(l));
    entree.ordre = tete.concat(restants.filter((l) => !tete.includes(l)));
    if (ALIAS[paysApi]) entree.alias = ALIAS[paysApi];
    const ligues2 = {};
    for (const l of entree.ordre) ligues2[l] = entree.ligues[l];
    entree.ligues = ligues2;
  }

  // Ecussons propres au pays : deux clubs homonymes de pays differents
  // (Al Ittihad en Arabie saoudite et a Bahrein) ne peuvent pas etre
  // distingues par une table globale nom -> logo.
  const logosPays = {};
  for (const saisons of Object.values(ligues)) {
    for (const lignes of Object.values(saisons)) {
      for (const r of lignes) {
        if (r.team && r.logo && !logosPays[r.team] && !GENERIQUES.has(r.logo)) logosPays[r.team] = r.logo;
      }
    }
  }
  // corrections manuelles : clubs presents chez le fournisseur sous une
  // autre graphie ("Energetyk-BDU" y figure comme "Ynergetyk-BDU")
  try {
    const OV = require('./logos-override.json')[paysApi];
    if (OV) for (const [nom, url] of Object.entries(OV)) {
      // url null : ecusson volontairement retire (le fournisseur en
      // renvoie un faux, cf. Toulon et le blason de rugby)
      if (url === null) delete logosPays[nom]; else logosPays[nom] = url;
    }
  } catch (e) { /* pas de correction pour ce pays */ }
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
