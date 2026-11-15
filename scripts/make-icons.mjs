// Renders public/icon.svg into the PNG sizes the PWA manifest needs (uses Playwright's Chromium).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright'); // pre-installed globally, or: npm i -D playwright
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const out = (f) => new URL(`../public/${f}`, import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage();

async function shot(file, size, { maskable = false, rounded = true } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const inner = maskable ? Math.round(size * 0.78) : size;
  let body = svg;
  if (!rounded || maskable) body = svg.replace('rx="112"', 'rx="0"');
  await page.setContent(`<html><body style="margin:0;background:${maskable ? '#F5B700' : 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${body.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: out(file), omitBackground: !maskable });
}

await shot('icon-192.png', 192);
await shot('icon-512.png', 512);
await shot('icon-maskable-512.png', 512, { maskable: true });
await shot('apple-touch-icon.png', 180, { rounded: false });
await browser.close();
console.log('Icons written to public/');
