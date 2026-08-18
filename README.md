# @linkrunner/appbrew

Linkrunner attribution for Appbrew apps: install attribution, in-app event forwarding, revenue capture, and deep links.

## Install

```bash
pnpm add @linkrunner/appbrew rn-linkrunner
cd ios && bundle exec pod install
```

Adding this integration requires a new binary build (`requiresNativeBuild: true`).

## Register

```typescript
import { AnalyticsProvider } from '@gauntlet/analytics'
import { LinkrunnerTrackerV2 } from '@linkrunner/appbrew'

// in initApp()
AnalyticsProvider.getInstance().addTracker(new LinkrunnerTrackerV2())
```

For local development, where the demo store config has no `integrations.linkrunner` key, pass the token directly — constructor options override the remote config:

```typescript
new LinkrunnerTrackerV2({ token: Config.getConstants().LINKRUNNER_TOKEN, debug: true })
```

Note the sample app registers trackers inside `if (!__DEV__)`. Move the registration outside that guard to test in a debug build.

## Settings

Read at runtime from `config.integrations.linkrunner`.

| Key | Required | Purpose |
|---|---|---|
| `token` | yes | Linkrunner project token. Without it the tracker stays disabled. |
| `secretKey` | no | Signing secret, paired with `keyId`. |
| `keyId` | no | Key id, paired with `secretKey`. |
| `debug` | no | Verbose SDK logging. |
| `disableIdfa` | no | Opt out of IDFA even when ATT was granted. |
| `enablePIIHashing` | no | Hash email/phone on-device before they leave the app. |
| `trackScreenViews` | no | Forward `screen_view`. **Off by default** — highest-volume event by a wide margin. |
| `deeplinkRouting` | no | Route resolved deferred deep links into the Appbrew router. Defaults to on. |
| `uninstallTracking` | no | Register the device push token for uninstall measurement. Defaults to on; no-ops without `@react-native-firebase/messaging`. |
| `enableRefunds` | no | Forward `refund` to `removePayment`. **Off by default** — see Refunds. |
| `eventsMapper` / `paramsMapper` | no | Rename events/params before sending. |
| `eventsWhitelist` / `paramsWhitelist` | no | Restrict what is forwarded. Defaults to everything. |

## Analytics

Exports `LinkrunnerTrackerV2` (`AnalyticsTrackerV2`) and `LinkrunnerTracker` as an alias.

**Event names are forwarded verbatim.** `add_to_cart` reaches Linkrunner as `add_to_cart`. Linkrunner has no enforced event enum, and mapping a custom name onto a standard commerce event happens in the dashboard regardless — so renaming in code would only put every new Appbrew event behind a package release and a native rebuild.

| Appbrew event | Linkrunner call |
|---|---|
| 21 live non-purchase events | `trackEvent(<name>, eventData)` |
| `purchase` | `capturePayment()` |
| `refund` | `removePayment()` — off by default |
| `logout` | resets identity to the device id |
| `app_install_android` / `app_install_ios` | dropped — `init()` already records the install |
| `screen_view` / `page_view` | `trackEvent`, off by default |

Events with `items[]` get Meta Catalog Sales fields merged into `eventData` alongside the raw Appbrew keys: `content_ids` (variant id), `item_group_ids` (product id), `contents`, `content_type`, `value`, `currency`, `num_items`, plus `order_id` on purchase.

Five events — `add_payment_info`, `select_item`, `select_promotion`, `view_block`, `view_promotion` — are declared in `AnalyticsEvent` but have no call sites anywhere in `@gauntlet/*` and never fire. They are listed in `NEVER_FIRED_EVENTS` and deliberately not mapped.

### Dashboard mapping is required

Sending an event is not enough to reach Meta. Map each event to its standard commerce event in the Linkrunner dashboard under **Meta Ads → Event Mapping** — `add_to_cart` → `AddToCart`, `view_item` → `ViewContent`, and the payment type (`DEFAULT`) → `Purchase`. Without the mapping, events are captured by Linkrunner but never sync.

## Identity

- `setCustomerUserId(<Appbrew instance id>)` runs at init, so guests always carry a stable id.
- On first identification, `signup()`; afterwards `setUserData()`. Tracked per `(install, user)` so re-login does not create a second signup, and a second user on the same device still gets their own.
- `capturePayment.userId` resolves synchronously from the store at call time — the Shopify customer id when present, the device instance id otherwise.
- `logout` resets identity to the device id.

Guest checkout attributes correctly. Revenue is tied to the device's install context, not to a prior `signup()`.

## Revenue

`transaction_id` is passed through as `paymentId`. Linkrunner deduplicates idempotently on `(type, payment_id)`, and `type` is a constant for exactly that reason — deriving it per-call would change the dedup key and let duplicates through.

