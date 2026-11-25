# Dhobi Diary 👕

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

## Family seats (₹19 per extra person, one time)

First person in a family is free. Each extra person needs a seat; buying one adds +1 for good.

| Piece | File |
|---|---|
| Seat count + "family full" rule + purchase log | `supabase/migrations/002_family_seats.sql` |
| Play Store / App Store purchases (via RevenueCat) | `supabase/functions/revenuecat-webhook` |
| Website purchases (Razorpay) | `supabase/functions/razorpay-order`, `supabase/functions/razorpay-webhook` |
| Payment checks (tested) | `supabase/functions/_shared/seats.ts`, `tests/seats.test.js` |
| App side | `src/features/sharing/supabase-sync.js` (`buySeat`), `src/screens/family.js` |

Seats are only ever added by the server after the store/Razorpay confirms the payment, and the same payment can never add two seats.

### Setup (after the Supabase setup above)
1. **Supabase SQL Editor:** run `supabase/migrations/002_family_seats.sql`.
2. **Deploy the functions** (on your laptop):
   `npx supabase login` → `npx supabase link --project-ref <your-ref>` → `npx supabase functions deploy revenuecat-webhook razorpay-order razorpay-webhook`
3. **Google Play Console → Monetize → In-app products → Create:** ID `family_seat`, price ₹19.
4. **App Store Connect → In-App Purchases → Consumable:** ID `family_seat`, price ₹19.
5. **RevenueCat** (free, revenuecat.com): add the Android + iOS apps, add product `family_seat`, then **Integrations → Webhooks**: URL `https://<ref>.supabase.co/functions/v1/revenuecat-webhook`, Authorization = any long random text. Copy the public SDK keys into `revenueCatKeys` in `src/features/sharing/config.js`.
6. **Razorpay** (website, PAN + bank account, no GST needed): get Key ID + Secret; **Webhooks →** URL `https://<ref>.supabase.co/functions/v1/razorpay-webhook`, event `payment.captured`, set a secret. Then set `razorpayEnabled = true`.
7. **Supabase → Edge Functions → Secrets:** `REVENUECAT_WEBHOOK_AUTH`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

## Data safety
- Saved in the app's private storage (localStorage + a JSON file mirror in the app's data folder).
- With a family diary, also in your Supabase database (each phone keeps its own copy and a queue of unsent changes).
- Users can save a backup file and restore it from **Settings → Backup**.

## Bill rules
- Clothes still with the dhobi: counted at full rate.
- Missing clothes: **not charged**.
- Rates are frozen into each bundle when saved, so changing rates never changes old bills.
