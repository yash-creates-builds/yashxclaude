# Seeti 🍲 — cooker whistle counter

A mobile web app (installable PWA) that listens to your pressure cooker, counts the whistles, and tells you when to turn off the gas.

- No backend, no API keys, nothing recorded or uploaded.
- Works offline after the first load (the AI model is cached too).

## Run locally

```bash
npm install
npm run dev
```

Open the URL it prints. The mic works on `localhost` without HTTPS.

## Test on your phone (needs HTTPS)

Option A — deploy to Vercel:

```bash
npx vercel
```

Option B — a tunnel to your laptop:

```bash
npm run build && npm run preview
```

```bash
npx cloudflared tunnel --url http://localhost:4173
```

Open the `https://…` link it gives you on your phone.

## How detection works

| Layer | What it checks |
|---|---|
| Heuristic | Loud (above kitchen noise) **and** most energy in the whistle band (1.5–6 kHz) **and** lasts ≥ 0.8 s |
| Calibration | Learns your cooker's pitch + loudness from one real whistle |
| AI (YAMNet) | Google's free sound classifier says "whistle / steam / hiss" with > 30% confidence |

After each count, Seeti ignores sound for 6 s (one whistle = one count).

## Files

| File | Job |
|---|---|
| `src/main.js` | Screens + app flow |
| `src/detector.js` | Whistle detector + calibration |
| `src/yamnet.js` | Optional AI layer |
| `src/alerts.js` | Sound, voice, vibration, screen wake lock |
| `src/cooker.js` | Pressure cooker illustration |
| `src/sw-template.js` | Offline service worker (built into `/sw.js`) |

Optional: to self-host the AI model, put YAMNet's `model.json` + shards in `public/models/yamnet/`.

## Phone apps (App Store + Play Store)

The same code builds the website **and** the iPhone + Android apps (wrapped with Capacitor).

| Command | What it does |
|---|---|
| `npm run app:android` | Builds the app and opens it in **Android Studio** |
| `npm run app:ios` | Builds the app and opens it in **Xcode** (Mac only) |
| `npm run app:sync` | Copies the latest web code into both apps |
| `npm run app:icons` | Regenerates app icons and splash screens from `public/icon.svg` |

App ID: `com.cookerseeti.app` (in `capacitor.config.json`). Locked once uploaded to Google Play.
