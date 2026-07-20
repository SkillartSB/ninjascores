#!/usr/bin/env node
// Retrouve les ecussons restants par ELIMINATION dans un championnat-saison.
//
// La recherche par nom est trop risquee (deux "Al Ittihad", deux "Barcelona").
// Ici le perimetre est ferme : les equipes de notre classement et celles du
// fournisseur pour la MEME saison sont les memes, seuls les libelles
// different. On apparie donc :
//   1. les noms identiques,
//   2. ceux dont l'un contient l'autre de facon unique
//      (Ilves Tampere / Ilves, FC Lahti / Lahti),
//   3. et s'il ne reste qu'une equipe de chaque cote, l'appariement est force
//      (Vaasa PS / VPS).
// Tout residu ambigu est laisse sans ecusson.
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const DIR = path.join(RACINE, 'data', 'standings');
const OVER = path.join(__dirname, 'logos-override.json');
const BASE = 'https://ninjascores.com/api/foot';
let depense = 0;

const norm = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();

async function api(params) {
  const r = await fetch(`${BASE}?${new URLSearchParams(params)}`);
  depense++;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length)) throw new Error('api');
  return j;
}

(async () => {
  const man = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).pays;
  const over = JSON.parse(fs.readFileSync(OVER, 'utf8'));

  // ou chaque equipe sans ecusson apparait-elle ?
  const cible = new Map();          // "cle||ligue||saison" -> {cle, ligue, saison, manquants:[]}
  for (const [cle, info] of Object.entries(man)) {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, info.fichier), 'utf8'));
    const L = d._logos || {};
    for (const [ligue, saisons] of Object.entries(d)) {
      if (ligue.startsWith('_')) continue;
      for (const [saison, lignes] of Object.entries(saisons)) {
        const manque = lignes.filter((r) => r.team && !L[r.team] && !(over[cle] || {})[r.team]);
        if (!manque.length) continue;
        const k = `${cle}||${ligue}||${saison}`;
        cible.set(k, { cle, ligue, saison, pays: info.nom,
          tous: lignes.map((r) => r.team), manquants: manque.map((r) => r.team) });
      }
    }
  }
  console.log(`${cible.size} championnats-saisons a examiner\n`);

  const ids = {};
  let n = 0;
  const restants = [];

  for (const c of cible.values()) {
    if (!ids[c.cle]) {
      try {
        const j = await api({ path: 'leagues', country: c.cle.replace(/\s+/g, '-') });
        ids[c.cle] = {};
        (j.response || []).forEach((l) => { ids[c.cle][l.league.name] = l.league.id; });
      } catch (e) { ids[c.cle] = {}; }
    }
    const id = ids[c.cle][c.ligue];
    if (!id) { restants.push(...c.manquants); continue; }
    let leurs;
    try {
      const j = await api({ path: 'teams', league: id, season: parseInt(String(c.saison).slice(0, 4), 10) });
      leurs = (j.response || []).filter((t) => t.team && t.team.logo)
        .map((t) => ({ nom: t.team.name, logo: t.team.logo }));
    } catch (e) { restants.push(...c.manquants); continue; }
    if (!leurs.length) { restants.push(...c.manquants); continue; }

    // 1. appariement exact, puis par contenance unique
    const libres = leurs.filter((t) => !c.tous.includes(t.nom));
    const orphelins = c.tous.filter((t) => !leurs.some((x) => x.nom === t));

    const pris = new Set();
    const resolu = {};
    for (const o of orphelins) {
      const no = norm(o);
      const cands = libres.filter((t) => !pris.has(t.nom)
        && (norm(t.nom).includes(no) || no.includes(norm(t.nom))));
      if (cands.length === 1) { resolu[o] = cands[0]; pris.add(cands[0].nom); }
    }
    // 2. residu : s'il ne reste qu'un de chaque cote, c'est force
    const resteN = orphelins.filter((o) => !resolu[o]);
    const resteL = libres.filter((t) => !pris.has(t.nom));
    if (resteN.length === 1 && resteL.length === 1) resolu[resteN[0]] = resteL[0];

    for (const eq of c.manquants) {
      if (resolu[eq]) {
        (over[c.cle] = over[c.cle] || {})[eq] = resolu[eq].logo;
        n++;
      } else restants.push(`${c.pays} · ${eq}`);
    }
  }

  fs.writeFileSync(OVER, JSON.stringify(over, null, 1));
  console.log(`${n} ecussons retrouves · ${depense} requetes`);
  console.log(`${new Set(restants).size} equipes toujours sans ecusson`);
})();
