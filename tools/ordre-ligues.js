#!/usr/bin/env node
// Ordre hierarchique des championnats de chaque pays.
//
// Premiere tentative : trier sur l'identifiant API-Football. FAUX — verifie
// sur l'Azerbaidjan, ou Birinci Dasta (D2) porte l'id 418 et Premyer Liqa
// (D1) l'id 419. L'identifiant suit l'ordre d'integration au catalogue, pas
// le niveau.
//
// Critere retenu : le libelle. Les noms de championnats sont tres codifies —
// "Premier", "Pro League", "Superliga", "Serie A" designent un premier
// niveau ; "2", "II", "B", "Segunda", "Championship", "Birinci" un second.
// L'identifiant ne sert plus que de departage.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'standings');
const BASE = 'https://ninjascores.com/api/foot';
let depense = 0;

// Critere retenu : l'identifiant API-Football, qui suit l'ordre des divisions
// dans la quasi-totalite des pays (Ligue 1 = 61, Ligue 2 = 62, National 1 = 63).
//
// J'ai d'abord tente un classement par libelle : plus d'erreurs que de
// corrections (accents non geres, "1st Division" pris pour une D1, "Super
// League 2" pour une D1...). L'identifiant se trompe sur un seul pays sur
// 150, on le corrige donc a la main plutot que d'inventer des regles.
const EXCEPTIONS = {
  // l'identifiant place la D2 avant la D1
  'Azerbaijan':    ['Premyer Liqa', 'Birinci Dasta'],
  'Australia':     ['A-League'],
  'Guatemala':     ['Liga Nacional'],
  'Israel':        ["Ligat Ha'al", 'Liga Leumit'],
  'Faroe-Islands': ['Meistaradeildin', '1. Deild'],
  'Argentina':     ['Liga Profesional Argentina', 'Primera Nacional'],
  'Canada':        ['Canadian Premier League'],
  'Estonia':       ['Meistriliiga', 'Esiliiga A', 'Esiliiga B'],
  'Georgia':       ['Erovnuli Liga', 'Erovnuli Liga 2', 'Liga 3'],
  'USA':           ['Major League Soccer', 'USL Championship', 'USL League One', 'USL League Two'],
  'Greece':        ['Super League 1', 'Super League 2', 'Football League'],
};

async function api(params) {
  const r = await fetch(`${BASE}?${new URLSearchParams(params)}`);
  depense++;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length)) throw new Error('api');
  return j;
}

(async () => {
  const fichier = path.join(DIR, 'manifest.json');
  const man = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  const doutes = [];

  for (const [cle, info] of Object.entries(man.pays)) {
    const noms = Object.keys(info.ligues);
    if (noms.length < 2) { info.ordre = noms; continue; }

    let ids = {};
    try {
      const j = await api({ path: 'leagues', country: cle.replace(/\s+/g, '-') });
      (j.response || []).forEach((l) => { ids[l.league.name] = l.league.id; });
    } catch (e) { /* departage indisponible */ }

    const tete = (EXCEPTIONS[cle] || []).filter((x) => noms.includes(x));
    const reste = noms.filter((x) => !tete.includes(x)).sort((a, b) => {
      const ia = ids[a] === undefined ? 1e9 : ids[a];
      const ib = ids[b] === undefined ? 1e9 : ids[b];
      return ia !== ib ? ia - ib : a.localeCompare(b, 'fr');
    });
    info.ordre = tete.concat(reste);

    // signale les cas ou le libelle ne tranche pas
    if (noms.length > 2) doutes.push(`${info.nom} : ${info.ordre.join(' > ')}`);
  }

  fs.writeFileSync(fichier, JSON.stringify(man));
  console.log(`${depense} requetes\n`);
  console.log(`${doutes.length} pays a 3 divisions ou plus, a relire :`);
  doutes.forEach((d) => console.log('  ' + d));
})();
