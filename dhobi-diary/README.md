# Dhobi Diary 👕

Replaces the paper diary families use to track clothes given to the dhobi.
**Works offline · no passwords · free · English / हिंदी / ગુજરાતી · optional family sync**

## Run it

| What | Command |
|---|---|
| Try in a browser (laptop) | `npm install` then `npm run dev` |
| Tests | `npm test` |
| Test family sync locally (no account) | `npm run emulators` in one terminal, `npm run dev:family` in another |
| Android app (opens Android Studio) | `npm run app:android` |
| iPhone app (opens Xcode, Mac only) | `npm run app:ios` |
| Copy latest code into both apps | `npm run app:sync` |
| Re-make app icons from `public/icon.svg` | `npm run app:icons` |

App ID: `com.dhobidiary.app` (in `capacitor.config.json`). **Pick your final ID before the first store upload — it can never change after.**

## How the code is organised

| Folder | Job |
|---|---|
| `src/core/` | Data + maths. `db.js` (all reads/writes, undo), `calc.js` (status, missing, bill), `catalog.js` (items + default rates), `storage.js` (on-phone storage) |
| `src/screens/` | One file per screen: home, give, receive, batch, bill, history, rates, settings, visits, family |
| `src/ui/` | Router, shared pieces (`kit.js`), icons, clothes drawings (`art.js`) |
| `src/i18n/` | `en.js`, `hi.js`, `gu.js` — every word on screen |
| `src/platform/native.js` | Phone features: haptics, share sheet, files, back button |
| `src/features/` | `backup.js` (CSV + JSON), `sharing/` (family sync, see below) |

## Family diary (sync between phones)

How it works for users: one person taps **Settings → Family → Start a family diary**, types their name and gets a 6-letter code. Everyone else taps **Join with a code**. Each phone keeps working offline and syncs when online.

| File | Job |
|---|---|
| `src/features/sharing/index.js` | The only thing screens use (`family.create / join / leave`) |
| `src/features/sharing/firebase-sync.js` | Firebase code. Loaded only when a family is used |
| `src/features/sharing/config.js` | **Paste your Firebase config here** |
| `firestore.rules` | Security: only members of a household can read/write it |

### One-time Firebase setup (about 10 minutes, free plan)
1. https://console.firebase.google.com → **Add project** (Analytics not needed).
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**
3. **Build → Firestore Database → Create database** → pick a region in India (`asia-south1`) → production mode.
4. **Project settings → Your apps → Web (`</>`)** → register → copy the `firebaseConfig` object into `src/features/sharing/config.js`.
5. Upload the security rules:
   `npx firebase login` then `npx firebase deploy --only firestore:rules --project <your-project-id>`
6. `npm run app:sync` and run the app.

Until step 4 is done, the Family card says "not switched on yet" and everything else works as before.

## Data safety
- Saved in the app's private storage (localStorage + a JSON file mirror in the app's data folder).
- With a family diary, also in Firestore (offline copy on each phone, synced when online).
- Users can save a backup file and restore it from **Settings → Backup**.

## Bill rules
- Clothes still with the dhobi: counted at full rate.
- Missing clothes: **not charged**.
- Rates are frozen into each bundle when saved, so changing rates never changes old bills.
