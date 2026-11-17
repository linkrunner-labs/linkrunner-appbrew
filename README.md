---
# Machine-readable header. Milo and the catalog read these keys; keep the names exact.
id: appbrew
title: Linkrunner
summary: Mobile attribution for Appbrew apps. Tracks installs, in-app events, revenue, deep links and push opens, and sends conversions to Meta and Google.
access: self-serve
image: https://linkrunner.io/brand/logos/linkrunner-mark-color.png
category: analytics
owner:
  name: Linkrunner
  email: support@linkrunner.io
docs: https://docs.linkrunner.io/sdk/appbrew
---

<!--
Rules for this template
- Keep every section heading below, in this order, with the exact text. Milo finds sections by heading.
- A section that does not apply says "None." instead of being deleted.
- Never put real keys, tokens or secrets in this file. Use the format only (e.g. `rmk_` + 48 hex characters).
- The merchant form lives in package.json `appbrew.settings`. The table in section 4 must list the same keys.
-->

<img src="https://linkrunner.io/brand/logos/linkrunner-logo-color.png" alt="Linkrunner" width="280" />

[![npm](https://img.shields.io/npm/v/@linkrunner/appbrew)](https://www.npmjs.com/package/@linkrunner/appbrew)

## 1. Description

Linkrunner tells the merchant which ad, campaign or link brought each app install, and what those users did after. Installs, signups, add to cart, purchases and revenue show up per campaign in the [Linkrunner dashboard](https://dashboard.linkrunner.io), and conversions are sent back to Meta, Google and other ad networks so their campaigns optimise on real app events. It also attributes deep links, deferred deep links, push notification taps and uninstalls.

Shoppers see nothing new. There are no blocks or screens; the integration runs in the background on every screen of the app.

## 2. Access

Tick one:

- [x] Self-serve: the merchant turns it on in Studio and fills the form. No approval needed.
- [ ] Request-based: the merchant asks for it, and Appbrew turns it on.

If request-based, how to ask: None.

The merchant needs a Linkrunner account first. They sign up at [dashboard.linkrunner.io](https://dashboard.linkrunner.io), create a project for the app, copy the project token, and paste it into the Linkrunner form in Studio.

## 3. Requirements

| Item | Value |
| --- | --- |
| Package | `@linkrunner/appbrew` |
| Version | `0.3.1` (must match package.json) |
| Minimum `@gauntlet/*` version | `0.30.0` |
| Needs a new app build | Yes (`appbrew.requiresNativeBuild: true`) |
| Native dependencies | `rn-linkrunner` >= 3.4.1 (LinkrunnerKit 4.3.1 on iOS, `io.linkrunner:android-sdk` 4.4.0 on Android) |
| Partner-side prerequisites | A Linkrunner account and a project for the app. For uninstall tracking, the Firebase and APNs keys added in the Linkrunner dashboard. For deep links, the store's link domain verified in the Linkrunner dashboard. |
| Platforms | iOS 15.0+, Android minSdk 24. Not in the Studio web preview, since the native SDK only runs in the app. |

Optional peers, used when the app already has them: `@react-native-firebase/messaging` (uninstall tracking, push opens), `@gauntlet/firebase-push` and `@notifee/react-native` (push opens), `@react-native-firebase/analytics` (GA4 ids), `clevertap-react-native` (CleverTap id). Without them the related feature does nothing and the build still works.

## 4. Merchant config form

Config key: `integrations.linkrunner` (from `appbrew.configKey`).

Only `token` is required. `debug` is for testing. Every other setting is optional, has a default, and is only needed for a specific use case.

| Key | Label | Type | Required | Secret | Where the merchant finds it | Format / example |
| --- | --- | --- | --- | --- | --- | --- |
| `token` | Linkrunner Project Token | text | Yes | Yes | Linkrunner dashboard → Settings → Project Details → Project token | The token string copied as is from the dashboard |
| `secretKey` | Secret Key (SDK signing) | text | No | Yes | Linkrunner dashboard → Settings → SDK Signing. Only if SDK signing is turned on | Copied from the dashboard, used together with `keyId` |
| `keyId` | Key ID (SDK signing) | text | No | No | Linkrunner dashboard → Settings → SDK Signing. Only if SDK signing is turned on | Copied from the dashboard, used together with `secretKey` |
| `debug` | Debug Logging (testing only, turn off before release) | boolean | No | No | Turn on for a test build, off for the store release | Default `false` |
| `disableIdfa` | Disable IDFA (iOS) | boolean | No | No | Turn on to never read the IDFA, even when the user allowed tracking | Default `false` |
| `enablePIIHashing` | Hash PII Before Sending | boolean | No | No | Turn on to hash email and phone on the device before they are sent | Default `false` |
| `trackScreenViews` | Forward Screen View Events | boolean | No | No | Turn on to send `screen_view` and `page_view`. They are the highest volume events | Default `false` |
| `deeplinkRouting` | Route Deferred Deep Links | boolean | No | No | Turn off to report deferred deep links without opening the linked screen | Default `true` |
| `uninstallTracking` | Uninstall Tracking | boolean | No | No | Turn off to stop sending the push token used for uninstall tracking | Default `true` |
| `pushOpenAttribution` | Push Open Attribution | boolean | No | No | Turn off to stop reporting push notification taps | Default `true` |
| `enableRefunds` | Forward Refunds | boolean | No | No | Leave off unless Linkrunner support has checked the order ids for this store. See section 8 | Default `false` |
| `consentIsEEA` | Google Ads Consent (EEA User) | text | No | No | Fixed Google Ads consent for every user. Leave empty if the app has its own consent banner | `granted`, `denied` or `unknown` |
| `consentAdUserData` | Google Ads Consent (Ad User Data) | text | No | No | Same as above | `granted`, `denied` or `unknown` |
| `consentAdPersonalization` | Google Ads Consent (Ad Personalization) | text | No | No | Same as above | `granted`, `denied` or `unknown` |
| `enableTCFConsentCollection` | Read TCF Consent From CMP (Android) | boolean | No | No | Turn on if the Android app uses an IAB TCF consent tool | Default `false` |
| `clevertapIntegration` | Link CleverTap ID | boolean | No | No | Turn off to stop sending the CleverTap id. Does nothing without CleverTap in the app | Default `true` |
| `analyticsIdentifiers` | Attach Firebase Analytics IDs | boolean | No | No | Turn off to stop sending the GA4 ids. Does nothing without Firebase Analytics in the app | Default `true` |
| `eventsMapper` | Events Mapper (JSON) | json | No | No | Rename Appbrew events before they are sent. Usually left empty | `{"add_to_cart": "AddToCart"}` |
| `paramsMapper` | Params Mapper (JSON) | json | No | No | Rename event params before they are sent. Usually left empty | `{"value": "amount"}` |
| `eventsWhitelist` | Events Whitelist (JSON array) | json | No | No | Only send these events. Empty sends every event | `["purchase", "add_to_cart"]` |
| `paramsWhitelist` | Params Whitelist (JSON array) | json | No | No | Only send these params. Empty sends every param | `["value", "currency", "items"]` |

The JSON settings accept either a JSON value or the same value as a string. Invalid JSON is ignored with a log line, and the default is used.

Values Appbrew fills in on its own (the merchant does not enter them): None. Customer details, the device id, cart and order data are read from the app at runtime.

## 5. Codebase changes (merchant app)

Scripted setup: No, follow the steps below.

1. **Dependency.** In the app's `package.json`:

   ```json
   "@linkrunner/appbrew": "0.3.1",
   "rn-linkrunner": "3.4.1"
   ```

2. **Register blocks.** There are no blocks. Register the tracker instead, in `src/app/App.tsx`, on the same provider the app passes as its `analytics` module:

   ```ts
   import { AnalyticsProvider } from '@gauntlet/analytics'
   import { LinkrunnerTrackerV2 } from '@linkrunner/appbrew'

   AnalyticsProvider.getInstance().addTracker(new LinkrunnerTrackerV2())
   ```

   If the app uses `AnalyticsProviderV2` as its `analytics` module, register on `AnalyticsProviderV2` instead. A tracker only gets events from the provider the app sends them through, so check what `analytics:` is set to in the app's module list. Keep the registration outside any `if (!__DEV__)` block when testing a debug build.

   Remove any `handleDeeplink()` call from the app's push notification handlers. The tracker reports push taps itself, and a second call is not needed. Keep `handleDeeplink()` for links that arrive another way, like in-app banners.

3. **Native changes.**

   **Android.** In `android/app/src/main/AndroidManifest.xml`, on `<application>`:

   ```xml
   <application
     android:dataExtractionRules="@xml/linkrunner_backup_rules"
     android:fullBackupContent="@xml/linkrunner_backup_descriptor">
   ```

   This keeps the SDK's stored install id out of Android auto backup, so a reinstall is counted as a reinstall. Both files ship inside `rn-linkrunner`. If the app already has backup rules, add this line to them instead:

   ```xml
   <exclude domain="sharedpref" path="io.linkrunner.sdk_prefs"/>
   ```

   Permissions (`INTERNET`, `ACCESS_NETWORK_STATE`, `AD_ID`), Play Install Referrer, GAID and App Set ID come with the SDK. Nothing else to add.

   **iOS.** `NSUserTrackingUsageDescription` must be in `Info.plist`. Appbrew apps normally have it already:

   ```xml
   <key>NSUserTrackingUsageDescription</key>
   <string>This identifier will be used to deliver personalized ads and improve your app experience.</string>
   ```

   Appbrew shows the ATT prompt itself before trackers start, so there is nothing to handle in code.

   **Deep links (both platforms, only if the store uses Linkrunner links).** Add the store's link domain as an intent filter on Android and an Associated Domain on iOS:

   ```xml
   <intent-filter android:autoVerify="true">
     <action android:name="android.intent.action.VIEW" />
     <category android:name="android.intent.category.DEFAULT" />
     <category android:name="android.intent.category.BROWSABLE" />
     <data android:scheme="https" android:host="link.yourstore.com" />
   </intent-filter>
   ```

   ```
   applinks:link.yourstore.com
   ```

   Then add the Android SHA-256 fingerprint and the iOS Team ID and bundle id in Linkrunner dashboard → Project Settings → Domain Verification. Full guide: [deep linking setup](https://docs.linkrunner.io/features/deep-linking-setup).

4. **Install.** `pnpm install`, then `cd ios && pod install`. Ship a new build to the stores.

## 6. Studio / theme config

### Blocks

None. Linkrunner is an analytics tracker and renders nothing.

### Block settings

None. All settings are in the merchant config form in section 4.

### Example theme entries

None. Turn on Linkrunner under Integrations, fill the form, and publish the theme so the app picks up the new values.

The app receives the form values at `config.integrations.linkrunner`:

```json
{
  "integrations": {
    "linkrunner": {
      "token": "<project token>",
      "debug": false
    }
  }
}
```

## 7. Screenshots and videos

None. There are no blocks, so there is nothing on screen to compare. Use the test checklist below and check the results in the Linkrunner dashboard.

### Test checklist

Make a test build with `debug` on. Then:

- [ ] Open the app → logcat or the Xcode console shows `Linkrunner initialised successfully`, and the install appears in [Linkrunner dashboard → Events Settings](https://dashboard.linkrunner.io/dashboard/settings/events) within a few minutes.
- [ ] View a product, add to cart, start checkout → `view_item`, `add_to_cart` and `begin_checkout` appear in the dashboard.
- [ ] Place an order → one payment appears. Relaunch the app on the thank you screen → still one payment.
- [ ] Log in or sign up → the user shows the Shopify customer id in the dashboard.
- [ ] Send a push from the Appbrew push tool with a Linkrunner campaign link in `data.link`, and tap it with the app open, in the background and swiped away → each tap is counted on that campaign.
- [ ] Open a Linkrunner link with the app installed → the app opens on the linked screen.
- [ ] Token missing or wrong → the app works as normal, nothing is sent, and the log shows `[linkrunner/appbrew] no token in config.integrations.linkrunner`.
- [ ] Turn `debug` off and publish the theme before the store release.

## 8. How it works

1. On every app open, Appbrew calls `initTracker`. The tracker reads `config.integrations.linkrunner`, sends Google Ads consent if it is set, then calls `init(token)` in the native SDK. Every other call waits for init.
2. Right after init it sets the customer user id (the device id for guests), reads the deferred deep link, starts listening for links and push taps, registers the push token, and sends the CleverTap id if CleverTap is in the app.
3. Appbrew sends every analytics event to the tracker. Event names are sent as is (`add_to_cart` stays `add_to_cart`). Events with `items[]` also get the Meta Catalog Sales fields (`content_ids` with the variant id, `item_group_ids` with the product id, `contents`, `content_type`, `num_items`).
4. `purchase` goes to `capturePayment` with `transaction_id` as the payment id, so the same order is counted once even if the event fires again.
5. `signup` and `login` call `signup()` the first time a customer is seen on an install, and `setUserData()` after that. `logout` resets the customer id to the device id.
6. `app_install_android` and `app_install_ios` are dropped, because `init()` already records the install.
7. Push taps from `@react-native-firebase/messaging`, notifee and `FirebasePush` are reported with `handleDeeplink(data.link)`. The same link is reported once per minute at most.

| Request | When |
| --- | --- |
| `POST https://api.linkrunner.io/api/client/init` | Every app open |
| `POST https://api.linkrunner.io/api/client/attribution-data` | Once per app open, after init |
| `POST https://api.linkrunner.io/api/client/customer-user-id` | After init, and on login or logout |
| `POST https://api.linkrunner.io/api/client/trigger` | First signup of a customer on an install |
| `POST https://api.linkrunner.io/api/client/set-user-data` | Later logins and customer detail changes |
| `POST https://api.linkrunner.io/api/client/capture-event` | Each forwarded analytics event |
| `POST https://api.linkrunner.io/api/client/capture-payment` | Each purchase |
| `POST https://api.linkrunner.io/api/client/remove-captured-payment` | Each refund, only if `enableRefunds` is on |
| `POST https://api.linkrunner.io/api/client/handle-deeplink` | A link or push tap opens the app |
| `POST https://api.linkrunner.io/api/client/update-push-token` | After init, and when Android rotates the push token |
| `POST https://api.linkrunner.io/api/client/integrations` | After init, when the CleverTap id is found |

Data sent to Linkrunner: device and app info (model, OS, app version, install referrer, GAID or IDFA when allowed, App Set ID), the push token, the Shopify customer id, name, email and phone (hashed on the device if `enablePIIHashing` is on), event names and params, cart items, and order id, amount and currency. Customer details and orders are shopper data.

Hosts the app calls: `api.linkrunner.io`.

### Things to know

- **Meta needs event mapping.** Events reach Linkrunner without setup, but each one has to be mapped to a Meta event (for example `add_to_cart` to `AddToCart`) in Linkrunner dashboard → Meta Ads → Event Mapping before it is sent to Meta.
- **Deferred deep links only fill an empty slot.** A link the user tapped is routed by Appbrew. A deferred link from the install is opened once per install, and only if nothing else is opening. Turn off `deeplinkRouting` to never open it.
- **Do not also send purchases from a Shopify webhook** unless it uses the same payment id, or the order is counted twice.
- **Refunds are off by default.** Appbrew's refund event carries a different order id than the purchase event, so the refund usually matches nothing. Without a payment id, Linkrunner removes every payment of that user.
- **Uninstall tracking needs keys in the Linkrunner dashboard** (Settings → Uninstall Tracking: the Firebase project for Android, an APNs key for iOS). Linkrunner sends a silent push with `data.lr-uninstall-tracking`; the app should ignore it in its own message handler.
- **One push tap case is not reported**: Android killed the app process but kept the task, so the tap opens the app before React Native loads. React Native Firebase drops it and `FirebasePush` does not navigate either.

### Calls the app can make

Most apps need none of these. They are for screens or flows Appbrew does not cover:

```ts
import {
  getAttributionData, // campaign and deferred deep link for this install
  setConsent,         // Google Ads consent from a consent banner
  setUserData,        // extra user fields, e.g. { mixpanel_distinct_id }
  setAdditionalData,  // integration ids, e.g. { clevertapId }
  handleDeeplink,     // report a link from an in-app banner
} from '@linkrunner/appbrew'
```

Full SDK reference: [React Native SDK](https://docs.linkrunner.io/sdk/react-native).

## 9. Troubleshooting

Log prefix: `[linkrunner/appbrew]`.

| Symptom / log | Cause | Fix |
| --- | --- | --- |
| `[linkrunner/appbrew] no token in config.integrations.linkrunner — tracker disabled` | Token not set for this store, or the theme was not published after setting it | Fill `token` in the form and publish the theme |
| No events at all, no log line | Tracker registration is inside `if (!__DEV__)`, or on a provider the app does not use as `analytics` | Register on the app's `analytics` provider, outside the dev guard (section 5) |
| `[linkrunner/appbrew] tracker not initialised` | A call waited 30 seconds and `initTracker` never ran | Same as above |
| Some events missing | `eventsWhitelist` leaves them out | Empty the whitelist or add the events |
| `[linkrunner/appbrew] ignoring setting that is not valid JSON` | A JSON setting has a typo | Fix the JSON or leave the setting empty |
| Events in Linkrunner but not in Meta | Event not mapped | Map it in Linkrunner dashboard → Meta Ads → Event Mapping |
| Reinstalls counted as existing installs | Android backup rules missing | Add the backup attributes from section 5 |
| Link opens the browser, not the app | Domain verification incomplete | Check the SHA-256 and Team ID in Domain Verification, see [debugging domain verification](https://docs.linkrunner.io/features/deep-linking-setup#debugging-domain-verification) |
| Push taps not counted on the campaign | `data.link` is a screen route, not a full Linkrunner link, or `pushOpenAttribution` is off | Put the full campaign link (`https://your-domain/...?c=XXXX`) in `data.link` |
| Payment counted twice | Purchase also sent from a webhook with a different payment id | Send from one place, or use the same payment id |

## 10. Versioning and release

- Semantic versioning: patch for fixes, minor for new options or blocks, major when a block id, config key or required API changes. Never rename `configKey`, because merchants' saved values live under it.
- Changes are listed in `CHANGELOG.md`.

Before a production release:

- [ ] `npm test` and `npm run typecheck:ci` pass.
- [ ] Every key in `appbrew.settings` is in the section 4 table, in the same order (a test checks this).
- [ ] The version in section 3 and in section 5 matches `package.json`.
- [ ] Tested on a real Appbrew app build on Android and iOS with the checklist in section 7.
- [ ] `CHANGELOG.md` has the new version.

## 11. Support

| Item | Value |
| --- | --- |
| Partner contact | Linkrunner support, [support@linkrunner.io](mailto:support@linkrunner.io) |
| Appbrew contact | Madhav Setia |
| Status page / SLA | None |

License: MIT
