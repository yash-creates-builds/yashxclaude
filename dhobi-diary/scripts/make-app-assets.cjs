// Renders public/icon.svg into the source images @capacitor/assets needs (assets/*.png).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'public/icon.svg'), 'utf8');
const square = svg.replace('rx="112"', 'rx="0"');
const sized = (s, w) => s.replace('<svg ', `<svg width="${w}" height="${w}" `);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const shot = async (file, size, html) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:transparent">${html}</body></html>`);
    await p.screenshot({ path: path.join(root, 'assets', file), omitBackground: true });
  };
  await shot('icon-only.png', 1024, sized(square, 1024));
  await shot('icon-background.png', 1024, '<div style="width:1024px;height:1024px;background:#22D07B"></div>');
  // Foreground = artwork without the background square, scaled into Android's safe zone.
  await shot('icon-foreground.png', 1024, sized(square.replace(/<rect width="512" height="512"[^>]*\/>/, ''), 680));
  await shot('splash.png', 2732, `<div style="width:2732px;height:2732px;background:#F2F5F8;display:grid;place-items:center">${sized(svg, 560)}</div>`);
  await shot('splash-dark.png', 2732, `<div style="width:2732px;height:2732px;background:#141414;display:grid;place-items:center">${sized(svg, 560)}</div>`);
  // Play Store icon (512×512, no transparency)
  fs.mkdirSync(path.join(root, 'store'), { recursive: true });
  await p.setViewportSize({ width: 512, height: 512 });
  await p.setContent(`<html><body style="margin:0">${sized(square, 512)}</body></html>`);
  await p.screenshot({ path: path.join(root, 'store', 'icon-512.png') });
  await b.close();
  console.log('assets/ ready');
})();
