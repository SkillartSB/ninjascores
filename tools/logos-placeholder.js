#!/usr/bin/env node
// Detecte les ecussons qui ne sont pas des ecussons.
//
// Quand le fournisseur n'a pas le blason d'un club, il ne renvoie pas une
// erreur : il sert une image generique "image not available" (appareil photo
// gris). Cote site, on affiche donc une vignette grise inutile la ou une
// initiale serait plus claire.
//
// Le fichier fait exactement 90381 octets et porte toujours la meme empreinte.
// On teste la taille par HEAD (rapide), puis on confirme par empreinte.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..', 'data', 'standings');
const OVER = path.join(__dirname, 'logos-override.json');
const TAILLE = 90381;
const EMPREINTE = 'a3208b617675b595f3d1a11c7d6642fb';
const PARALLELE = 12;

async function taille(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (!r.ok) return -1;
    return parseInt(r.headers.get('content-length') || '0', 10);
  } catch (e) { return -1; }
}
async function empreinte(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return crypto.createHash('md5').update(buf).digest('hex');
  } catch (e) { return null; }
}

(async () => {
  const man = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).pays;
  const over = JSON.parse(fs.readFileSync(OVER, 'utf8'));

  // url -> [{cle, equipe}]
  const parUrl = new Map();
  for (const [cle, info] of Object.entries(man)) {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, info.fichier), 'utf8'));
    for (const [equipe, url] of Object.entries(d._logos || {})) {
      if (!parUrl.has(url)) parUrl.set(url, []);
      parUrl.get(url).push({ cle, equipe, pays: info.nom });
    }
  }
  const urls = [...parUrl.keys()];
  console.log(`${urls.length} ecussons distincts a controler`);

  const suspects = [];
  let i = 0;
  await Promise.all(Array.from({ length: PARALLELE }, async () => {
    while (i < urls.length) {
      const u = urls[i++];
      if (await taille(u) === TAILLE) suspects.push(u);
    }
  }));
  console.log(`${suspects.length} de la taille du placeholder, verification de l'empreinte...`);

  const faux = [];
  let j = 0;
  await Promise.all(Array.from({ length: PARALLELE }, async () => {
    while (j < suspects.length) {
      const u = suspects[j++];
      if (await empreinte(u) === EMPREINTE) faux.push(u);
    }
  }));

  let n = 0;
  const parPays = {};
  for (const u of faux) {
    for (const { cle, equipe, pays } of parUrl.get(u)) {
      (over[cle] = over[cle] || {})[equipe] = null;   // null = retirer
      parPays[pays] = (parPays[pays] || 0) + 1;
      n++;
    }
  }
  fs.writeFileSync(OVER, JSON.stringify(over, null, 1));

  console.log(`\n${faux.length} URL sont le placeholder, ${n} equipes concernees`);
  Object.entries(parPays).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([p, c]) => console.log(`  ${p} : ${c}`));
})();
