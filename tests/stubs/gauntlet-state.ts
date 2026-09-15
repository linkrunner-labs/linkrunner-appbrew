/**
 * Minimal stand-in for `@gauntlet/state`.
 *
 * Exposes a mutable `state` so tests can set the instance id, the logged-in
 * user and the router slot, and a `subscribe` that mirrors zustand's
 * `(selector, listener)` form well enough for `bootstrapDeepLinks`.
 */
type Listener = { selector: (s: any) => any; cb: (v: any) => void; last: any }

const listeners = new Set<Listener>()

export const state: any = {
  analytics: {
    getInstanceId: () => 'device-1',
    getEventSourceUtmParams: async () => ({}),
  },
  user: { data: { userDetails: { status: 'idle', data: undefined } } },
  route: {
    initialUrl: null as string | null,
    resetInitialUrl() {
      state.route.initialUrl = null
    },
    setInitialUrl(url: string | null) {
      state.route.initialUrl = url
      notify()
    },
  },
}

function notify() {
  for (const l of listeners) {
    const next = l.selector(state)
    if (next !== l.last) {
      l.last = next
      l.cb(next)
    }
  }
}

export const useAppStore = {
  getState: () => state,
  subscribe(selector: (s: any) => any, cb: (v: any) => void) {
    const l: Listener = { selector, cb, last: selector(state) }
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export const navigationRef = {
  ready: true,
  isReady() {
    return navigationRef.ready
  },
}

/** Reset between tests. */
export function resetState() {
  state.analytics.getInstanceId = () => 'device-1'
  state.user.data.userDetails = { status: 'idle', data: undefined }
  state.route.initialUrl = null
  navigationRef.ready = true
  listeners.clear()
}
