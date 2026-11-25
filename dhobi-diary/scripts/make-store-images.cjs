// Makes Google Play images from the real app with sample data:
//   store/screenshot-*.png (1080×1920) and store/feature-graphic-1024x500.png
// Usage: npm run build && npx vite preview --port 4180 &  then  node scripts/make-store-images.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const URL = process.env.URL || 'http://localhost:4180';
const out = path.join(__dirname, '..', 'store');
const iconPng = fs.readFileSync(path.join(__dirname, '..', 'public', 'icon-512.png')).toString('base64');

const iso = (daysAgo) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString().slice(0, 10); };
const R = { shirt: { iron: 10 }, pant: { iron: 10 }, kurta: { iron: 12 }, saree: { dry: 250 }, bedsheet: { wash: 50 }, towel: { wash: 20 } };
const L = (itemId, service, qty) => ({ itemId, service, qty, rate: R[itemId][service] });
const db = {
  schema: 1,
  settings: { lang: 'en', grandma: false, userName: 'Mummy', family: null, lastDhobiId: 'd1' },
  dhobis: [{ id: 'd1', name: 'Ramesh' }],
  customItems: [], paid: {},
  batches: [
    { id: 'b1', dhobiId: 'd1', date: iso(1), createdAt: 3, note: '', by: 'Mummy', lines: [L('shirt', 'iron', 6), L('pant', 'iron', 3), L('kurta', 'iron', 2)], received: null, receivedDate: null },
    { id: 'b2', dhobiId: 'd1', date: iso(4), createdAt: 2, note: '', by: 'Papa', lines: [L('bedsheet', 'wash', 2), L('towel', 'wash', 3), L('saree', 'dry', 1)],
      received: { 'bedsheet|wash': 2, 'towel|wash': 2, 'saree|dry': 1 }, receivedDate: iso(2), receipts: [{ date: iso(2), got: { 'bedsheet|wash': 2, 'towel|wash': 2, 'saree|dry': 1 }, by: 'Papa' }] },
    { id: 'b3', dhobiId: 'd1', date: iso(8), createdAt: 1, note: '', by: 'Mummy', lines: [L('shirt', 'iron', 8), L('kurta', 'iron', 3)],
      received: { 'shirt|iron': 8, 'kurta|iron': 3 }, receivedDate: iso(6), receipts: [{ date: iso(6), got: { 'shirt|iron': 8, 'kurta|iron': 3 }, by: 'Mummy' }] },
  ],
  visits: [1, 2, 4, 6, 8].map((n, i) => ({ id: 'v' + i, dhobiId: 'd1', date: iso(n), time: ['09:40', '10:05', '09:15', '18:20', '09:50'][i], by: i % 2 ? 'Papa' : 'Mummy', createdAt: i })),
};

const SHOTS = [
  ['1-home', 'Your dhobi diary,\nnow on your phone', async (p) => {}],
  ['2-give', 'Tap + on what\nyou give', async (p) => {
    await p.click('.big-action.give'); for (let i = 0; i < 4; i++) await p.click('#tile-shirt .cnt-btn.plus');
    await p.click('#tile-pant .cnt-btn.plus'); await p.click('#tile-pant .cnt-btn.plus'); await p.click('#tile-kurta .cnt-btn.plus');
    await p.evaluate(() => scrollTo(0, 330));
  }],
  ['3-receive', 'Know exactly\nwhat came back', async (p) => {
    await p.click('.batch'); await p.waitForTimeout(300);
    await p.click('.rrow2:has-text("Shirt") [data-m="yes"]'); await p.click('.rrow2:has-text("Pant") [data-m="some"]');
    await p.click('[data-act="set-some"][data-n="2"]'); await p.click('.rrow2:has-text("Kurta") [data-m="no"]');
  }],
  ['4-bill', 'Monthly bill,\nready for WhatsApp', async (p) => { await p.click('[data-act="tab"][data-to="bill"]'); }],
  ['5-visits', 'One tap when\nthe dhobi comes', async (p) => { await p.click('[data-act="tab"][data-to="bill"]'); await p.evaluate(() => scrollTo(0, 720)); }],
];

(async () => {
  const b = await chromium.launch();
  // Google Play 1080×1920 and App Store iPhone 6.9" 1290×2796
  const SIZES = [
    { w: 1080, h: 1920, vh: 760, dsf: 2.5, phone: 820, top: 120, font: 84, file: (n) => `screenshot-${n}.png` },
    { w: 1290, h: 2796, vh: 844, dsf: 3, phone: 1010, top: 170, font: 100, file: (n) => `appstore-iphone-6.9-${n}.png` },
  ];
  for (const S of SIZES) {
  const screen = await b.newPage({ viewport: { width: 390, height: S.vh }, deviceScaleFactor: S.dsf });
  const frame = await b.newPage({ viewport: { width: S.w, height: S.h } });
  for (const [name, caption, steps] of SHOTS) {
    await screen.goto(URL);
    await screen.evaluate((d) => { localStorage.clear(); localStorage.setItem('dhobi-diary.db', JSON.stringify(d)); }, db);
    await screen.reload(); await screen.waitForTimeout(600);
    await steps(screen); await screen.waitForTimeout(700);
    const png = (await screen.screenshot()).toString('base64');
    const phoneH = Math.round((S.phone - 28) * S.vh / 390) + 28;
    await frame.setContent(`<html><body style="margin:0;width:${S.w}px;height:${S.h}px;background:#F2F5F8;font-family:'Instrument Sans',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;overflow:hidden">
      <h1 style="margin:${S.top}px 0 ${Math.round(S.top * 0.6)}px;font-size:${S.font}px;font-weight:500;letter-spacing:-.035em;line-height:1.05;text-align:center;color:#141414;white-space:pre-line">${caption}</h1>
      <div style="width:${S.phone}px;height:${phoneH}px;border:14px solid #141414;border-radius:${Math.round(S.phone * 0.11)}px;overflow:hidden;background:#fff;box-sizing:border-box;flex:none">
        <img src="data:image/png;base64,${png}" style="width:100%;display:block"></div></body></html>`);
    await frame.waitForTimeout(200);
    await frame.screenshot({ path: path.join(out, S.file(name)) });
  }
  await screen.close(); await frame.close();
  }
  const frame = await b.newPage({ viewport: { width: 1024, height: 500 } });
  // Feature graphic 1024×500
  await frame.setContent(`<html><body style="margin:0;width:1024px;height:500px;background:#141414;color:#fff;display:flex;align-items:center;gap:56px;padding:0 80px;box-sizing:border-box;font-family:system-ui,sans-serif">
    <img src="data:image/png;base64,${iconPng}" style="width:300px;height:300px;border-radius:66px;flex:none">
    <div><div style="font-size:84px;font-weight:600;letter-spacing:-.04em;line-height:1">Dhobi Diary</div>
    <div style="font-size:34px;margin-top:18px;line-height:1.25">Clothes given · came back · monthly bill<br>English · हिंदी · ગુજરાતી</div></div></body></html>`);
  await frame.screenshot({ path: path.join(out, 'feature-graphic-1024x500.png') });
  await b.close();
  console.log('store images ready');
})();
