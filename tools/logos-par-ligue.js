#!/usr/bin/env node
// Derniere passe sur les ecussons manquants, par championnat et saison.
//
// La recherche par nom est ambigue : deux clubs costariciens s'appellent
// "Guadalupe". Demander la liste des equipes d'un championnat-saison precis
// leve le doute — l'equipe cherchee y figure forcement, puisqu'on l'a lue
// dans ce classement.
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const DIR = path.join(RACINE, 'data', 'standings');
const OVER = path.join(__dirname, 'logos-override.json');
const BASE = 'https://ninjascores.com/api/foot';
let depense = 0;

const SPEC = { 'İ':'I','ı':'i','ğ':'g','ş':'s','ə':'e','ç':'c','ö':'o','ü':'u','ł':'l','ø':'o','å':'a','đ':'d','ț':'t','ș':'s' };
const norm = (x) => String(x || '').split('').map((c) => SPEC[c] || c).join('')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\b(fc|sc|cf|ac|as|sk|fk|club|deportivo|cd)\b/gi, ' ')
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

  // 1. recenser : equipe -> toutes les (ligue, saison) ou elle apparait
  const besoin = new Map();
  for (const [cle, info] of Object.entries(man)) {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, info.fichier), 'utf8'));
    const L = d._logos || {};
    for (const [ligue, saisons] of Object.entries(d)) {
      if (ligue.startsWith('_')) continue;
      for (const [saison, lignes] of Object.entries(saisons)) {
        for (const r of lignes) {
          if (!r.team || L[r.team]) continue;
          const k = cle + '||' + r.team;
          if (!besoin.has(k)) besoin.set(k, { cle, pays: info.nom, equipe: r.team, ou: [] });
          const e = besoin.get(k);
          if (e.ou.length < 3) e.ou.push({ ligue, saison });
        }
      }
    }
  }
  console.log(`${besoin.size} equipes sans ecusson\n`);

  // 2. identifiants de championnat, une requete par pays
  const ids = {};
  const trouves = {};
  let n = 0;

  for (const e of besoin.values()) {
    if (!ids[e.cle]) {
      try {
        const j = await api({ path: 'leagues', country: e.cle.replace(/\s+/g, '-') });
        ids[e.cle] = {};
        (j.response || []).forEach((l) => { ids[e.cle][l.league.name] = l.league.id; });
      } catch (err) { ids[e.cle] = {}; }
    }
    for (const o of e.ou) {
      const id = ids[e.cle][o.ligue];
      if (!id) continue;
      const annee = parseInt(String(o.saison).slice(0, 4), 10);
      try {
        const j = await api({ path: 'teams', league: id, season: annee });
        // Comparaison normalisee : le perimetre est UN championnat-saison,
        // ou l'equipe figure forcement. Aucun risque de confondre avec un
        // club etranger, contrairement a une recherche par nom globale.
        const cand = (j.response || []).filter((x) => x.team && x.team.logo
          && norm(x.team.name) === norm(e.equipe));
        const t = cand.length === 1 ? cand[0] : null;
        if (t) {
          (over[e.cle] = over[e.cle] || {})[e.equipe] = t.team.logo;
          trouves[e.pays] = (trouves[e.pays] || 0) + 1;
          n++;
          break;
        }
      } catch (err) { /* saison indisponible */ }
    }
  }

  fs.writeFileSync(OVER, JSON.stringify(over, null, 1));
  console.log(`${n} ecussons retrouves · ${depense} requetes\n`);
  Object.entries(trouves).sort((a, b) => b[1] - a[1]).forEach(([p, c]) => console.log(`  ${p} : ${c}`));
})();
