import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const appState = vi.hoisted(() => ({
  listener: undefined as undefined | ((state: string) => void),
}))

vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: vi.fn((_: string, fn: (state: string) => void) => {
      appState.listener = fn
      return { remove: vi.fn() }
    }),
  },
}))

import { bootstrapPushOpens, extractPushLink } from '../src/pushOpens'

const PUSH_URL =
  'https://links.store.example/collections/joggers?c=Ab12Cd'

/** Let promise chains and the trigger poll settle. */
const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r))
}

function fakeMessaging(initial: any = null) {
  const opened: Array<(message: any) => void> = []
  const instance = {
    onNotificationOpenedApp: vi.fn((fn: (message: any) => void) => {
      opened.push(fn)
      return vi.fn()
    }),
    getInitialNotification: vi.fn(async () => initial),
  }
  return {
    load: () => () => instance,
    instance,
    open: (message: any) => opened.forEach((fn) => fn(message)),
  }
}

function fakeNotifee() {
  const listeners: Array<(event: any) => void> = []
  return {
    module: {
      EventType: { DISMISSED: 0, PRESS: 1 },
      onForegroundEvent: vi.fn((fn: (event: any) => void) => {
        listeners.push(fn)
        return vi.fn()
      }),
    },
    emit: (event: any) => listeners.forEach((fn) => fn(event)),
  }
}

const none = {
  messaging: () => undefined,
  notifee: () => undefined,
  firebasePush: () => undefined,
}

let report: ReturnType<typeof vi.fn>

beforeEach(() => {
  report = vi.fn(async () => undefined)
  appState.listener = undefined
})

afterEach(() => {
  vi.useRealTimers()
})

describe('extractPushLink', () => {
  it('reads data.link from an FCM message', () => {
    expect(extractPushLink({ data: { link: PUSH_URL } })).toBe(PUSH_URL)
  })

  it('reads notification.data.link, as FirebasePush does', () => {
    expect(
      extractPushLink({ notification: { data: { link: PUSH_URL } } })
    ).toBe(PUSH_URL)
  })

  it('reads the stored notifee { type, detail } event', () => {
    expect(
      extractPushLink({
        type: 1,
        detail: { notification: { data: { link: PUSH_URL } } },
      })
    ).toBe(PUSH_URL)
  })

  it('takes the url out of a JSON route', () => {
    const link = JSON.stringify({ kind: 'url', value: PUSH_URL })
    expect(extractPushLink({ data: { link } })).toBe(PUSH_URL)
  })

  it('ignores a JSON route to a screen handle', () => {
    const link = JSON.stringify({ kind: 'collection', value: 'mens-joggers' })
    expect(extractPushLink({ data: { link } })).toBeUndefined()
  })

  it('ignores missing, blank and non-http links', () => {
    expect(extractPushLink(null)).toBeUndefined()
    expect(extractPushLink({ data: {} })).toBeUndefined()
    expect(extractPushLink({ data: { link: '  ' } })).toBeUndefined()
    expect(extractPushLink({ data: { link: 'store://cart' } })).toBeUndefined()
  })
})

describe('bootstrapPushOpens', () => {
  it('reports a background tap from onNotificationOpenedApp', async () => {
    const messaging = fakeMessaging()
    bootstrapPushOpens({
      report,
      sources: { ...none, messaging: messaging.load },
    })

    messaging.open({ messageId: 'm1', data: { link: PUSH_URL } })
    await flush()

    expect(report).toHaveBeenCalledWith('handleDeeplink:push:opened', PUSH_URL)
  })

  it('reports the cold start message from getInitialNotification', async () => {
    const messaging = fakeMessaging({ data: { link: PUSH_URL } })
    bootstrapPushOpens({
      report,
      sources: { ...none, messaging: messaging.load },
    })
    await flush()

    expect(report).toHaveBeenCalledWith('handleDeeplink:push:initial', PUSH_URL)
  })

  it('reports a foreground notifee press and ignores other event types', async () => {
    const notifee = fakeNotifee()
    bootstrapPushOpens({
      report,
      sources: { ...none, notifee: () => notifee.module },
    })

    notifee.emit({
      type: 0,
      detail: { notification: { data: { link: PUSH_URL } } },
    })
    expect(report).not.toHaveBeenCalled()

    notifee.emit({
      type: 1,
      detail: { notification: { data: { link: PUSH_URL } } },
    })
    expect(report).toHaveBeenCalledWith(
      'handleDeeplink:push:foreground',
      PUSH_URL
    )
  })

  it('picks up the cold start FirebasePush consumed, once it is set', async () => {
    vi.useFakeTimers()
    const FirebasePush: any = {
      instance: { notificationTriggerMessage: null },
    }
    bootstrapPushOpens({
      report,
      sources: { ...none, firebasePush: () => FirebasePush },
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(report).not.toHaveBeenCalled()

    FirebasePush.instance.notificationTriggerMessage = {
      data: { link: PUSH_URL },
    }
    await vi.advanceTimersByTimeAsync(500)

    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith('handleDeeplink:push:trigger', PUSH_URL)
  })

  it('checks the trigger again on resume and skips one already reported', async () => {
    vi.useFakeTimers()
    const first = { data: { link: PUSH_URL } }
    const FirebasePush: any = {
      instance: { notificationTriggerMessage: first },
    }
    bootstrapPushOpens({
      report,
      sources: { ...none, firebasePush: () => FirebasePush },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(report).toHaveBeenCalledTimes(1)

    appState.listener?.('active')
    await vi.advanceTimersByTimeAsync(5000)
    expect(report).toHaveBeenCalledTimes(1)

    const second = {
      data: { link: 'https://links.store.example/products/tee?c=abc' },
    }
    FirebasePush.instance.notificationTriggerMessage = second
    appState.listener?.('active')
    await vi.advanceTimersByTimeAsync(300)
    expect(report).toHaveBeenCalledTimes(2)
    expect(report).toHaveBeenLastCalledWith(
      'handleDeeplink:push:trigger',
      'https://links.store.example/products/tee?c=abc'
    )
  })

  it('never creates a FirebasePush instance', async () => {
    const getInstance = vi.fn()
    const FirebasePush: any = { getInstance }
    bootstrapPushOpens({
      report,
      sources: { ...none, firebasePush: () => FirebasePush },
    })
    await flush()
    expect(getInstance).not.toHaveBeenCalled()
  })

  it('does nothing when no push module is installed', async () => {
    const cleanup = bootstrapPushOpens({ report, sources: none })
    await flush()
    expect(report).not.toHaveBeenCalled()
    expect(() => cleanup()).not.toThrow()
  })

  it('survives a messaging module that throws', async () => {
    const messaging = () => () => {
      throw new Error('no default app')
    }
    expect(() =>
      bootstrapPushOpens({ report, sources: { ...none, messaging } })
    ).not.toThrow()
    await flush()
    expect(report).not.toHaveBeenCalled()
  })
})
