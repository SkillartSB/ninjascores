// Recuperation des logos officiels des tournois de tennis.
//
// Source : le site officiel de chaque tournoi (apple-touch-icon, og:image ou
// logo de l'en-tete). Ce sont les marques officielles, servies par les
// organisateurs eux-memes, utilisees ici pour identifier le tournoi dans les
// listes — meme usage que Flashscore ou Sofascore.
//
// Usage : node tools/logos-tennis.mjs [--dry]
// Ecrit les images dans assets/logos/tennis/tournois/<slug>.<ext> et la table
// data/tennis-logos.json (slug -> fichier), consommee par assets/inline/s14.js.
import fs from 'node:fs/promises';
import path from 'node:path';

const RACINE = path.resolve(import.meta.dirname, '..');
const DOSSIER = path.join(RACINE, 'assets/logos/tennis/tournois');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

// slug -> { sites: [urls candidats], wiki: [fichiers Wikipedia/Commons en secours] }
const TOURNOIS = {
  // ── Grands Chelems ──
  'australian-open': { sites: ['https://ausopen.com/'], wiki: ['Australian Open Logo 2017.svg'] },
  'roland-garros': { sites: ['https://www.rolandgarros.com/en-us', 'https://www.rolandgarros.com/fr-fr'] },
  wimbledon: { sites: ['https://www.wimbledon.com/index.html', 'https://www.wimbledon.com/'] },
  'us-open': { sites: ['https://www.usopen.org/'], wiki: ['Usopen-horizontal-logo.svg'] },
  // ── Finals ──
  'atp-finals': { sites: ['https://www.nittoatpfinals.com/', 'https://nittoatpfinals.com/'] },
  'wta-finals': { sites: ['https://www.wtafinals.com/'] },
  'next-gen-finals': { sites: ['https://www.nextgenatpfinals.com/'] },
  // ── Masters 1000 / WTA 1000 ──
  'indian-wells': { sites: ['https://bnpparibasopen.com/'] },
  miami: { sites: ['https://www.miamiopen.com/'], wiki: ['Miami Open logo.png'] },
  'monte-carlo': { sites: ['https://rolexmontecarlomasters.mc/en', 'https://rolexmontecarlomasters.mc/'], wiki: ['Rolex Monte-Carlo Masters 2026.png'] },
  madrid: { sites: ['https://www.madrid-open.com/en/', 'https://www.mutuamadridopen.com/'], wiki: ['Logo Mutua Madrid Open.png'] },
  rome: { sites: ['https://internazionalibnlditalia.com/'] },
  canada: { sites: ['https://nationalbankopen.com/'] },
  cincinnati: { sites: ['https://cincinnatiopen.com/'], wiki: ['Cincinnati Open logo.svg'] },
  shanghai: { sites: ['https://www.rolexshanghaimasters.com/en/'], wiki: ['Shanghai Masters logo 2024.png'] },
  paris: { sites: ['https://www.rolexparismasters.com/en/', 'https://www.rolexparismasters.com/'] },
  beijing: { sites: ['https://www.chinaopen.com.cn/'], wiki: ['China Open logo.png'] },
  wuhan: { sites: ['https://www.wuhanopen.org/'], wiki: ['WTAWuhanTennisOpen.top logo01.PNG'] },
  dubai: { sites: ['https://dubaidutyfreetennischampionships.com/'] },
  doha: { sites: ['https://qatartennis.org/', 'https://www.qatartennis.org/'] },
  // ── 500 ──
  'abu-dhabi': { sites: ['https://mubadalaabudhabiopen.com/'] },
  acapulco: { sites: ['https://abiertomexicanodetenis.com/'] },
  adelaide: { sites: ['https://adelaideinternational.com.au/'] },
  'bad-homburg': { sites: ['https://badhomburgopen.com/'] },
  barcelona: { sites: ['https://www.barcelonaopenbancsabadell.com/en/'] },
  basel: { sites: ['https://www.swissindoorsbasel.ch/en/'] },
  berlin: { sites: ['https://berlin-open.com/', 'https://www.ecotrans-ladies.de/'] },
  brisbane: { sites: ['https://brisbaneinternational.com.au/'] },
  charleston: { sites: ['https://www.creditonecharlestonopen.com/'] },
  chengdu: { sites: ['https://www.chengduopen.org/'] },
  cleveland: { sites: ['https://www.tennisintheland.com/'] },
  dallas: { sites: ['https://dallasopen.com/'] },
  eastbourne: { sites: ['https://www.lta.org.uk/fan-zone/international/lexus-eastbourne-open/'] },
  guadalajara: { sites: ['https://guadalajaraopenakron.com/'] },
  halle: { sites: ['https://www.terrawortmann-open.de/en/', 'https://www.terrawortmann-open.de/'] },
  hamburg: { sites: ['https://www.hamburg-open.com/en/', 'https://www.hamburg-open.com/'] },
  hangzhou: { sites: ['https://www.hangzhouopen.cn/'] },
  linz: { sites: ['https://www.upperaustriaopen.at/', 'https://www.upperaustrialadies.at/'] },
  london: { sites: ['https://www.lta.org.uk/fan-zone/international/hsbc-championships/'] },
  merida: { sites: ['https://meridaopen.mx/'] },
  monterrey: { sites: ['https://abiertomonterrey.mx/', 'https://www.abiertognp.mx/'] },
  munich: { sites: ['https://www.bmwopen.de/en/', 'https://www.bmwopen.de/'] },
  ningbo: { sites: ['https://www.ningboopen.cn/'] },
  'rio-de-janeiro': { sites: ['https://riopen.com.br/'] },
  rotterdam: { sites: ['https://www.abnamroopen.nl/en/', 'https://www.abnamro-open.nl/'] },
  seoul: { sites: ['https://koreaopentennis.com/', 'https://www.koreaopentennis.com/'] },
  strasbourg: { sites: ['https://www.internationaux-strasbourg.fr/'] },
  stuttgart: { sites: ['https://www.porsche-tennis.com/en/', 'https://www.porsche-tennis.com/'] },
  tokyo: { sites: ['https://www.rakutenopen.jp/en/', 'https://toray-ppo.com/en/'] },
  vienna: { sites: ['https://www.erstebank-open.com/en/', 'https://www.erstebank-open.com/'] },
  washington: { sites: ['https://mubadalacitidcopen.com/'] },
  // ── Par equipes / exhibitions ──
  'davis-cup': { sites: ['https://www.daviscup.com/'] },
  'bjk-cup': { sites: ['https://www.billiejeankingcup.com/'] },
  'laver-cup': { sites: ['https://lavercup.com/'] },
  'united-cup': { sites: ['https://unitedcup.com/'] },
  'hopman-cup': { sites: ['https://www.hopmancup.com/'] },
};

