#!/usr/bin/env node
// Detecte TOUS les ecussons generiques, quelle que soit leur empreinte.
//
// Le fournisseur sert plusieurs variantes de son image "image not available"
// (tailles/formats differents = empreintes differentes). Chasser les
// empreintes une par une est sans fin. Principe fiable : un VRAI ecusson est
// unique ; une image partagee par plusieurs clubs distincts est generique.
//
// On telecharge chaque ecusson distinct, on groupe par empreinte md5, et toute
// empreinte utilisee par 2 clubs ou plus est un placeholder. La liste des
// empreintes est ecrite dans tools/placeholder-hashes.json ; split.js s'en
// sert ensuite a chaque regeneration, sans retelecharger.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..', 'data', 'standings');
const SORTIE = path.join(__dirname, 'placeholder-urls.json');
const PARALLELE = 16;

async function md5(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return crypto.createHash('md5').update(Buffer.from(await r.arrayBuffer())).digest('hex');
  } catch (e) { return null; }
}

(async () => {
  const man = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).pays;
  const parUrl = new Map();                       // url -> {equipes:Set, pays:Set}
  for (const [cle, info] of Object.entries(man)) {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, info.fichier), 'utf8'));
    for (const [eq, url] of Object.entries(d._logos || {})) {
      if (!parUrl.has(url)) parUrl.set(url, { equipes: new Set(), pays: new Set() });
      parUrl.get(url).equipes.add(cle + '|' + eq);
      parUrl.get(url).pays.add(cle);
    }
  }
  const urls = [...parUrl.keys()];
  console.log(`${urls.length} ecussons distincts a controler`);

  const emp = {};                                 // empreinte -> Set d'urls
  let i = 0, faits = 0;
  await Promise.all(Array.from({ length: PARALLELE }, async () => {
    while (i < urls.length) {
      const u = urls[i++];
      const h = await md5(u);
      if (h) { (emp[h] = emp[h] || new Set()).add(u); }
      if (++faits % 500 === 0) console.log(`  ${faits}/${urls.length}`);
    }
  }));

  // une empreinte partagee par plusieurs equipes distinctes = generique
  // Un vrai logo partage l'est par des variantes de nom d'UN meme club (donc
  // un seul pays). Une image generique apparait dans PLUSIEURS pays.
  const placeholders = [];
  for (const [h, us] of Object.entries(emp)) {
    const pays = new Set(); let equipes = 0;
    for (const u of us) { const o = parUrl.get(u); equipes += o.equipes.size; for (const p of o.pays) pays.add(p); }
    if (pays.size >= 2) placeholders.push({ hash: h, urls: [...us], pays: pays.size, equipes });
  }
  placeholders.sort((a, b) => b.equipes - a.equipes);

  const urlsGeneriques = placeholders.flatMap((p) => p.urls).sort();
  fs.writeFileSync(SORTIE, JSON.stringify(urlsGeneriques, null, 1));
  const total = placeholders.reduce((a, p) => a + p.equipes, 0);
  console.log(`\n${placeholders.length} images generiques, ${total} equipes concernees`);
  placeholders.slice(0, 10).forEach((p) => console.log(`  ${p.hash.slice(0,8)} : ${p.equipes} equipes sur ${p.pays} pays`));
})();
