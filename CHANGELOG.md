# Changelog

## 0.1.0 (unreleased)

Initial implementation. Not yet published.

- `LinkrunnerTrackerV2` — Appbrew `AnalyticsTrackerV2` adapter for `rn-linkrunner`
- Event names forwarded verbatim; Meta Catalog Sales fields derived from Appbrew `items[]`
- `purchase` → `capturePayment` keyed on `transaction_id`; `refund` → `removePayment` (off by default)
- Identity: device instance id for guests, `signup()` once per (install, user), logout reset
- Deferred deep links routed into the Appbrew router; direct links reported for attribution only