async function recup(url, bin = false, timeout = 20000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: bin ? 'image/*,*/*' : 'text/html,*/*' }, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return bin ? Buffer.from(await r.arrayBuffer()) : r.text();
}
const absolu = (base, lien) => { try { return new URL(lien, base).href; } catch (e) { return null; } };

// Icones candidates d'une page, de la meilleure a la moins bonne.
function candidats(html, base) {
  const out = [];
  const liens = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (b, n) => (b.match(new RegExp(n + '=["\']([^"\']+)', 'i')) || [])[1];
  const icones = [];
  liens.forEach((b) => {
    const rel = (attr(b, 'rel') || '').toLowerCase();
    const href = attr(b, 'href');
    if (!href) return;
    if (/apple-touch-icon/.test(rel)) icones.push({ href, taille: parseInt((attr(b, 'sizes') || '180').split('x')[0], 10) || 180, prio: 1 });
    else if (/(^|\s)icon(\s|$)|shortcut icon|mask-icon/.test(rel)) icones.push({ href, taille: parseInt((attr(b, 'sizes') || '32').split('x')[0], 10) || 32, prio: /\.svg/i.test(href) ? 1 : 2 });
  });
  icones.sort((a, b) => a.prio - b.prio || b.taille - a.taille);
  icones.forEach((i) => out.push(absolu(base, i.href)));
  const og = (html.match(/<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)/i) || html.match(/<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image/i) || [])[1];
  if (og) out.push(absolu(base, og));
  out.push(absolu(base, '/apple-touch-icon.png'), absolu(base, '/favicon.ico'));
  return [...new Set(out.filter(Boolean))];
}

