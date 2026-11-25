# Dhobi Khata 👕

Replaces the paper diary families use to track clothes given to the dhobi.
**Works offline · no passwords · free · English / हिंदी / ગુજરાતી · optional family sync**

## Run it

| What | Command |
|---|---|
| Try in a browser (laptop) | `npm install` then `npm run dev` |
| Tests | `npm test` |
| Android app (opens Android Studio) | `npm run app:android` |
| iPhone app (opens Xcode, Mac only) | `npm run app:ios` |
| Copy latest code into both apps | `npm run app:sync` |
| Re-make app icons from `design/iron-cutout.png` (needs Python + Pillow) | `npm run app:icons` |

App ID: `com.dhobikhata.app` (in `capacitor.config.json`). **Pick your final ID before the first store upload — it can never change after.**

## How the code is organised

| Folder | Job |
|---|---|
| `src/core/` | Data + maths. `db.js` (all reads/writes, undo), `calc.js` (status, missing, bill), `catalog.js` (items + default rates), `storage.js` (on-phone storage) |
| `src/screens/` | One file per screen: home, give, receive, batch, bill, history, rates, settings, visits, family |
| `src/ui/` | Router, shared pieces (`kit.js`), icons, clothes drawings (`art.js`) |
| `src/i18n/` | `en.js`, `hi.js`, `gu.js` — every word on screen |
| `src/platform/native.js` | Phone features: haptics, share sheet, files, back button |
| `src/features/` | `backup.js` (CSV + JSON), `sharing/` (family sync, see below) |

## Family diary (sync between phones) — Supabase

How it works for users: one person taps **Settings → Family → Start a family diary**, types their name and gets a 6-letter code. Everyone else taps **Join with a code**. Each phone keeps working offline; changes wait in a queue on the phone and sync when online.

| File | Job |
|---|---|
| `src/features/sharing/index.js` | The only thing screens use (`family.create / join / leave`) |
| `src/features/sharing/sync-engine.js` | Offline queue, merging, live updates (no Supabase code, fully tested) |
| `src/features/sharing/supabase-sync.js` | Connects the engine to Supabase. Loaded only when a family is used |
| `src/features/sharing/config.js` | **Paste your Supabase URL + anon key here** |
| `supabase/migrations/001_dhobi_diary.sql` | Tables, security rules, create/join functions |
| `tests/sync.test.js` | 2-phone tests against a fake Supabase (`npm test`) |

### One-time Supabase setup (about 10 minutes, free plan)
1. Sign up at https://supabase.com (GitHub or email) → **New project**. Name: `dhobi-diary`. Region: **South Asia (Mumbai)**. Save the database password somewhere safe (you won't need it in the app).
2. **SQL Editor → New query** → paste all of `supabase/migrations/001_dhobi_diary.sql` → **Run**. It should say "Success".
3. **Authentication → Sign In / Providers → Allow anonymous sign-ins → On → Save.**
4. **Project Settings → API (Data API)** → copy **Project URL** and the **anon public** key into `src/features/sharing/config.js`.
5. `npm run app:sync` and run the app. Settings → Family now shows "Start a family diary".

The anon key is meant to be inside apps; the database rules stop anyone without the family code from reading anything. Never put the **service_role** key in the app.

**Free plan note:** Supabase pauses a free project after 7 days with no activity at all (you get an email and can restore it in one click). With real users this won't happen; before launch, open the app once a week or upgrade later.

## Data safety
- Saved in the app's private storage (localStorage + a JSON file mirror in the app's data folder).
- With a family diary, also in your Supabase database (each phone keeps its own copy and a queue of unsent changes).
- Users can save a backup file and restore it from **Settings → Backup**.

## Bill rules
- Clothes still with the dhobi: counted at full rate.
- Missing clothes: **not charged**.
- Rates are frozen into each bundle when saved, so changing rates never changes old bills.
