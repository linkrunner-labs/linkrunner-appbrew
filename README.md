# @linkrunner/appbrew

[![npm](https://img.shields.io/npm/v/@linkrunner/appbrew)](https://www.npmjs.com/package/@linkrunner/appbrew)

Linkrunner attribution for [Appbrew](https://appbrew.tech) apps — install attribution, in-app event forwarding, revenue, deep links and uninstall measurement.

## What this is

An **adapter**, not an SDK. It translates between Appbrew's analytics system and the Linkrunner React Native SDK, which does the actual work.

```
Appbrew app fires "add_to_cart"
        │
        ▼
AnalyticsProvider → LinkrunnerTrackerV2      ← this package (pure TypeScript)
        │
        ▼
   rn-linkrunner                             ← the SDK (native Kotlin / Swift)
        │
        ▼
   api.linkrunner.io
```

| Package | Role |
| --- | --- |
| [`@linkrunner/appbrew`](https://www.npmjs.com/package/@linkrunner/appbrew) | This package. `LinkrunnerTrackerV2 extends AnalyticsTrackerV2`. |
| [`rn-linkrunner`](https://www.npmjs.com/package/rn-linkrunner) | Linkrunner React Native SDK. Native module. |

## Requirements

- An Appbrew app (`@gauntlet/*` packages)
- `rn-linkrunner` >= 3.0.0
- iOS 15.0+, Android minSdk 24
- A Linkrunner project token — [dashboard → Settings](https://dashboard.linkrunner.io/dashboard?s=members&m=documentation)

---

# Getting started

## 1. Install

```bash
pnpm add @linkrunner/appbrew rn-linkrunner
cd ios && pod install
```

Adding this integration requires a **new binary build** (`requiresNativeBuild: true`).

## 2. Android setup

One change. In `android/app/src/main/AndroidManifest.xml`:

```xml
<application
  android:dataExtractionRules="@xml/linkrunner_backup_rules"      <!-- API 31+ -->
  android:fullBackupContent="@xml/linkrunner_backup_descriptor">  <!-- API 23-30 -->
```

This excludes the SDK's SharedPreferences from Android auto-backup. Without it the install ID is restored on reinstall, so a **genuine reinstall reads as an existing install** and reinstall attribution breaks silently. Both rule files ship inside `rn-linkrunner` as library resources — nothing to author.

If the app already has backup configuration, merge the exclusion into it instead:

```xml
<exclude domain="sharedpref" path="io.linkrunner.sdk_prefs"/>
```

**Nothing else is needed.** `INTERNET`, `ACCESS_NETWORK_STATE` and `com.google.android.gms.permission.AD_ID` are declared by the SDK and merged automatically by Gradle, and Play Install Referrer, GAID and App Set ID arrive as transitive dependencies.

Reference: [Android backup configuration](https://docs.linkrunner.io/sdk/android#backup-configuration)

## 3. iOS setup

`pod install` only.

`NSUserTrackingUsageDescription` is normally already present in an Appbrew app. If not:

```xml
<key>NSUserTrackingUsageDescription</key>
<string>This identifier will be used to deliver personalized ads and improve your app experience.</string>
```

You do **not** need to handle ATT — Appbrew presents the prompt itself in `@gauntlet/brewery` and awaits it before initialising trackers, so IDFA is already resolved by the time this package runs.

## 4. Register the tracker

In `src/app/App.tsx`:

```typescript
import { AnalyticsProvider } from '@gauntlet/analytics'
import { LinkrunnerTrackerV2 } from '@linkrunner/appbrew'

AnalyticsProvider.getInstance().addTracker(new LinkrunnerTrackerV2())
```

No token in code — see below.

## 5. Configure in the Appbrew dashboard

The token is entered per store by the Appbrew team, arrives in the app config at `config.integrations.linkrunner`, and the tracker reads it on launch. The `appbrew.settings` manifest in this package's `package.json` generates that form.

| Key | Required | Default | Purpose |
| --- | --- | --- | --- |
| `token` | **yes** | — | Linkrunner project token. Without it the tracker stays disabled. |
| `secretKey` | no | — | Signing secret, paired with `keyId`. [SDK signing](https://dashboard.linkrunner.io/settings?s=sdk-signing) |
| `keyId` | no | — | Key id, paired with `secretKey`. |
| `debug` | no | `false` | Verbose SDK logging. |
| `disableIdfa` | no | `false` | Opt out of IDFA even when ATT was granted. |
| `enablePIIHashing` | no | `false` | Hash email/phone on-device before they leave. |
| `trackScreenViews` | no | `false` | Forward `screen_view` / `page_view`. Off — highest-volume events by a wide margin. |
| `deeplinkRouting` | no | `true` | Route resolved deferred deep links into the Appbrew router. |
| `uninstallTracking` | no | `true` | Register the push token for uninstall measurement. |
| `enableRefunds` | no | `false` | Forward `refund` to `removePayment`. See [Refunds](#refunds). |
| `eventsMapper` / `paramsMapper` | no | `{}` | Rename events / params before sending. |
| `eventsWhitelist` / `paramsWhitelist` | no | all | Restrict what is forwarded. |

### Local development

The demo store config has no `integrations.linkrunner` key, so pass the token directly — constructor options override remote config:

```typescript
new LinkrunnerTrackerV2({ token: Config.getConstants().LINKRUNNER_TOKEN, debug: true })
```

Never do this in production. Note also that the sample app registers trackers inside `if (!__DEV__)` — move the registration outside that guard to test in a debug build.

---

# Event mapping

**Event names are forwarded verbatim.** `add_to_cart` reaches Linkrunner as `add_to_cart`. Linkrunner has no enforced event enum, and mapping a name onto a Meta standard event happens in the dashboard regardless — so renaming in code would only put every new Appbrew event behind a package release plus a native rebuild.

## Handled specially

| Appbrew event | Linkrunner call |
| --- | --- |
| `purchase` | `capturePayment()` |
| `refund` | `removePayment()` — off by default |
| `signup` | identity resolution → `signup()` or `setUserData()` |
| `login` | identity resolution → `signup()` or `setUserData()` |
| `logout` | `setCustomerUserId(<device id>)` — no event sent |
| `app_install_android` / `app_install_ios` | dropped — `init()` already records the install |

## Forwarded as custom events

`view_item` · `view_item_list` · `view_cart` · `add_to_cart` · `remove_from_cart` · `add_to_wishlist` · `remove_from_wishlist` · `begin_checkout` · `add_shipping_info` · `apply_coupon` · `remove_coupon` · `search` · `notify_back_in_stock` · `push_notification_subscribed` · `push_notification_unsubscribed` · `screen_view`\* · `page_view`\*

\* off unless `trackScreenViews` is enabled.

## Not mapped

`add_payment_info` · `select_item` · `select_promotion` · `view_block` · `view_promotion`

Declared in `AnalyticsEvent` but with zero call sites anywhere in `@gauntlet/*` — they never fire. Exported as `NEVER_FIRED_EVENTS`.

## Payload transform

Events carrying `items[]` get [Meta Catalog Sales](https://docs.linkrunner.io/ecommerce-manager/meta-commerce-manager) fields merged in alongside the raw Appbrew keys.

Appbrew gives:

```json
{ "value": 195, "currency": "USD",
  "items": [{ "item_id": "7486390763543", "item_variant": "41996942409751",
              "price": 195, "quantity": 1, "item_size": "L" }] }
```

Linkrunner receives:

```json
{ "content_ids": ["41996942409751"],
  "item_group_ids": ["7486390763543"],
  "contents": [{ "id": "41996942409751", "quantity": 1, "item_price": 195 }],
  "content_type": "product", "value": 195, "currency": "USD", "num_items": 1,
  "items": [{ "...": "raw Appbrew keys preserved, incl. item_size" }] }
```

`content_ids` uses the **variant** id because that is what Shopify-fed Meta catalogues key on; `item_group_ids` carries the product id. `item_price` must match the catalogue price or Meta's match rate degrades silently.

## Dashboard mapping is required

Sending an event is not enough to reach Meta. Map each name to its standard commerce event in **Linkrunner dashboard → Meta Ads → Event Mapping**:

| Appbrew event | Meta standard event |
| --- | --- |
| `add_to_cart` | `AddToCart` |
| `view_item` | `ViewContent` |
| payment type `DEFAULT` | `Purchase` |

Without it, events are captured by Linkrunner but never sync — silently.

---

# Identity

```
app open        → init() → setCustomerUserId(<device instance id>)
user identified → signup()       (first time this user on this install)
                → setUserData()  (every time after)
logout          → setCustomerUserId(<device instance id>)
```

`init()` runs on **every app open**, not once per install.

The signup/setUserData decision keys on **`(install, customer id)`**, not on which event arrived:

| Scenario | Fires |
| --- | --- |
| Signup, then login | `signup()`, then `setUserData()` |
| **Reinstall, login only** | **`signup()`** — storage is wiped with the install |
| **Second user, shared device** | **`signup()`** — different id |
| Same user, later launches | `setUserData()` |

Hard-mapping `login → setUserData()` would break the middle two cases, which is why the flag stores the customer id rather than a boolean.

**Guest checkout works.** `setCustomerUserId` runs at init, so every device carries a stable id before any login, and `capturePayment` creates the identity itself.

---

# Revenue

`purchase` goes to `capturePayment`, not `trackEvent`:

```typescript
capturePayment({
  paymentId: "#1001",          // transaction_id — the dedup key
  userId:    "9538196275417",  // Shopify customer id, or device id for guests
  amount:    195,
  type:      "DEFAULT",        // constant — the other half of the dedup key
  status:    "PAYMENT_COMPLETED",
  currency:  "USD",
  eventData: { /* Meta fields + order_id */ },
})
```

`transaction_id` is passed verbatim as `paymentId`. Linkrunner dedupes idempotently on `(type, payment_id)` — the only real protection, since Appbrew dedupes purchases in an in-memory `Set` that does not survive a process restart. Killing the app on the thank-you screen re-emits the event.

**Do not also call `capturePayment` from a Shopify webhook** for the same order unless both sides send an identical `payment_id`, or one payment produces two records.

Reference: [Revenue tracking](https://docs.linkrunner.io/api-reference/revenue-tracking)

## Refunds

Off by default. Enable with `enableRefunds` only after verifying the id mapping against a real store.

`removePayment({ userId })` with no `paymentId` deletes **every** payment for that user. The two ids also come from different namespaces — purchases carry `cart.order.name`, refunds carry `orderData.id` — so the call usually no-ops rather than matching.

---

# Deep linking

| | Source | Routed? |
| --- | --- | --- |
| **Direct** (user taps a link) | `Linking` → `handleDeeplink()` | No — Appbrew already routes it |
| **Deferred** (first open after install) | `getAttributionData()` | Yes, into an empty slot only |

Deliberately asymmetric: a user-initiated link is authoritative, so touching the router would double-navigate. A deferred link is speculative and may only fill an empty slot — losing one is cheaper than hijacking an intentional tap. Deferred routing applies once per install.

Set `deeplinkRouting: false` to report links for attribution without routing.

## Native configuration

Store-specific and not supplied by this package:

- **iOS** — add the tracking domain to Associated Domains (`applinks:link.yourstore.com`)
- **Android** — an intent filter plus a hosted `assetlinks.json`

Host the verification files under **Project Settings → Domain Verification** in the dashboard; Linkrunner serves them from `/.well-known/`.

References: [Deep linking setup](https://docs.linkrunner.io/features/deep-linking-setup) · [handleDeeplink](https://docs.linkrunner.io/sdk/react-native#handle-deeplink) · [debugging domain verification](https://docs.linkrunner.io/features/deep-linking-setup#debugging-domain-verification)

---

# Uninstall tracking

The device push token is registered on init — APNs on iOS, FCM on Android — and re-sent whenever Android rotates it. `@react-native-firebase/messaging` is an optional peer; without it this quietly does nothing.

Configure **Settings → Uninstall Tracking** in the dashboard (Firebase Project ID for Android; APNs p8 key, Key ID, Bundle ID and Team ID for iOS), or the token is accepted but no uninstall is ever reported.

Linkrunner detects uninstalls with a silent push — ignore those in your FCM handler:

```javascript
messaging().onMessage(async (msg) => {
  if (msg.data?.['lr-uninstall-tracking']) return
  // ...
})
```

Set `uninstallTracking: false` to disable.

---

# Verifying an integration

1. Build with `debug: true`. The SDK logs on init:
   ```
   Linkrunner initialised successfully
   ```
2. Check [dashboard → Events Settings](https://dashboard.linkrunner.io/dashboard/settings/events) — the install and events should appear.
3. Exercise the funnel: view a product → add to cart → checkout.
4. Confirm a purchase produces **one** payment, and that relaunching does not duplicate it.
5. Deep links:
   ```bash
   adb shell am start -a android.intent.action.VIEW -d "<url>" <package>
   xcrun simctl openurl booted "<url>"
   ```

Reference: [Integration testing](https://docs.linkrunner.io/testing/integration-testing)

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `no token in config.integrations.linkrunner — tracker disabled` | Token not set in the dashboard for this store |
| No events at all | Registration is inside `if (!__DEV__)`, or the whitelist excludes them |
| Events in Linkrunner but not Meta | Event not mapped under Meta Ads → Event Mapping |
| Reinstalls read as existing installs | Backup rules missing from `AndroidManifest.xml` |
| Deep link opens the app but does not navigate | Domain verification incomplete |
| Duplicate payments | `capturePayment` called from both app and webhook with different `payment_id` |

---

# API

```typescript
import {
  LinkrunnerTrackerV2,     // the tracker — register with AnalyticsProvider
  LinkrunnerTracker,       // alias
  toEcommercePayload,      // Appbrew items[] → Meta Catalog Sales fields
  buildEventData,
  buildPurchaseEventData,
  NEVER_FIRED_EVENTS,      // the 5 declared-but-dead Appbrew events
  HANDLED_SEPARATELY,      // events not forwarded via trackEvent
  trackerStorage,
} from '@linkrunner/appbrew'

import type {
  LinkrunnerIntegrationConfig,
  LinkrunnerTrackerOptions,
  EcommercePayload,
} from '@linkrunner/appbrew'
```

## Links

- [Linkrunner React Native SDK](https://docs.linkrunner.io/sdk/react-native)
- [Event capture API](https://docs.linkrunner.io/api-reference/event-capture)
- [Revenue tracking API](https://docs.linkrunner.io/api-reference/revenue-tracking)
- [Meta Commerce Manager](https://docs.linkrunner.io/ecommerce-manager/meta-commerce-manager)
- [SKAdNetwork integration](https://docs.linkrunner.io/features/skadnetwork-integration)
- [Appbrew integration docs](https://github.com/appbrew-community/sample-appbrew-app/blob/main/docs/index.md)

Support: [support@linkrunner.io](mailto:support@linkrunner.io)

## License

MIT
