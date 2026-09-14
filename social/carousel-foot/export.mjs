/**
 * Export des visuels en PNG prêts à poster.
 *
 *   node social/carousel-foot/export.mjs          → tout
 *   node social/carousel-foot/export.mjs ig       → carrousel 1080×1350 (Instagram)
 *   node social/carousel-foot/export.mjs 9x16     → carrousel 1080×1920 (TikTok)
 *   node social/carousel-foot/export.mjs story    → la story unique 1080×1920
 *
 * Sortie : social/carousel-foot/out/<cible>/01.png …
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CIBLES = {
  ig:    { page: 'index.html', height: 1350, query: 'format=ig',    dir: 'carrousel-4x5'  },
  '9x16':{ page: 'index.html', height: 1920, query: 'format=story', dir: 'carrousel-9x16' },
  story: { page: 'story.html', height: 1920, query: '',             dir: 'story'          },
};

const arg = (process.argv[2] || 'tout').toLowerCase();
const wanted = arg in CIBLES ? [arg] : Object.keys(CIBLES);

const browser = await chromium.launch();

for (const nom of wanted) {
  const { page: fichier, height, query, dir } = CIBLES[nom];
  const outDir = join(HERE, 'out', dir);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const page = await browser.newPage({
    viewport: { width: 1080, height },
    deviceScaleFactor: 1,
  });
  const url = `file://${join(HERE, fichier)}?export=1&${query}`;
  await page.goto(url, { waitUntil: 'networkidle' });

  // polices + écussons réellement peints avant la capture
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(
    [...document.images].map(img => img.complete
      ? null
      : new Promise(r => { img.onload = img.onerror = r; }))
  ));
  await page.waitForTimeout(400);

  const slides = await page.$$('.slide');
  for (const [i, slide] of slides.entries()) {
    const file = join(outDir, String(i + 1).padStart(2, '0') + '.png');
    await slide.screenshot({ path: file, animations: 'disabled' });
    console.log('✓', `${dir}/${String(i + 1).padStart(2, '0')}.png`);
  }
  await page.close();
}

await browser.close();
console.log('\nTerminé →', join(HERE, 'out'));
