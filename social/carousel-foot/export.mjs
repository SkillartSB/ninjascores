/**
 * Export du carrousel en PNG prêts à poster.
 *
 *   node social/carousel-foot/export.mjs            → 1080×1350 (Instagram)
 *   node social/carousel-foot/export.mjs story      → 1080×1920 (TikTok / Stories)
 *   node social/carousel-foot/export.mjs both
 *
 * Sortie : social/carousel-foot/out/<format>/01.png … 07.png
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FORMATS = { ig: 1350, story: 1920 };

const arg = (process.argv[2] || 'ig').toLowerCase();
const wanted = arg === 'both' ? ['ig', 'story'] : [arg in FORMATS ? arg : 'ig'];

const browser = await chromium.launch();

for (const fmt of wanted) {
  const height = FORMATS[fmt];
  const outDir = join(HERE, 'out', fmt);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const page = await browser.newPage({
    viewport: { width: 1080, height },
    deviceScaleFactor: 1,
  });
  const url = `file://${join(HERE, 'index.html')}?export=1&format=${fmt === 'story' ? 'story' : 'ig'}`;
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
    console.log('✓', `${fmt}/${String(i + 1).padStart(2, '0')}.png`);
  }
  await page.close();
}

await browser.close();
console.log('\nTerminé →', join(HERE, 'out'));
