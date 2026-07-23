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
- `src/screens/` — Sale, Menu, Summary, Settings, plus Customers and Promos which Settings pushes as sub-screens (it owns that sub-navigation; the tab bar stays four items).
- `src/db.ts` — IndexedDB (`idb`) wrapper. Object stores: items, orders, holds, settings, customers, promos, shifts, cashmoves. Schema v3 (holds added in v2; members/promos/shifts in v3 — bump the version + add an `upgrade` branch for new stores).
- `src/lib/` — pure, unit-tested helpers: `totals` (round2, discount), `format` (baht), `options` (unit price with modifiers, line signature), `stock` (opt-in per-item counting, apply/restock), `promo` (percent/amount + min spend), `points` (earn/redeem/tier, `reverseOrder`), `shift` (expected cash, variance), `report` (payment mix, category, hourly, best sellers, low stock), `receipt`, `backup` (CSV export + JSON backup/restore), `promptpay` (EMVCo QR payload, fully offline), `ads` (Capacitor AdMob, no-op on web; real banner/interstitial unit ids live in `ads.ts`, the app id in `AndroidManifest.xml` — swap both back to Google's `ca-app-pub-3940256099942544` test ids to run without earning).
- `src/types.ts` — Item, OptionGroup/OptionChoice, OrderLine, Order, Hold, Customer, Promo, Shift, CashMove. `src/seed.ts` — default demo menu (one item carries options, one carries stock, so the features are discoverable).

## Data model
- **Item**: id, name, price, category, active, `options?` (groups of choices with price deltas), `stock?`.
  `stock === undefined` means **not tracked** — the item always sells. That is the default and mirrors the web app's decision that blocking a sale on stock drift is worse than the drift. A vendor opts in per item, and only then does the Sale screen refuse to add past zero.
- **OrderLine**: `price` is the unit price **including** chosen options, so `price * qty` remains the line total everywhere (totals, receipt, CSV, reports need no option-awareness). `lineId` comes from `lineSig(itemId, choiceIds)` — deterministic, so the same item with the same options merges into one line and a different option set becomes its own. Off-menu lines use a random uuid. Read it via `lineKey()`, which falls back to `itemId` for orders saved before options existed.
- **Order**: lines, `subtotal?`, `discount?`, `total` (net payable), `method?` (`"cash"|"qr"`), received, change, ts, plus `customerId?`, `pointsUsed?`, `pointsEarned?`, `promoId?`, `shiftId?`, `voided?`. subtotal/discount/method are optional for back-compat with pre-discount orders — keep new fields optional and default old orders to cash.
- **Hold**: a parked cart (lines + discount) recalled later. Only the manual discount travels with a hold; promo and member are re-picked on recall.
- **Customer**: points + lifetime `spent`; tier is derived from spend (`tierFor`) and multiplies points earned.
- **Shift / CashMove**: one shift open at a time (`openShift()` = the row with no `closeTs`). Expected drawer cash = opening float + cash sales in the shift + manual in/out. QR sales never touch it.

## Rules that are easy to break
- **Discount sources do not stack.** A promo *replaces* the manual discount (the web app shipped a bug where a voucher silently overwrote a promotion while still counting the promotion's usage). Points are separate — they are the customer's own money — and are clamped so a redemption can never owe change.
- **Void must reverse everything the sale moved.** `voidBill` marks the order `voided` (kept in the ledger and the CSV, excluded from every total), restocks the lines, and reverses the member via `reverseOrder`, which undoes the `pointsEarned`/`pointsUsed` **recorded on the order** — recomputing them would leak free points whenever a tier multiplier applied at sale time.
- `baht()` puts the sign outside the symbol (`-฿200`); negatives appear on cash-out moves and a short till.

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

## Current state (as of 2026-07-23)
- Play tracks: **internal** = v3, **closed "Alpha"** = v2. Only the closed track counts toward production access — 12 testers are on the list and the 14-day clock runs there. Internal is just for quick test installs.
- **versionCode 5 / versionName 1.4** is the current source. v4 was built and committed but never uploaded, and its artifact no longer matches the source (the feature-parity release landed after it), so 5 supersedes it — no AAB has been built for 5 yet. Uploading a build always needs a versionCode higher than the last one uploaded.
- AdMob: app + banner/interstitial units exist and are wired into the code. **Payments (bank/tax) are not set up yet**, so nothing is withdrawable, and real ads only start serving after the AdMob app review (~2-3 days) plus ~1h per new ad unit.
- Store listing is complete (icon, feature graphic, 4 screenshots, Thai copy).
- Next steps: upload v4 → finish AdMob payments → apply for production once the closed test clears 14 days with 12 opted-in testers.
