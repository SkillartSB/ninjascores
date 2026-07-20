#!/usr/bin/env node
// Sofascore bloque le hotlinking : les 898 URL api.sofascore.app de la table
// de logos echouent toutes, l'equipe retombe sur son initiale. On les remplace
// par les ecussons API-Football.
//
// Etape 1 : celles qu'on connait deja via logos.json (issu des classements).
// Etape 2 : les autres, par recherche nominative a correspondance stricte.
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const LOGOS = path.join(RACINE, 'data', 'standings', 'logos.json');
const BASE = 'https://ninjascores.com/api/foot';
let depense = 0;

const SPECIAUX = { 'İ':'I','ı':'i','ğ':'g','Ğ':'G','ş':'s','Ş':'S','ə':'e','Ə':'E',
  'ç':'c','Ç':'C','ö':'o','Ö':'O','ü':'u','Ü':'U','ł':'l','Ł':'L','ø':'o','å':'a',
  'æ':'ae','ß':'ss','đ':'d','ț':'t','ș':'s' };

function norm(s) {
  return String(s || '')
    .split('').map((c) => (SPECIAUX[c] !== undefined ? SPECIAUX[c] : c)).join('')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();
}

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
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  const logos = JSON.parse(fs.readFileSync(LOGOS, 'utf8'));
  const parNorm = {};
  for (const [k, v] of Object.entries(logos)) parNorm[norm(k)] = v;

  const paires = [...html.matchAll(/"([^"]+)"\s*:\s*"(https:\/\/api\.sofascore\.app[^"]+)"/g)]
    .map((m) => m[1]);
  const inconnues = paires.filter((n) => !logos[n] && !parNorm[norm(n)]);
  console.log(`${paires.length} entrees sofascore, ${inconnues.length} sans equivalent connu\n`);

  let ajoutes = 0;
  for (const nom of inconnues) {
    const q = norm(nom);
    if (q.length < 3) continue;
    try {
      const j = await api({ path: 'teams', search: q });
      const exact = (j.response || [])
        .filter((t) => t.team && t.team.logo && norm(t.team.name) === q);
      if (exact.length === 1) {
        logos[nom] = exact[0].team.logo;
        parNorm[q] = exact[0].team.logo;
        ajoutes++;
      }
    } catch (e) { /* nom trop court ou absent du catalogue */ }
  }

  fs.writeFileSync(LOGOS, JSON.stringify(logos));
  console.log(`${ajoutes} ecussons ajoutes · ${depense} requetes`);
  console.log(`logos.json contient maintenant ${Object.keys(logos).length} equipes`);
})();
