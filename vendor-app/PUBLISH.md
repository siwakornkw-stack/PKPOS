# Publishing PkPos to Google Play

## What must be done by you (not the assistant)

These require your Google account, payment, or a secret only you may hold:

- Registering / signing in to the **Google Play Console** (one-time US$25).
- Choosing and entering the **keystore password** — this is a signing credential. If you lose it
  you can never update the app again, so only you should set and store it.
- Accepting Play terms, filling payment, and pressing **Publish** (irreversible submit).
- Creating the **AdMob account** and real ad ids.

Everything else (native project, signing config, listing text, data-safety answers) is prepared below.

## 1. Create your upload keystore (once)

Run in `vendor-app/`, choose your own passwords and keep them safe:

```
keytool -genkey -v -keystore pkpos-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias pkpos
```

Then create `vendor-app/android/keystore.properties` (gitignored — never commit it):

```
storeFile=../../pkpos-upload.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=pkpos
keyPassword=YOUR_KEY_PASSWORD
```

The release signing config in `android/app/build.gradle` reads this file automatically. If the
file is absent (e.g. on a debug build), signing is skipped and nothing breaks.

## 2. Replace the AdMob test ids (before publishing)

- `src/lib/ads.ts` → `BANNER_ID`, `INTERSTITIAL_ID` (your real unit ids).
- `android/app/src/main/AndroidManifest.xml` → `com.google.android.gms.ads.APPLICATION_ID`.
- AdMob console → Privacy & messaging → create a consent (UMP) message (the app already calls it).

## 3. Build the release AAB

```
cd vendor-app
npm run build
npx cap sync android
android\gradlew.bat -p android bundleRelease      # Windows
# ./android/gradlew -p android bundleRelease       # macOS/Linux
```

Output: `android/app/build/outputs/bundle/release/app-release.aab` — this is what you upload.

## 4. Play Console steps

1. Register at https://play.google.com/console (US$25 once).
2. Create app → name **PkPos**, default language **Thai**, type **App**, **Free**.
3. Internal testing track first → upload `app-release.aab` → test on a real device.
4. Fill: store listing (below), privacy policy URL — **already hosted, use:**
   `https://raw.githack.com/siwakornkw-stack/PKPOS/gh-pages/privacy-policy.html` — data safety
   (below), content rating (→ Everyone), target audience, and the **ads declaration: Yes**.
5. Promote to Production and submit for review.

## Store listing draft

Current as of versionCode 5 / 1.4. Play limits: name 30, short 80, full 4000, what's-new 500.

- **Name:** PkPos - แคชเชียร์ขายหน้าร้าน
- **Short (80 chars):** POS ฟรี คิดเงิน ทอนเงิน ท็อปปิ้ง สต็อก สมาชิก ใช้ได้ออฟไลน์ ไม่ต้องสมัคร
- **Full:**
  > PkPos คือแอปแคชเชียร์ (POS) ฟรีสำหรับร้านเล็ก แผงลอย และพ่อค้าแม่ค้า
  > ทำงานออฟไลน์ 100% ไม่ต้องสมัคร ไม่ต้องต่อเน็ต ข้อมูลอยู่ในเครื่องคุณ
  >
  > ขายหน้าร้าน
  > - เพิ่มเมนู แตะขาย คิดเงิน ทอนเงินได้ทันที
  > - ตัวเลือก/ท็อปปิ้งต่อเมนู เช่น ระดับความเผ็ด ไข่ดาว พิเศษ บวกราคาให้อัตโนมัติ
  > - รับเงินสด หรือสร้าง QR พร้อมเพย์ให้ลูกค้าสแกนจ่าย
  > - รายการนอกเมนู กำหนดราคาเอง
  > - พักบิลไว้ก่อน แล้วเรียกกลับมาคิดเงินทีหลัง
  >
  > สต็อกและเมนู
  > - เปิดนับสต็อกเฉพาะเมนูที่ต้องการ เห็นจำนวนคงเหลือตอนขาย
  > - ของหมดกดไม่ได้ กันขายเกิน
  > - เตือนของใกล้หมด
  >
  > ลูกค้าและโปรโมชัน
  > - สมาชิกสะสมแต้ม ใช้แต้มเป็นส่วนลดได้
  > - ระดับสมาชิกเลื่อนอัตโนมัติตามยอดซื้อสะสม ยิ่งซื้อยิ่งได้แต้มเยอะ
  > - โปรโมชันลดเป็น % หรือลดเป็นบาท ตั้งยอดซื้อขั้นต่ำได้
  >
  > เงินและรายงาน
  > - เปิด-ปิดกะ นับเงินในลิ้นชัก บอกขาด/เกินให้เห็นชัด
  > - บันทึกเงินเข้า-ออกที่ไม่ใช่การขาย เช่น ซื้อของ ทอนเพิ่ม
  > - สรุปยอดวันนี้ เมื่อวาน 7 วัน 30 วัน
  > - ดูยอดแยกตามช่องทางชำระ หมวดสินค้า และช่วงเวลา
  > - เมนูขายดี
  > - ยกเลิกบิลได้ คืนสต็อกและแต้มให้อัตโนมัติ
  >
  > ใบเสร็จและข้อมูล
  > - แชร์ใบเสร็จผ่าน LINE หรือปริ้นต์
  > - ส่งออก CSV เปิดใน Excel ได้
  > - สำรองและกู้คืนข้อมูลเป็นไฟล์
  >
  > ข้อมูลทั้งหมดเก็บในเครื่อง ไม่มีเซิร์ฟเวอร์ ไม่มีค่าบริการรายเดือน
  > แนะนำให้สำรองข้อมูลก่อนเปลี่ยนเครื่องหรือล้างข้อมูลแอป
- **Category:** Business

### What's new (v1.4)

  > - เพิ่มตัวเลือก/ท็อปปิ้งต่อเมนู บวกราคาให้อัตโนมัติ
  > - นับสต็อกรายเมนู เตือนของใกล้หมด
  > - สมาชิกสะสมแต้ม ใช้แต้มเป็นส่วนลด มีระดับสมาชิก
  > - โปรโมชันลด % หรือลดบาท ตั้งยอดขั้นต่ำได้
  > - เปิด-ปิดกะ นับเงินในลิ้นชัก บอกขาด/เกิน
  > - รายงานแยกตามช่องทางชำระ หมวด และช่วงเวลา
  > - ยกเลิกบิลแล้วคืนสต็อกและแต้มอัตโนมัติ

## Data safety form answers (because the app shows AdMob ads)

- Does your app collect or share user data? **Yes** — via Google AdMob.
- Data type: **Device or other IDs** (advertising ID). Purpose: **Advertising or marketing**.
- Your own app's sales/menu data: stored **only on the device**, not collected or transmitted by you.
- Since v1.4 the app can also store **member names and phone numbers** the vendor types in. This
  still answers as **not collected**: Google defines collection as data leaving the device, and
  nothing here is transmitted — it lives in IndexedDB and only moves if the vendor exports a
  CSV/backup themselves. Do not tick "Personal info > Name / Phone number" for it, but be ready
  to explain this in a review reply if asked.
- Is data encrypted in transit? AdMob handles its own transport; your app sends nothing.
- Can users request deletion? Data is local — uninstalling deletes it; the app has Backup/Restore,
  and members can be deleted individually in ตั้งค่า > สมาชิก.

## Notes

- First release, use the **Internal testing** track to verify ads + flow on a device before Production.
- Ad revenue stays near zero until you have real installs — focus on getting the app in front of vendors.
