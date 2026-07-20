#!/usr/bin/env node
// Ajoute les divisions nationales inferieures (Serie C/D, League One/Two,
// National 1, 3. Liga...) que la reprise initiale avait ecartees en se
// limitant a deux championnats par pays.
//
//   node tools/divisions-inf.js          liste ce qui serait ajoute
//   node tools/divisions-inf.js --faire  telecharge
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const DIR = path.join(RACINE, 'data', 'standings');
const SRC = path.join(RACINE, 'standings_api.json');
const BASE = 'https://ninjascores.com/api/foot';
const MAX = 4;
let depense = 0;

const EXCLUS = [
  /f[eé]min|women|femenin|frauen|kvinde|naisten|damallsvenskan|toppserien/i,
  /\bnwsl\b|\bwsl\b|\bwk-?league\b|kansallinen liiga|kvindeliga|\bw-?league\b/i,
  /\bU\s?\d{2}\b|youth|junior|reserve|academy/i,
  /\s[-–]\s/,                                   // suffixe de groupe ou de zone
  /\bgroup\b|\bgroupe\b|\bgrupo\b|\blohko\b|\bstaffel\b|\bzone\b|\bconference\b/i,
  /\bnpl\b|regionalliga|territory|queensland|provincial|coast|\bstate\b/i,
  /femenil|elitettan|\bnnsw\b|tasmania|calcutta|\bliga premier\b/i,
  // championnats d'Etat bresiliens et equivalents
  /acreano|amapaense|amazonense|paulista|ga[uú]cho|carioca|baiano|catarinense|paranaense|paraibano|mineiro|goiano|pernambucano|cearense|potiguar|sergipano|alagoano|maranhense|piauiense|capixaba|matogrossense|sul-?matogrossense|rondoniense|roraimense|tocantinense|brasiliense/i,
];
const rejete = (n) => EXCLUS.some((r) => r.test(n));

async function api(params) {
  const r = await fetch(`${BASE}?${new URLSearchParams(params)}`);
  depense++;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length)) throw new Error('api');
  return j;
}

const lib = (s) => {
  const a = new Date(s.start).getUTCFullYear(), b = new Date(s.end).getUTCFullYear();
  return a === b ? String(a) : `${a}/${String(b).slice(2)}`;
};

function normalise(rep) {
  if (!rep || !rep.length) return null;
  const g = rep[0].league && rep[0].league.standings;
  if (!g || !g.length) return null;
  const out = [];
  g.forEach((grp, gi) => grp.forEach((r) => out.push({
    rank: r.rank, team: r.team && r.team.name, logo: r.team && r.team.logo,
    played: r.all && r.all.played, won: r.all && r.all.win,
    drawn: r.all && r.all.draw, lost: r.all && r.all.lose,
    gd: String(r.goalsDiff > 0 ? '+' + r.goalsDiff : r.goalsDiff), pts: r.points,
    groupe: g.length > 1 ? (r.group || `Groupe ${gi + 1}`) : undefined,
  })));
  return out.length ? out : null;
}

(async () => {
  const faire = process.argv.includes('--faire');
  const man = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).pays;
  const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const plan = [];

  for (const [cle, info] of Object.entries(man)) {
    try {
      const j = await api({ path: 'leagues', country: cle.replace(/\s+/g, '-') });
      const ligues = (j.response || [])
        .filter((l) => l.league.type === 'League' && !rejete(l.league.name))
        .map((l) => ({ id: l.league.id, nom: l.league.name,
          saisons: l.seasons.filter((s) => s.year >= 2010 && s.coverage && s.coverage.standings) }))
        .filter((l) => l.saisons.length)
        .sort((a, b) => a.id - b.id)
        .slice(0, MAX);
      const dejaLa = new Set(Object.keys(info.ligues));
      const neuves = ligues.filter((l) => !dejaLa.has(l.nom));
      if (neuves.length) plan.push({ cle, nom: info.nom, neuves });
    } catch (e) { /* hors catalogue */ }
  }

  const total = plan.reduce((a, p) => a + p.neuves.reduce((b, l) => b + l.saisons.length, 0), 0);
  console.log(`${plan.length} pays · ${total} saisons a telecharger\n`);
  plan.forEach((p) => console.log(`  ${p.nom} : ${p.neuves.map((l) => l.nom).join(', ')}`));
  if (!faire) { console.log(`\n(simulation — relancer avec --faire)`); return; }

  console.log('\nTelechargement...');
  let ajoutees = 0;
  for (const p of plan) {
    for (const l of p.neuves) {
      const bloc = {};
      for (const s of l.saisons) {
        try {
          const st = await api({ path: 'standings', league: l.id, season: s.year });
          const lignes = normalise(st.response);
          if (lignes) bloc[lib(s)] = lignes;
        } catch (e) { /* saison indisponible */ }
      }
      if (Object.keys(bloc).length) {
        src[p.cle] = src[p.cle] || {};
        src[p.cle][l.nom] = bloc;
        ajoutees += Object.keys(bloc).length;
      }
    }
    fs.writeFileSync(SRC, JSON.stringify(src));
    console.log(`  ${p.nom} termine`);
  }
  console.log(`\n${ajoutees} saisons ajoutees · ${depense} requetes`);
})();
