import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Order of SDK calls, so "consent before init" can be asserted. */
const calls: string[] = []

vi.mock('react-native', () => ({
  AppState: { currentState: 'active' },
  Linking: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    getInitialURL: vi.fn(async () => null),
  },
  Platform: { OS: 'android' },
}))

vi.mock('rn-linkrunner', () => {
  const record =
    (name: string, impl?: (...args: any[]) => any) =>
    (...args: any[]) => {
      calls.push(name)
      return impl ? impl(...args) : Promise.resolve()
    }
  return {
    default: {
      init: vi.fn(record('init')),
      setConsent: vi.fn(record('setConsent')),
      enableTCFConsentCollection: vi.fn(record('enableTCFConsentCollection')),
      enablePIIHashing: vi.fn(record('enablePIIHashing')),
      setCustomerUserId: vi.fn(record('setCustomerUserId')),
      signup: vi.fn(record('signup')),
      setUserData: vi.fn(record('setUserData')),
      setAdditionalData: vi.fn(record('setAdditionalData')),
      getAttributionData: vi.fn(
        record('getAttributionData', async () => ({
          deeplink: 'https://store.example/products/1',
          campaignData: { id: 'c1', name: 'Launch', type: 'INORGANIC' },
        }))
      ),
      handleDeeplink: vi.fn(
        record('handleDeeplink', async (url: string) => ({
          deeplink: url,
          isLinkrunner: true,
        }))
      ),
      setPushToken: vi.fn(record('setPushToken')),
      trackEvent: vi.fn(record('trackEvent')),
      capturePayment: vi.fn(record('capturePayment')),
      removePayment: vi.fn(record('removePayment')),
    },
  }
})

vi.mock('../src/integrations', () => ({
  readFirebaseAnalyticsIds: vi.fn(async () => ({
    ga_app_instance_id: 'ga-app',
    ga_session_id: '99',
  })),
  readClevertapId: vi.fn(async () => 'ct-1'),
}))

import linkrunner from 'rn-linkrunner'

import { LinkrunnerTrackerV2 } from '../src/analyticsV2'
import * as api from '../src/api'
import { readClevertapId, readFirebaseAnalyticsIds } from '../src/integrations'
import { clearStorage } from './stubs/gauntlet-local-storage'
import { resetState, state } from './stubs/gauntlet-state'

const sdk = linkrunner as unknown as Record<string, ReturnType<typeof vi.fn>>

const withToken = (extra: Record<string, unknown> = {}) => ({
  integrations: { linkrunner: { token: 'tok', ...extra } },
})

/** Let fire-and-forget chains (deeplinks, clevertap, serializer) drain. */
const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r))
}

beforeEach(() => {
  calls.length = 0
  for (const fn of Object.values(sdk)) fn.mockClear()
  vi.mocked(readClevertapId).mockClear()
  vi.mocked(readFirebaseAnalyticsIds).mockClear()
  clearStorage()
  resetState()
})

describe('getAttributionData', () => {
  it('waits for initTracker, then resolves the SDK response', async () => {
    const tracker = new LinkrunnerTrackerV2()
    const pending = tracker.getAttributionData()

    await tracker.initTracker(withToken())
    const data = await pending

    expect(data?.deeplink).toBe('https://store.example/products/1')
    expect(data?.campaignData?.id).toBe('c1')
  })

  it('makes one native call per launch, shared with deferred routing', async () => {
    const tracker = new LinkrunnerTrackerV2()
    await tracker.initTracker(withToken())
    await flush() // bootstrapDeepLinks has called getAttribution by now

    const [a, b] = await Promise.all([
      tracker.getAttributionData(),
      tracker.getAttributionData(),
    ])
    expect(a).toBe(b)
    expect(sdk.getAttributionData).toHaveBeenCalledTimes(1)
  })

  it('resolves undefined without a token and never touches the SDK', async () => {
    const tracker = new LinkrunnerTrackerV2()
    await tracker.initTracker({})
    expect(await tracker.getAttributionData()).toBeUndefined()
    expect(sdk.getAttributionData).not.toHaveBeenCalled()
  })

  it('retries after a failed native call instead of caching the failure', async () => {
    sdk.getAttributionData.mockImplementationOnce(async () => {
      throw new Error('native timeout')
    })
    const tracker = new LinkrunnerTrackerV2({ deeplinkRouting: false })
    await tracker.initTracker(withToken())

    expect(await tracker.getAttributionData()).toBeUndefined()
    expect((await tracker.getAttributionData())?.deeplink).toBeDefined()
    expect(sdk.getAttributionData).toHaveBeenCalledTimes(2)
  })
})

describe('consent', () => {
  it('reaches the SDK before init when configured in the dashboard', async () => {
    const tracker = new LinkrunnerTrackerV2()
    await tracker.initTracker(
      withToken({
        consentIsEEA: 'granted',
        consentAdUserData: 'denied',
        enableTCFConsentCollection: true,
      })
    )

    expect(sdk.setConsent).toHaveBeenCalledWith({
      isEEA: 'granted',
      hasConsentForDataUsage: 'denied',
    })
    expect(calls.indexOf('setConsent')).toBeLessThan(calls.indexOf('init'))
    expect(calls.indexOf('enableTCFConsentCollection')).toBeLessThan(
      calls.indexOf('init')
    )
  })

  it('is not sent at all when nothing is configured', async () => {
    const tracker = new LinkrunnerTrackerV2()
    await tracker.initTracker(withToken())
    expect(sdk.setConsent).not.toHaveBeenCalled()
    expect(sdk.enableTCFConsentCollection).not.toHaveBeenCalled()
  })

  it('setConsent works before the tracker is initialised', () => {
    const tracker = new LinkrunnerTrackerV2()
    tracker.setConsent({ isEEA: 'denied' })
    expect(sdk.setConsent).toHaveBeenCalledWith({ isEEA: 'denied' })
  })
})

