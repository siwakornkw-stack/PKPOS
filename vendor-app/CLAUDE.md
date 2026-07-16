# CLAUDE.md — PkPos (vendor-app)

Free, offline-first consumer POS for small Thai vendors / street stalls. Vite + React 19 + TypeScript + Tailwind, packaged for Android via Capacitor. Local-only data (IndexedDB) — no backend, no login. Published to Google Play as `com.pkpos.vendor`. Separate app from the B2B SaaS in the repo root.

## Commands
- `npm run dev` — Vite dev server (port 5180, see vite.config.ts)
- `npm test` — vitest (unit tests for `src/lib/`)
- `npm run build` — `tsc --noEmit && vite build`
- `npm run cap:sync` — build web + copy into `android/` (run before building an AAB)
- `npm run cap:android` — open the Android project in Android Studio

## Build a release AAB
1. Bump `versionCode` (and `versionName`) in `android/app/build.gradle` — Google Play rejects an upload whose versionCode is not higher than the last.
2. `npm run cap:sync`
3. `android/gradlew bundleRelease` — signs via `android/keystore.properties` (gitignored). Output: `android/app/build/outputs/bundle/release/app-release.aab`.

## App icons
- Sources live in `assets/` (`icon-only.png` = full icon, `icon-foreground.png` = white cash register on transparent, `icon-background.png` = brand green `#048D6F`; all 1024px).
- Regenerate every Android launcher icon (legacy + adaptive) with `npx @capacitor/assets generate --android`, then `npm run cap:sync`. Do NOT hand-edit `android/app/src/main/res/mipmap-*` — they are generated.

## Architecture
- `src/App.tsx` — shell: bottom tab nav (Sale / Menu / Summary / Settings) + AdMob banner (hidden on the Sale tab so it can't cover checkout).
- `src/screens/` — Sale, Menu, Summary, Settings.
- `src/db.ts` — IndexedDB (`idb`) wrapper. Object stores: items, orders, holds, settings. Schema v2 (holds added in v2 — bump the version + add an `upgrade` branch for new stores).
- `src/lib/` — pure, unit-tested helpers: `totals` (round2, discount), `format` (baht), `receipt`, `backup` (CSV export + JSON backup/restore), `promptpay` (EMVCo QR payload, fully offline), `ads` (Capacitor AdMob, no-op on web; real banner/interstitial unit ids live in `ads.ts`, the app id in `AndroidManifest.xml` — swap both back to Google's `ca-app-pub-3940256099942544` test ids to run without earning).
- `src/types.ts` — Item, OrderLine, Order, Hold. `src/seed.ts` — default demo menu.

## Data model
- **Item**: id, name, price, category, active.
- **Order**: lines, `subtotal?`, `discount?`, `total` (net payable), `method?` (`"cash"|"qr"`), received, change, ts. subtotal/discount/method are optional for back-compat with pre-discount orders — keep new fields optional and default old orders to cash.
- **Hold**: a parked cart (lines + discount) recalled later.

## Conventions
- Tailwind utility classes only (no custom CSS beyond the `@tailwind` directives in `index.css`). Theme: emerald accent on a slate palette.
- All UI text is Thai.
- Sale screen is responsive: full-width menu grid + bottom-sheet cart on phones (`<sm`, 640px), fixed sidebar cart on wider screens. `CartList` / `CartFooter` are shared by both. Keep this pattern.
- All money math goes through `lib/totals.ts` (`round2`); PromptPay payloads through `lib/promptpay.ts`. Keep `lib/` pure and tested; screens hold the UI + IndexedDB calls.
- Store listing screenshots map to Sale (sell), Menu, Sale (paid/done), Summary.

## Publishing (Google Play)
- Distribute via testing tracks: **internal testing** for quick tester downloads (no review, near-instant); **closed testing** is required to unlock production access on a personal developer account (12 opted-in testers running for 14 days).
- App-specific account, track, and tester details are personal and are NOT committed here.
- Monetized with AdMob (real ids wired). AdMob payments (bank/tax) are configured in the AdMob console; new ad units take ~1h to serve and a new AdMob app is reviewed (~2-3 days). Link the AdMob app to the Play listing once the app is public.
