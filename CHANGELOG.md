# Changelog

## 0.1.3

`signup` and `login` now both trigger Linkrunner's `signup()`, in addition to
being forwarded as ordinary events.

Previously the identity lifecycle hung solely off Appbrew's `setUserDetails`
channel. That channel works, but it is a single point of failure: its
subscription has no `fireImmediately`, and `trackersInit()` runs seconds into
the session, so a launch where the user is already logged in can miss it
entirely. Registering the user is what ties subsequent events and revenue to
them, so it is worth two independent triggers rather than one.

Idempotent per (install, user), so the two paths cannot produce a duplicate
signup.

## 0.1.2

Adds uninstall tracking (`setPushToken`), which the React Native SDK docs
document but this package was not implementing — an audit gap, not a design
decision. The APNs token on iOS and the FCM token on Android are registered on
init and re-sent on Android's token refresh, since a stale token silently
breaks uninstall attribution.

`@react-native-firebase/messaging` is an optional peer, loaded lazily so an app
without push degrades quietly instead of crashing. Appbrew apps normally ship
it. Controlled by the new `uninstallTracking` setting, on by default.

## 0.1.1

First working release. `0.1.0` was published from a different, untested copy of
this package: it shipped a different file layout, omitted `peerDependenciesMeta`,
and therefore failed `npm install` outright — npm tried to resolve the
`@gauntlet/*` peers from the public registry, where they do not exist. That
version is unusable and superseded; the number cannot be reused.

This release is the validated tree: 35 tests, CI green, verified end-to-end on
a device against a live Linkrunner project (init, setCustomerUserId, trackEvent
with the Meta Catalog Sales payload, handleDeeplink, getAttributionData).

## 0.1.0 (unreleased)

Initial implementation. Not yet published.

- `LinkrunnerTrackerV2` — Appbrew `AnalyticsTrackerV2` adapter for `rn-linkrunner`
- Event names forwarded verbatim; Meta Catalog Sales fields derived from Appbrew `items[]`
- `purchase` → `capturePayment` keyed on `transaction_id`; `refund` → `removePayment` (off by default)
- Identity: device instance id for guests, `signup()` once per (install, user), logout reset
- Deferred deep links routed into the Appbrew router; direct links reported for attribution only
