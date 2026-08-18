const SHOPIFY_CUSTOMER_PREFIX = 'gid://shopify/Customer/'

/**
 * Appbrew hands us Shopify customer ids as GIDs in some paths and bare numeric
 * ids in others. Linkrunner wants one stable form, so normalise to the bare id.
 */
export function normalizeCustomerId(id?: string | number | null) {
  if (id === undefined || id === null) return undefined
  const str = String(id).trim()
  if (!str) return undefined
  const bare = str.startsWith(SHOPIFY_CUSTOMER_PREFIX)
    ? str.slice(SHOPIFY_CUSTOMER_PREFIX.length)
    : str
  return bare || undefined
}

/**
 * Reject a promise that never settles.
 *
 * Every SDK call is serialised through one FIFO chain (see `Serializer`), so a
 * single hung native promise would otherwise wedge the tracker for the rest of
 * the session.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`linkrunner: ${label} timed out after ${ms}ms`)),
        ms
      )
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>
}

/**
 * Serialises SDK calls into a single FIFO chain.
 *
 * Appbrew's `AnalyticsTrackerV2` invokes `sendEvent` / `setUserDetails`
 * fire-and-forget — it never awaits them. Without this, "signup was issued
 * before the purchase" would not imply "signup completed before the purchase",
 * and a payment could land against an anonymous id that dedup then makes
 * permanent.
 */
export class Serializer {
  private chain: Promise<unknown> = Promise.resolve()

  run(label: string, fn: () => Promise<unknown>, timeoutMs = 8000) {
    const next = this.chain
      .catch(() => undefined)
      .then(() => withTimeout(Promise.resolve(fn()), timeoutMs, label))
      .catch((error) => {
        // Never rethrow: an unhandled rejection here would surface as a redbox
        // in the host app for what is, at worst, one lost analytics call.
        console.warn(`[linkrunner/appbrew] ${label} failed`, error)
      })
    this.chain = next
    return next as Promise<void>
  }
}

/** `Number(...)` on Appbrew cart totals can yield NaN, which `removeUndefined` does not strip. */
export function finiteNumber(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function nonEmptyString(value: unknown) {
  if (value === undefined || value === null) return undefined
  const str = String(value).trim()
  return str.length > 0 ? str : undefined
}
