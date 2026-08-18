import { LocalStorage } from '@gauntlet/local-storage'

/**
 * MMKV-backed, synchronous, and scoped to the install — the same store Appbrew
 * uses for its own `has-booted` flag. Exactly the lifetime `signup()` wants.
 *
 * Caveat worth knowing: on iOS this lives in the app container, so it survives
 * relaunch and dies on delete-and-reinstall, but an iCloud/iTunes device
 * restore can bring it back. In that case we skip a `signup()` on a device
 * Linkrunner considers a fresh install. Acceptable — the alternative is a
 * duplicate signup on every restore.
 */
const KEYS = {
  /**
   * The customer id we have already called `signup()` for.
   *
   * Deliberately the id and not a boolean: user A signs up, logs out, user B
   * logs in on the same device — with a boolean, B would never get a `signup()`
   * at all. Comparing ids gives "once per (install, user)" at the same cost.
   */
  SIGNED_UP_USER_ID: 'lr:signed-up-user-id',
  /** Last known customer id, so a relaunch can set identity before the store hydrates. */
  CUSTOMER_ID: 'lr:customer-id',
  /**
   * Deferred deep link already handled.
   *
   * `getAttributionData()` will hand back the same deferred URL on every cold
   * start. Without this flag we would re-navigate the user to the campaign
   * landing page forever.
   */
  DEFERRED_CONSUMED: 'lr:deferred-consumed',
} as const

function storage() {
  return LocalStorage.getInstance()
}

export const trackerStorage = {
  getSignedUpUserId(): string | undefined {
    try {
      return storage().getString(KEYS.SIGNED_UP_USER_ID) || undefined
    } catch {
      return undefined
    }
  },
  setSignedUpUserId(id: string) {
    try {
      storage().set(KEYS.SIGNED_UP_USER_ID, id)
    } catch {
      /* storage is best-effort */
    }
  },

  getCustomerId(): string | undefined {
    try {
      return storage().getString(KEYS.CUSTOMER_ID) || undefined
    } catch {
      return undefined
    }
  },
  setCustomerId(id: string) {
    try {
      storage().set(KEYS.CUSTOMER_ID, id)
    } catch {
      /* storage is best-effort */
    }
  },
  clearCustomerId() {
    try {
      storage().delete(KEYS.CUSTOMER_ID)
    } catch {
      /* storage is best-effort */
    }
  },

  isDeferredConsumed(): boolean {
    try {
      return !!storage().getBoolean(KEYS.DEFERRED_CONSUMED)
    } catch {
      return false
    }
  },
  markDeferredConsumed() {
    try {
      storage().set(KEYS.DEFERRED_CONSUMED, true)
    } catch {
      /* storage is best-effort */
    }
  },
}

export { KEYS as TRACKER_STORAGE_KEYS }
