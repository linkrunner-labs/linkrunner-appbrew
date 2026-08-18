# Changelog

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
