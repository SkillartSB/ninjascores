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

// Plus le score est bas, plus le championnat est haut dans la hierarchie.
const NIVEAU_2 = [
  /\b2\b/, /\bii\b/, /\bsegunda\b/, /\bserie b\b/, /\bliga ?2\b/, /\b2\. ?liga\b/,
  /\bchampionship\b/, /\bbirinci\b/, /\b1st division\b/, /\bdivision 1\b/,
  /\bprimera b\b/, /\bnacional\b/, /\bchallenger\b/, /\bpersha\b/, /\bfirst league\b/,
  /\bnational 1\b/, /\b1\. ?lig\b/, /\b1\. ?division\b/, /\bligue 2\b/, /\bliga i+\b/,
  /\bsecond\b/, /\bmetropolitana\b/, /\besiliiga\b/, /\bsuper league 2\b/,
];
const NIVEAU_1 = [
  /\bpremier\b/, /\bpremyer\b/, /\bpro league\b/, /\bsuper ?li[gq]/, /\bsuperliga\b/,
  /\bprimera divisi/, /\bprimera a\b/, /\bserie a\b/, /\bligue 1\b/, /\bliga 1\b/,
  /\bla liga\b/, /\bbundesliga\b/, /\beredivisie\b/, /\bmeistriliiga\b/,
  /\bekstraklasa\b/, /\ballsvenskan\b/, /\beliteserien\b/, /\bbotola pro\b/,
  /\bvirsliga\b/, /\ba lyga\b/, /\bveikkausliiga\b/, /\bsuperettan\b/,
  /\belite one\b/, /\bk league 1\b/, /\bj1\b/, /\bliga profesional\b/,
  /\bsuper league\b/, /\bprofesional\b/, /\bligi kuu\b/, /\b1a divisi/,
];

function niveau(nom) {
  const n = String(nom || '').toLowerCase();
  // Le niveau 2 est teste en premier : "Super League 2" doit compter comme D2
  // malgre le mot "Super".
  if (NIVEAU_2.some((r) => r.test(n))) return 2;
  if (NIVEAU_1.some((r) => r.test(n))) return 1;
  return 1.5;                                  // inconnu : entre les deux
}

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

    info.ordre = noms.slice().sort((a, b) => {
      const na = niveau(a), nb = niveau(b);
      if (na !== nb) return na - nb;
      const ia = ids[a] === undefined ? 1e9 : ids[a];
      const ib = ids[b] === undefined ? 1e9 : ids[b];
      return ia !== ib ? ia - ib : a.localeCompare(b, 'fr');
    });

    // signale les cas ou le libelle ne tranche pas
    const niveaux = noms.map(niveau);
    if (new Set(niveaux).size === 1) doutes.push(`${info.nom} : ${info.ordre.join(' > ')}`);
  }

  fs.writeFileSync(fichier, JSON.stringify(man));
  console.log(`${depense} requetes\n`);
  console.log(`${doutes.length} pays ou le libelle ne tranche pas (departage par identifiant) :`);
  doutes.forEach((d) => console.log('  ' + d));
})();