describe('user data', () => {
  it('signup carries the Firebase ids and is_first_time_user after a signup event', async () => {
    const tracker = new LinkrunnerTrackerV2()
    await tracker.initTracker(withToken())

    state.user.data.userDetails = {
      status: 'idle',
      data: { id: 'gid://shopify/Customer/42', email: 'a@b.c' },
    }
    await tracker.sendEvent('signup' as any, {})
    await flush()

    expect(sdk.signup).toHaveBeenCalledWith({
      user_data: {
        id: '42',
        email: 'a@b.c',
        is_first_time_user: true,
        ga_app_instance_id: 'ga-app',
        ga_session_id: '99',
      },
    })
  })

  it('omits is_first_time_user on login rather than sending false', async () => {
    const tracker = new LinkrunnerTrackerV2()
    await tracker.initTracker(withToken())

    state.user.data.userDetails = { status: 'idle', data: { id: '42' } }
    await tracker.sendEvent('login' as any, {})
    await flush()

    const [{ user_data }] = sdk.signup.mock.calls[0]
    expect(user_data).not.toHaveProperty('is_first_time_user')
  })

  it('skips the Firebase lookup when analyticsIdentifiers is off', async () => {
    const tracker = new LinkrunnerTrackerV2()
    await tracker.initTracker(withToken({ analyticsIdentifiers: false }))

    state.user.data.userDetails = { status: 'idle', data: { id: '42' } }
    await tracker.setUserDetails({ id: '42' })

    expect(readFirebaseAnalyticsIds).not.toHaveBeenCalled()
    expect(sdk.signup).toHaveBeenCalledWith({ user_data: { id: '42' } })
  })

  it('public setUserData defaults id to the device id for guests', async () => {
    const tracker = new LinkrunnerTrackerV2()
    await tracker.initTracker(withToken())

    await tracker.setUserData({ phone: '9876543210' })

    expect(sdk.setUserData).toHaveBeenCalledWith({
      phone: '9876543210',
      id: 'device-1',
    })
  })

  it('public setUserData keeps an explicit id', async () => {
    const tracker = new LinkrunnerTrackerV2()
    await tracker.initTracker(withToken())
    await tracker.setUserData({ id: 'u-7', name: 'Ann' })
    expect(sdk.setUserData).toHaveBeenCalledWith({ id: 'u-7', name: 'Ann' })
  })
})

describe('CleverTap', () => {
  it('links the CleverTap id after init', async () => {
    const tracker = new LinkrunnerTrackerV2()
    await tracker.initTracker(withToken())
    await flush()
    expect(sdk.setAdditionalData).toHaveBeenCalledWith({ clevertapId: 'ct-1' })
  })

  it('does nothing when the module is absent', async () => {
    vi.mocked(readClevertapId).mockResolvedValueOnce(undefined)
    const tracker = new LinkrunnerTrackerV2()
    await tracker.initTracker(withToken())
    await flush()
    expect(sdk.setAdditionalData).not.toHaveBeenCalled()
  })

  it('can be switched off', async () => {
    const tracker = new LinkrunnerTrackerV2()
    await tracker.initTracker(withToken({ clevertapIntegration: false }))
    await flush()
    expect(readClevertapId).not.toHaveBeenCalled()
  })

  it('public setAdditionalData forwards any integration id', async () => {
    const tracker = new LinkrunnerTrackerV2()
    await tracker.initTracker(withToken({ clevertapIntegration: false }))
    await tracker.setAdditionalData({ clevertapId: 'manual' })
    expect(sdk.setAdditionalData).toHaveBeenCalledWith({ clevertapId: 'manual' })
  })
})

describe('handleDeeplink', () => {
  it('returns the SDK result so callers can check isLinkrunner', async () => {
    const tracker = new LinkrunnerTrackerV2({ deeplinkRouting: false })
    await tracker.initTracker(withToken())
    const result = await tracker.handleDeeplink('https://lr.example/x')
    expect(result).toEqual({ deeplink: 'https://lr.example/x', isLinkrunner: true })
  })

  it('ignores blank urls and disabled trackers', async () => {
    const tracker = new LinkrunnerTrackerV2()
    await tracker.initTracker({})
    expect(await tracker.handleDeeplink('   ')).toBeUndefined()
    expect(await tracker.handleDeeplink('https://x')).toBeUndefined()
    expect(sdk.handleDeeplink).not.toHaveBeenCalled()
  })
})

describe('module-level api', () => {
  it('delegates to the most recently constructed tracker', async () => {
    const tracker = new LinkrunnerTrackerV2({ deeplinkRouting: false })
    expect(api.getActiveTracker()).toBe(tracker)

    const pending = api.getAttributionData()
    await tracker.initTracker(withToken())
    expect((await pending)?.campaignData?.name).toBe('Launch')

    await api.setUserData({ email: 'x@y.z' })
    expect(sdk.setUserData).toHaveBeenCalledWith({ email: 'x@y.z', id: 'device-1' })

    await api.setAdditionalData({ clevertapId: 'ct-9' })
    expect(sdk.setAdditionalData).toHaveBeenLastCalledWith({ clevertapId: 'ct-9' })

    expect((await api.handleDeeplink('https://lr.example/y'))?.isLinkrunner).toBe(true)
  })

  it('setConsent goes straight to the SDK', () => {
    api.setConsent({ hasConsentForAdsPersonalization: 'granted' })
    expect(sdk.setConsent).toHaveBeenCalledWith({
      hasConsentForAdsPersonalization: 'granted',
    })
  })
})
