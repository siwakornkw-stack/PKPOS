import { Capacitor } from "@capacitor/core";
import { AdMob, BannerAdSize, BannerAdPosition, AdmobConsentStatus } from "@capacitor-community/admob";

// Real PkPos AdMob ad units (app com.pkpos.vendor). Swap back to Google's public test ids
// (ca-app-pub-3940256099942544/...) if you need to test locally without earning. The matching
// app id lives in android/app/src/main/AndroidManifest.xml.
const BANNER_ID = "ca-app-pub-3338571139004995/6235385215";
const INTERSTITIAL_ID = "ca-app-pub-3338571139004995/6445615692";

const native = Capacitor.isNativePlatform();

// Ads are non-critical: a failed load (no fill, offline) must never break the POS. Log and move on.
async function safe(fn: () => Promise<unknown>): Promise<void> {
  if (!native) return;
  try {
    await fn();
  } catch (e) {
    console.warn("[ads]", e);
  }
}

export function initAds(): Promise<void> {
  return safe(async () => {
    // Google UMP consent gate — Play + AdMob require a consent mechanism for personalized ads.
    const info = await AdMob.requestConsentInfo();
    if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
      await AdMob.showConsentForm();
    }
    await AdMob.initialize({});
  });
}

export function showBanner(): Promise<void> {
  return safe(() =>
    AdMob.showBanner({
      adId: BANNER_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
    })
  );
}

export function hideBanner(): Promise<void> {
  return safe(() => AdMob.hideBanner());
}

export function showInterstitial(): Promise<void> {
  return safe(async () => {
    await AdMob.prepareInterstitial({ adId: INTERSTITIAL_ID });
    await AdMob.showInterstitial();
  });
}