async function wikiUrl(fichier) {
  for (const hote of ['commons.wikimedia.org', 'en.wikipedia.org']) {
    try {
      const u = `https://${hote}/w/api.php?action=query&prop=imageinfo&iiprop=url&format=json&titles=` + encodeURIComponent('File:' + fichier);
      const j = JSON.parse(await recup(u));
      for (const p of Object.values(j.query.pages)) if (p.imageinfo) return p.imageinfo[0].url;
    } catch (e) { /* essai suivant */ }
  }
  return null;
}

function typeImage(buf) {
  if (buf.length < 12) return null;
  const t = buf.subarray(0, 12);
  if (t[0] === 0x89 && t[1] === 0x50) return 'png';
  if (t[0] === 0xff && t[1] === 0xd8) return 'jpg';
  if (t.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (t.subarray(0, 5).toString().toLowerCase() === '<?xml' || buf.subarray(0, 200).toString().toLowerCase().includes('<svg')) return 'svg';
  if (t[0] === 0x00 && t[1] === 0x00 && t[2] === 0x01) return 'ico';
  return null;
}

async function main() {
  const sec = process.argv.includes('--dry');
  await fs.mkdir(DOSSIER, { recursive: true });
  const table = {};
  const echecs = [];
  for (const [slug, cfg] of Object.entries(TOURNOIS)) {
    let trouve = null;
    for (const site of cfg.sites || []) {
      try {
        const html = await recup(site);
        for (const u of candidats(html, site).slice(0, 5)) {
          try {
            const buf = await recup(u, true, 15000);
            const type = typeImage(buf);
            if (!type || type === 'ico' || buf.length < 700) continue;
            trouve = { buf, type, source: u };
            break;
          } catch (e) { /* candidat suivant */ }
        }
      } catch (e) { /* site suivant */ }
      if (trouve) break;
    }
    if (!trouve) {
      for (const f of cfg.wiki || []) {
        const u = await wikiUrl(f);
        if (!u) continue;
        try {
          const buf = await recup(u, true, 20000);
          const type = typeImage(buf);
          if (type && buf.length > 700) { trouve = { buf, type, source: u }; break; }
        } catch (e) { /* suivant */ }
      }
    }
    if (!trouve) { echecs.push(slug); console.log(`  ${slug.padEnd(18)} AUCUN`); continue; }
    const nomFichier = slug + '.' + (trouve.type === 'svg' ? 'svg' : 'png');
    if (!sec) await fs.writeFile(path.join(DOSSIER, slug + '.brut'), trouve.buf);
    table[slug] = { fichier: nomFichier, type: trouve.type, source: trouve.source, octets: trouve.buf.length };
    console.log(`  ${slug.padEnd(18)} ${trouve.type.padEnd(4)} ${String(trouve.buf.length).padStart(7)} o  ${trouve.source.slice(0, 78)}`);
  }
  if (!sec) await fs.writeFile(path.join(DOSSIER, '_brut.json'), JSON.stringify(table, null, 1));
  console.log(`\n${Object.keys(table).length}/${Object.keys(TOURNOIS).length} logos recuperes. Echecs : ${echecs.join(', ') || 'aucun'}`);
}
main();
