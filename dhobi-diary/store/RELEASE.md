# Google Play release checklist — Dhobi Diary

Tick these in order. ⏱ = waiting time you can't skip.

## A. Before building (once)
- [ ] **App ID** in `capacitor.config.json` + `android/app/build.gradle` is final (now `com.dhobidiary.app`). It can never change after the first upload.
- [ ] **Supabase** set up and keys pasted (README → "One-time Supabase setup").
- [ ] **Support email** added in `public/privacy.html`.
- [x] **Privacy policy online:** https://dhobidiary.vercel.app/privacy.html (Vercel, deploys automatically from GitHub).

## B. Build the signed app (on your laptop)
```bash
cd dhobi-diary && npm install && npm run app:android
```
In Android Studio: **Build → Generate Signed App Bundle / APK → Android App Bundle →** create a new key store (keep the file + passwords safe, forever) **→ release → Create**.
Output: `android/app/release/app-release.aab`.

For every later update: raise `versionCode` (1 → 2 → 3…) and `versionName` in `android/app/build.gradle`.

## C. Play Console (https://play.google.com/console, $25 once)
1. **Create app** → name "Dhobi Diary", default language English (India), App, Free.
2. **Store listing:** copy text from `store/listing.md`. Upload:
   - App icon: `store/icon-512.png`
   - Feature graphic: `store/feature-graphic-1024x500.png`
   - Phone screenshots: `store/screenshot-1…5-*.png`
3. **App content:** privacy policy URL (from A) · Ads: No · Data safety: answers in `store/listing.md` · Content rating questionnaire (all "No" → rated Everyone) · Target audience: 18+ · Not a news / government app.
4. **Testing → Closed testing:** upload the `.aab`, add at least **12 testers** (Gmail addresses of family/friends). They must opt in from the link and keep the app ⏱ **14 days**. (Required for new personal developer accounts.)
5. After 14 days: **Apply for production** → answer the short questions → ⏱ review usually 1–7 days.
6. Production release → **roll out**. Live on Play Store.

## D. After launch
- Reply to reviews in Play Console.
- Supabase dashboard → Table editor shows how many families use sharing.

---

# Apple App Store release checklist

## A. What you need
- A **Mac** with **Xcode** (free from the Mac App Store).
- An **Apple Developer** account: https://developer.apple.com/programs ($99/year, approval takes 1–2 days ⏱).

## B. Create the app in App Store Connect
1. https://appstoreconnect.apple.com → **Apps → + → New App**.
2. Platform **iOS** · Name **Dhobi Diary: Laundry Tracker** · Language English (India) · Bundle ID **com.dhobidiary.app** (register it first under Certificates, IDs & Profiles → Identifiers if it isn't listed) · SKU `dhobidiary`.

## C. Build and upload (on the Mac)
```bash
cd dhobi-diary && npm install && npm run app:ios
```
In Xcode:
1. Select **App** (left) → **Signing & Capabilities** → **Team**: your developer account. Keep "Automatically manage signing" on.
2. At the top, pick **Any iOS Device (arm64)**.
3. **Product → Archive**. When it finishes: **Distribute App → App Store Connect → Upload**.
4. After ~15 minutes the build shows in App Store Connect → **TestFlight**. Install it on your iPhone with the TestFlight app and try it.

For every later update: raise **Version** (1.0.0 → 1.0.1) or **Build** (1 → 2) in Xcode → App → General.

## D. Submit
1. App Store Connect → your app → **1.0 Prepare for Submission**.
2. Paste everything from `store/appstore.md` and upload the 5 iPhone screenshots.
3. Pick the uploaded build → **App Privacy** → **Add for Review** → **Submit**.
4. ⏱ Review usually takes 1–3 days.

**If Apple says "minimum functionality" (guideline 4.2):** reply that the app works fully offline, stores data on the device, uses native haptics and the iOS share sheet, and is made for families who keep a paper dhobi diary. Send them screenshots of Grandma Mode and the Hindi/Gujarati screens.

