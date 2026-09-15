import { describe, expect, it } from 'vitest'

import { readClevertapId, readFirebaseAnalyticsIds } from '../src/integrations'

describe('readFirebaseAnalyticsIds', () => {
  it('returns nothing when the module is not installed', async () => {
    // Default loader requires the real package, which is absent here.
    expect(await readFirebaseAnalyticsIds()).toEqual({})
  })

  it('returns nothing when the loader throws', async () => {
    expect(
      await readFirebaseAnalyticsIds(() => {
        throw new Error('not linked')
      })
    ).toEqual({})
  })

  it('reads both ids and stringifies the numeric session id', async () => {
    const analytics = () => ({
      getAppInstanceId: async () => 'abc123',
      getSessionId: async () => 1710000000,
    })
    expect(await readFirebaseAnalyticsIds(() => analytics)).toEqual({
      ga_app_instance_id: 'abc123',
      ga_session_id: '1710000000',
    })
  })

  it('unwraps a default export', async () => {
    const analytics = () => ({
      getAppInstanceId: async () => 'abc123',
      getSessionId: async () => null,
    })
    expect(await readFirebaseAnalyticsIds(() => ({ default: analytics }))).toEqual({
      ga_app_instance_id: 'abc123',
    })
  })

  it('drops a field whose lookup rejects, keeping the other', async () => {
    const analytics = () => ({
      getAppInstanceId: async () => {
        throw new Error('unsupported')
      },
      getSessionId: async () => 42,
    })
    expect(await readFirebaseAnalyticsIds(() => analytics)).toEqual({
      ga_session_id: '42',
    })
  })
})

describe('readClevertapId', () => {
  it('returns undefined when the module is not installed', async () => {
    expect(await readClevertapId()).toBeUndefined()
  })

  it('resolves the id from the callback API', async () => {
    const CleverTap = {
      getCleverTapID: (cb: (err: unknown, id: string) => void) =>
        cb(null, ' ct-1 '),
    }
    expect(await readClevertapId(() => CleverTap)).toBe('ct-1')
  })

  it('returns undefined on a callback error or empty id', async () => {
    expect(
      await readClevertapId(() => ({
        getCleverTapID: (cb: any) => cb(new Error('no id'), 'x'),
      }))
    ).toBeUndefined()
    expect(
      await readClevertapId(() => ({
        getCleverTapID: (cb: any) => cb(null, ''),
      }))
    ).toBeUndefined()
  })

  it('returns undefined when the bridge throws synchronously', async () => {
    expect(
      await readClevertapId(() => ({
        getCleverTapID: () => {
          throw new Error('bridge down')
        },
      }))
    ).toBeUndefined()
  })
})
