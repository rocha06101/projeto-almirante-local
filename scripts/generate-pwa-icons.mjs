// Gera os ícones do PWA a partir do logo do clube (public/images/logo.png) usando o Chrome do sistema
// via Playwright. Uso: node scripts/generate-pwa-icons.mjs
//  - "any": logo sobre o azul da marca, com margem;
//  - "maskable": logo dentro da zona segura (~60%) para o SO poder recortar em círculo/squircle.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const out = join('public', 'icons', 'pwa');
mkdirSync(out, { recursive: true });

const logo = `data:image/png;base64,${readFileSync(join('public', 'images', 'logo.png')).toString('base64')}`;
const BACKGROUND = '#1e3a8a';

const variants = [
  { file: 'icon-192.png', size: 192, logoScale: 0.78 },
  { file: 'icon-512.png', size: 512, logoScale: 0.78 },
  { file: 'icon-maskable-192.png', size: 192, logoScale: 0.58 },
  { file: 'icon-maskable-512.png', size: 512, logoScale: 0.58 },
  { file: 'apple-touch-icon.png', size: 180, logoScale: 0.78 },
];

const browser = await chromium.launch({ channel: 'chrome' });

for (const { file, size, logoScale } of variants) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`
    <style>
      html, body { margin: 0; width: ${size}px; height: ${size}px; background: ${BACKGROUND}; }
      body { display: grid; place-items: center; }
      img { height: ${Math.round(size * logoScale)}px; width: auto; }
    </style>
    <img src="${logo}" alt="">`);
  await page.locator('img').evaluate(img => img.decode());
  await page.screenshot({ path: join(out, file) });
  await page.close();
}

await browser.close();
console.log(`Ícones gerados em ${out}`);
