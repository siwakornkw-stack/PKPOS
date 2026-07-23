# PkPos Vendor — free offline POS (Android)

A free, ad-supported point-of-sale app for small vendors (street food, market stalls).
Local-first: all data lives on the device (IndexedDB), no server, no login, no internet required.
Monetized with Google AdMob. Packaged for Google Play with Capacitor.

This is a **separate app** from the B2B SaaS POS in the repo root — it does not touch it.

## What it does

- **ขาย (Sale):** tap menu items into a cart, take cash or PromptPay QR, show change, save the
  bill. Items can carry **ตัวเลือก / ท็อปปิ้ง** (option groups, single or multi, required or not,
  each with a price delta) — the same dish with different options becomes its own cart line.
  Also supports off-menu / open-price items, park-and-recall bills, a manual or promo discount,
  attaching a **สมาชิก** to earn and redeem points, and sharing a text receipt (share sheet →
  LINE / print / save).
- **เมนู (Menu):** add / edit / delete products (name, price, category, on-sale toggle), build
  option groups, and optionally **นับสต็อก** per item — tracked items show what is left, refuse
  to be added at zero, and decrement on payment.
- **สรุป (Summary):** sales total and bill count for today / yesterday / 7 / 30 days, a
  **กะการขาย** card (open with a float, log cash in/out, close by counting the drawer and seeing
  the variance), breakdowns by payment method, category and hour, best sellers, a low-stock
  warning, the per-bill list, "close day", CSV export, and JSON backup / restore (the escape
  hatch for local-only data — see below).
  Cancelling a bill is a **soft void**: it stays in the ledger and the CSV but leaves every
  total, and the stock and member points it moved are put back.
- **ตั้งค่า (Settings):** shop name, PromptPay id, the baht-per-point rate, and sub-screens for
  **สมาชิก** (members, points, tiers) and **โปรโมชัน** (percent or baht off, optional minimum spend).
- **Ads:** AdMob banner on the Menu/Summary screens (never on the Sale/checkout screen so it
  can't cause a mis-tap during payment); interstitial on "close day". Google UMP consent is
  requested on first launch before ads initialize.

## Stack

Vite + React + TypeScript + Tailwind. IndexedDB via `idb`. Capacitor (Android) + `@capacitor-community/admob`.

## Develop (web)

```bash
npm install
npm run dev      # http://localhost:5180
npm test         # unit tests for money math (totals / change)
npm run build    # type-check + production build to dist/
```

On the web, all AdMob calls are no-ops (guarded by `Capacitor.isNativePlatform()`), so the
POS runs fully in a browser for development.

## Ship to Google Play

Needs **JDK 21** (Capacitor 8 requirement) and the **Android SDK**. Android Studio is optional —
the `android/` project is already generated and builds from the command line (Gradle wrapper).
On this machine the debug APK and release AAB build successfully; `android/gradle.properties`
points Gradle at the JDK 21 that foojay auto-downloaded, so no manual JDK setup is needed here.

The signing keystore and Play Console upload are your steps — see **PUBLISH.md**.

### 0. Host the privacy policy (Play requires it for ad-supported apps)

`privacy-policy.html` is ready to publish. Host it anywhere public (GitHub Pages, Vercel,
Netlify) and keep the URL — you paste it into the Play Console listing **and** the Data Safety
form. Edit the contact email inside it first. Skipping this is the #1 reason ad apps get rejected.

### 1. Set your AdMob ids (or you earn nothing)

The app ships with Google's public **test** ad units. Before publishing, replace them:

- `src/lib/ads.ts` → `BANNER_ID` and `INTERSTITIAL_ID` (your real AdMob unit ids).
- AndroidManifest (created in step 2) → your AdMob **app id**.

Get these from https://admob.google.com (create an app + ad units). Consent (Google UMP) is
already wired in `initAds()`; configure a consent message in the AdMob Privacy & messaging tab.

### 2. Android project (already generated)

`android/` already exists (`npx cap add android` was run) with the AdMob **test** app id in
`android/app/src/main/AndroidManifest.xml`. Before publishing, swap it for your real app id:

```xml
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY"/>
```

(The `~` id is the app id, different from the `/` unit ids in `ads.ts`.) After changing web code,
re-sync with `npm run build && npx cap sync android`.

### 3. App icon

Put a 1024x1024 `icon.png` in `resources/` (export `resources/icon.svg` to PNG), then:

```bash
npm i -D @capacitor/assets
npx @capacitor/assets generate --android
```

### 4. Build and upload

```bash
npm run cap:sync     # build web + copy into the android project (run after every code change)
npm run cap:android  # opens Android Studio
```

In Android Studio: **Build > Generate Signed Bundle / APK > Android App Bundle**, create/select a
keystore (keep it safe — you need the same key for every update), build the release `.aab`, then
upload it at https://play.google.com/console (one-time US$25 developer registration).

## Notes / current limits

- Data is per-device only. Backup/restore and CSV export are manual (Summary screen) — there is
  no automatic cloud sync (by design — keeps it free with zero hosting cost). Tell vendors to back
  up before changing phones or clearing app data.
- "Close day" shows the interstitial and a summary; it does not archive or reset data.
- Receipts and the shop name default to "ร้านค้า" — there is no Settings screen yet to set the
  shop name (reads from the `shopName` setting key if present). Add a Settings tab when needed.
- Ad revenue is roughly zero until there is a real install base — set expectations accordingly.
