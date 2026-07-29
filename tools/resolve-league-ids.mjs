#!/usr/bin/env node
// Résout les ids API-Football des championnats que le SITE affiche déjà
// (data/standings/manifest.json), pour que l'archivage des matchs (session
// "SEO — archive matchs") ne stocke que des compétitions pertinentes, pas
// absolument tous les matchs de la planète (jeunes, réserves...).
//
// Économe : UNE requête /leagues par pays (150 pays ~= 150 requêtes,
// mises en cache 24h côté proxy — relancer dans la journée ne coûte rien).
// Le nom du championnat renvoyé par l'API doit correspondre EXACTEMENT à
// une clé de data/standings/{pays}.json (c'est cette même requête qui a
// produit ces noms lors du pipeline classements, donc ça matche déjà bien).
//
// Usage : node tools/resolve-league-ids.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://ninjascores.com/api/foot';
const MANIFEST = path.join(ROOT, 'data', 'standings', 'manifest.json');
const ALIAS = path.join(ROOT, 'tools', 'alias-pays.json');
const SORTIE = path.join(ROOT, 'data', 'league-ids.json');

const dors = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${BASE}?${qs}`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return j.response || [];
}

function apiCountryName(cleManifest, alias) {
  // API-Football utilise le MÊME format que la clé du manifeste (avec
  // tiret, ex "South-Africa") : c'est le candidat prioritaire. La forme
  // espacée et les alias connus servent de repli.
  const espace = cleManifest.replace(/-/g, ' ');
  const candidats = [cleManifest, espace];
  for (const [court, variantes] of Object.entries(alias)) {
    if (court === '_commentaire') continue;
    if (cleManifest === court || espace === court) candidats.push(...variantes.filter((v) => !v.match(/[àâäéèêëïîôöùûüç]/i)));
  }
  return candidats;
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const alias = JSON.parse(fs.readFileSync(ALIAS, 'utf8'));
  const pays = manifest.pays;
  const clesPays = Object.keys(pays);

  const out = {}; // leagueId -> {country, countryKey, name}
  const nonResolus = [];
  let requetes = 0;

  for (const clePays of clesPays) {
    const info = pays[clePays];
    const nomsLigues = new Set(Object.keys(info.ligues || {}));
    if (!nomsLigues.size) continue;

    const candidats = apiCountryName(clePays, alias);
    let ligues = [];
    let pays_utilise = null;
    for (const cand of candidats) {
      try {
        ligues = await api({ path: 'leagues', country: cand });
        requetes++;
        if (ligues.length) { pays_utilise = cand; break; }
      } catch (e) { /* essaie le candidat suivant */ }
      await dors(120);
    }

    if (!ligues.length) { nonResolus.push(clePays); continue; }

    let matches = 0;
    for (const l of ligues) {
      const nom = l.league && l.league.name;
      const id = l.league && l.league.id;
      if (!nom || !id) continue;
      if (nomsLigues.has(nom)) {
        out[id] = { country: info.nom, countryKey: clePays, name: nom };
        matches++;
      }
    }
    if (!matches) nonResolus.push(clePays + ' (0 correspondance sur ' + ligues.length + ')');
    await dors(120);
  }

  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, JSON.stringify(out));
  console.log('requêtes API :', requetes);
  console.log('ligues résolues :', Object.keys(out).length);
  console.log('pays non résolus (' + nonResolus.length + ') :', nonResolus.join(', '));
  console.log('écrit ->', SORTIE);
}

main().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
