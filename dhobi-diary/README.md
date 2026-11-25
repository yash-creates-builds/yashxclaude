# Dhobi Diary 👕

Replaces the paper diary families use to track clothes given to the dhobi.
**100% offline · no login · free · English / हिंदी / ગુજરાતી**

## Run it

| What | Command |
|---|---|
| Try in a browser (laptop) | `npm install` then `npm run dev` |
| Tests | `npm test` |
| Android app (opens Android Studio) | `npm run app:android` |
| iPhone app (opens Xcode, Mac only) | `npm run app:ios` |
| Copy latest code into both apps | `npm run app:sync` |
| Re-make app icons from `public/icon.svg` | `npm run app:icons` |

App ID: `com.dhobidiary.app` (in `capacitor.config.json`). **Pick your final ID before the first store upload — it can never change after.**

## How the code is organised

| Folder | Job |
|---|---|
| `src/core/` | Data + maths. `db.js` (all reads/writes, undo), `calc.js` (status, missing, bill), `catalog.js` (items + default rates), `storage.js` (on-phone storage) |
| `src/screens/` | One file per screen: home, give, receive, batch, bill, history, rates, settings |
| `src/ui/` | Router, shared pieces (`kit.js`), icons, clothes drawings (`art.js`) |
| `src/i18n/` | `en.js`, `hi.js`, `gu.js` — every word on screen |
| `src/platform/native.js` | Phone features: haptics, share sheet, files, back button |
| `src/features/` | `backup.js` (CSV + JSON), `reminders.js`, `sharing/` (see below) |

### Adding paid family sharing / cloud backup later
`src/features/sharing/index.js` defines a provider interface (`pushChanges`, `pullChanges`, `backupNow`).
Today it uses `LocalOnlyProvider` (does nothing). Write e.g. a Supabase/Firebase provider, call `sharing.use(provider)` after purchase. Screens don't change — every save already flows through `db.js`.

## Data safety
- Saved in the app's private storage (localStorage + a JSON file mirror in the app's data folder).
- Users can save a backup file and restore it from **Settings → Backup**.

## Bill rules
- Clothes still with the dhobi: counted at full rate.
- Missing clothes: **not charged**.
- Rates are frozen into each bundle when saved, so changing rates never changes old bills.
