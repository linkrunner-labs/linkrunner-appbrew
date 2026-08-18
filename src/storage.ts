import { LocalStorage } from '@gauntlet/local-storage'

/**
 * MMKV-backed and scoped to the install — the lifetime `signup()` wants.
 *
 * On iOS an iCloud/iTunes restore can bring these back, so a restored device
 * skips a `signup()` Linkrunner would consider due. Preferred over a duplicate
 * signup on every restore.
 */
const KEYS = {
  /**
   * The customer id we have already called `signup()` for. Deliberately the id
   * and not a boolean: with a boolean, a second user on the same device would
   * never get their own signup.
   */
  SIGNED_UP_USER_ID: 'lr:signed-up-user-id',
  /** Lets a relaunch set identity before the store hydrates. */
  CUSTOMER_ID: 'lr:customer-id',
  /**
   * `getAttributionData()` returns the same deferred URL on every cold start;
   * without this flag we would re-navigate to the campaign landing page forever.
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
