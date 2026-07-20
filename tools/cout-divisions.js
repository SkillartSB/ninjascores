#!/usr/bin/env node
// Combien coute l'ajout des divisions inferieures ?
//
// La reprise ne retenait que DEUX championnats par pays, choisis sur le
// nombre de saisons. Le Bresil s'arrete donc en Serie B alors que le
// fournisseur a aussi les Series C et D.
//
// Ecueil : beaucoup de pays ont des competitions REGIONALES (Paulista,
// Gaucho, Carioca au Bresil) qui ne sont pas des divisions nationales.
// On les ecarte par leur identifiant : les competitions nationales ont
// ete integrees en premier au catalogue et portent donc les ids les plus bas.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'standings');
const BASE = 'https://ninjascores.com/api/foot';
let depense = 0;

const EST_FEM = /f[eé]min|women|femenin|frauen|damallsvenskan|\bnwsl\b|\bwsl\b/i;
const EST_JEUNE = /\bU\s?\d{2}\b|youth|junior|reserve|academy|\bII\b|\bB\b$/i;
// Competitions regionales : elles portent un suffixe de zone ou de groupe.
// "Serie C" est nationale, "Paulista - A1" et "Regionalliga - Bayern" non.
const EST_REGIONAL = /\s[-–]\s|\bgroup\b|\bgroupe\b|\bgrupo\b|\blohko\b|\bnpl\b|\bregionalliga\b|\bstaffel\b|\bzone\b|\bconference\b|\bwest\b|\beast\b|\bnorth\b|\bsouth\b/i;

async function api(params) {
  const r = await fetch(`${BASE}?${new URLSearchParams(params)}`);
  depense++;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length)) throw new Error('api');
  return j;
}

const MAX = parseInt(process.argv[2] || '4', 10);

(async () => {
  const man = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).pays;
  let saisonsSup = 0, paysConcernes = 0;
  const detail = [];

  for (const [cle, info] of Object.entries(man)) {
    try {
      const j = await api({ path: 'leagues', country: cle.replace(/\s+/g, '-') });
      const ligues = (j.response || [])
        .filter((l) => l.league.type === 'League'
          && !EST_FEM.test(l.league.name) && !EST_JEUNE.test(l.league.name)
          && !EST_REGIONAL.test(l.league.name))
        .map((l) => ({ id: l.league.id, nom: l.league.name,
          saisons: l.seasons.filter((s) => s.year >= 2010 && s.coverage && s.coverage.standings).length }))
        .filter((l) => l.saisons > 0)
        .sort((a, b) => a.id - b.id)
        .slice(0, MAX);

      const dejaLa = new Set(Object.keys(info.ligues));
      const neuves = ligues.filter((l) => !dejaLa.has(l.nom));
      if (neuves.length) {
        paysConcernes++;
        const n = neuves.reduce((a, l) => a + l.saisons, 0);
        saisonsSup += n;
        detail.push(`${info.nom} : +${neuves.map((l) => l.nom).join(', ')} (${n} saisons)`);
      }
    } catch (e) { /* pays hors catalogue */ }
  }

  console.log(`Plafond a ${MAX} championnats par pays`);
  console.log(`${paysConcernes} pays gagneraient au moins une division`);
  console.log(`${saisonsSup} saisons supplementaires a telecharger`);
  console.log(`(soit ${saisonsSup + depense} requetes environ, quota 7500/jour)\n`);
  detail.slice(0, 25).forEach((d) => console.log('  ' + d));
})();