This matters because Appbrew's provider deduplicates purchases in an in-memory `Set` that does not survive a process restart, so killing the app on the thank-you screen re-emits the event.

**Do not also call `capturePayment` from a Shopify webhook for the same order** unless both sides send an identical `payment_id` — two different ids for one payment produce two records.

### Refunds

Off by default, and never called without a payment id.

`removePayment({ userId })` with no `paymentId` deletes **every** payment for that user. The two ids also come from different namespaces: purchases carry `transaction_id = cart.order.name || numericOrderId || cartId` (`getPurchaseInfo`), refunds carry `transaction_id = orderData.id` (`getOrderInfo`). Verify the mapping against a real store before enabling.

## Uninstall tracking

The device push token is registered automatically on init — the APNs token on
iOS, the FCM token on Android — and re-sent whenever Android rotates it.
`@react-native-firebase/messaging` is an optional peer; without it this quietly
does nothing.

Also configure **Settings → Uninstall Tracking** in the Linkrunner dashboard
(Firebase Project ID for Android; APNs p8 key, Key ID, Bundle ID and Team ID for
iOS). Without that the token is accepted but no uninstall is ever reported.

Linkrunner detects uninstalls with a silent push, so ignore those pings in your
FCM handler or they surface as visible notifications:

```javascript
messaging().onMessage(async (msg) => {
  if (msg.data?.['lr-uninstall-tracking']) return
  // ...
})
```

Set `uninstallTracking: false` to disable.

## Deep links

Deferred links come from `getAttributionData()` on first open; direct links go through `handleDeeplink()`.

Only deferred links are routed, and only into an empty slot — a user-initiated link is authoritative and Appbrew is already routing it. Losing a deferred destination is cheaper than hijacking an intentional tap. Deferred routing is applied once per install; `getAttributionData()` returns the same URL on every cold start, so replaying it would hijack every launch.

Routing uses the `resetInitialUrl()` → `setInitialUrl()` pattern Appbrew uses on itself in `@gauntlet/brewery/src/app-init.tsx`. A plain `setInitialUrl()` is silently dropped whenever a stale URL occupies the slot, which is the normal state after a cold-start link — `getInitialURL` in `@gauntlet/state/src/lib/hooks/deeplink.ts` tries to clear it with `setInitialUrl(null)`, which returns on its own null guard and clears nothing.

## ATT

Nothing to configure. Appbrew presents the iOS ATT prompt itself in `@gauntlet/brewery/src/shell.tsx` and awaits it before calling `trackersInit()`, so IDFA is already granted or denied by the time this tracker initialises.

## Native dependencies

Peer-depends on `rn-linkrunner` (native module: `io.linkrunner:android-sdk` on Android, `LinkrunnerKit` on iOS, minimum iOS 15.0). Adding it requires a new binary build.

### Handled for you

The Android SDK declares its own permissions (`INTERNET`, `ACCESS_NETWORK_STATE`, `com.google.android.gms.permission.AD_ID`) and a `<queries>` block, all merged in by Gradle's manifest merger. Play Install Referrer, `play-services-ads-identifier`, `play-services-appset` and WorkManager arrive as transitive dependencies. **None of these need adding by hand.**

### Android — required

Exclude the SDK's SharedPreferences from Android auto-backup. Without this the install ID is restored on reinstall, so a genuine reinstall looks like an existing install and reinstall detection breaks.

```xml
<application
  android:dataExtractionRules="@xml/linkrunner_backup_rules"      <!-- API 31+ -->
  android:fullBackupContent="@xml/linkrunner_backup_descriptor">  <!-- API 23-30 -->
```

Both resources ship inside `rn-linkrunner` and merge in as library resources. If the app already has its own backup configuration, merge the exclusion (`domain="sharedpref" path="io.linkrunner.sdk_prefs"`) into it instead.

### Android — required for deep links

An intent filter for the Linkrunner tracking domain, plus a hosted `assetlinks.json` for HTTPS App Links. App-specific, not supplied by the SDK.

### iOS

- `pod install` after adding the dependency
- `NSUserTrackingUsageDescription` in `Info.plist` — usually already present in an Appbrew app, since Appbrew presents the ATT prompt itself
- Associated Domains entitlement and a custom URL scheme, for deep links
- SKAdNetwork endpoints (`NSAdvertisingAttributionReportEndpoint`, `AttributionCopyEndpoint`) — optional, only for SKAN attribution

Bundle id / package name must be registered on the Linkrunner dashboard.

## Known limitations

- `capturePayment` currency is sent both top-level and inside `eventData`. The `rn-linkrunner` JS bridge currently drops the top-level field on both platforms even though the native SDKs accept it; the `eventData` copy preserves the value until that lands.
- Appbrew's registry proxy (`npm.appbrew.tech`) can lag npmjs on `rn-linkrunner` versions. Verify the resolved version if attribution behaves unexpectedly.
