// Rasterizes public/icons/icon.svg into the web app's PNG icons (apple-touch-icon, manifest): full-bleed and
// opaque, because iOS masks the corners itself and fills transparency with black. Run: node scripts/app-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { findChrome, launchChrome } from './lib/chrome.mjs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const SIZES = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };
const browser = await launchChrome({ executablePath: findChrome(), headless: 'new', maxSeconds: 60 });
try {
  const page = await browser.newPage();
  for (const [name, px] of Object.entries(SIZES)) {
    await page.setViewport({ width: px, height: px, deviceScaleFactor: 1 });
    await page.setContent(
      `<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${px}" height="${px}" `)}</body></html>`,
    );
    writeFileSync(`public/icons/${name}`, await page.screenshot({ type: 'png', omitBackground: false }));
    console.log(`public/icons/${name} ${px}px`);
  }
} finally {
  await browser.close();
}
