// Renders public/icon.svg into the source images @capacitor/assets needs (assets/*.png).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'public/icon.svg'), 'utf8');
const square = svg.replace('rx="112"', 'rx="0"');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const shot = async (file, size, html) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:transparent">${html}</body></html>`);
    await p.screenshot({ path: path.join(root, 'assets', file), omitBackground: true });
  };
  const inner = (s, w) => s.replace('<svg ', `<svg width="${w}" height="${w}" `);
  await shot('icon-only.png', 1024, inner(square, 1024));
  const bg = (svg.match(/<rect width="512" height="512"[^>]*fill="([^"]+)"/) || [])[1] || '#4E9A3E';
  await shot('icon-background.png', 1024, `<div style="width:1024px;height:1024px;background:${bg}"></div>`);
  // Foreground = the artwork only, scaled into Android's safe zone (inner ~66%).
  await shot('icon-foreground.png', 1024, inner(square.replace(/<rect width="512" height="512"[^>]*\/>/, ''), 640));
  await shot('splash.png', 2732, `<div style="width:2732px;height:2732px;background:#FFF8EF;display:grid;place-items:center">${inner(svg, 520)}</div>`);
  await shot('splash-dark.png', 2732, `<div style="width:2732px;height:2732px;background:#3B2314;display:grid;place-items:center">${inner(svg, 520)}</div>`);
  await b.close();
  console.log('assets/ ready');
})();
