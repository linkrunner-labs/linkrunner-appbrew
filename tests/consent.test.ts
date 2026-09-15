import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('rn-linkrunner', () => ({
  default: {
    setConsent: vi.fn(),
    enableTCFConsentCollection: vi.fn(),
  },
}))

import linkrunner from 'rn-linkrunner'

import {
  applyConsent,
  applyTcfConsentCollection,
  consentFromSettings,
  toConsentStatus,
} from '../src/consent'

const sdk = linkrunner as unknown as {
  setConsent: ReturnType<typeof vi.fn>
  enableTCFConsentCollection: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  sdk.setConsent.mockReset()
  sdk.enableTCFConsentCollection.mockReset()
})

describe('toConsentStatus', () => {
  it('passes the SDK tri-state through', () => {
    expect(toConsentStatus('granted')).toBe('granted')
    expect(toConsentStatus('denied')).toBe('denied')
    expect(toConsentStatus('unknown')).toBe('unknown')
  })

  it('normalises dashboard free text', () => {
    expect(toConsentStatus(' Granted ')).toBe('granted')
    expect(toConsentStatus('TRUE')).toBe('granted')
    expect(toConsentStatus('false')).toBe('denied')
  })

  it('maps booleans from a CMP', () => {
    expect(toConsentStatus(true)).toBe('granted')
    expect(toConsentStatus(false)).toBe('denied')
  })

  it('treats anything else as not configured, never as granted', () => {
    expect(toConsentStatus('yes')).toBeUndefined()
    expect(toConsentStatus('')).toBeUndefined()
    expect(toConsentStatus(undefined)).toBeUndefined()
    expect(toConsentStatus(null)).toBeUndefined()
    expect(toConsentStatus(1)).toBeUndefined()
  })
})

describe('consentFromSettings', () => {
  it('returns undefined when nothing is configured, so setConsent is not called', () => {
    expect(consentFromSettings({ token: 't' })).toBeUndefined()
  })

  it('omits unconfigured flags rather than sending unknown', () => {
    expect(consentFromSettings({ consentIsEEA: 'granted' })).toEqual({
      isEEA: 'granted',
    })
  })

  it('maps all three flags to the SDK field names', () => {
    expect(
      consentFromSettings({
        consentIsEEA: 'granted',
        consentAdUserData: true,
        consentAdPersonalization: 'denied',
      })
    ).toEqual({
      isEEA: 'granted',
      hasConsentForDataUsage: 'granted',
      hasConsentForAdsPersonalization: 'denied',
    })
  })
})

describe('applyConsent', () => {
  it('forwards to the SDK', () => {
    applyConsent({ isEEA: 'granted' })
    expect(sdk.setConsent).toHaveBeenCalledWith({ isEEA: 'granted' })
  })

  it('never throws when the SDK does', () => {
    sdk.setConsent.mockImplementation(() => {
      throw new Error('native missing')
    })
    expect(() => applyConsent({ isEEA: 'granted' })).not.toThrow()
  })
})

describe('applyTcfConsentCollection', () => {
  it('forwards the flag and swallows SDK errors', () => {
    applyTcfConsentCollection(true)
    expect(sdk.enableTCFConsentCollection).toHaveBeenCalledWith(true)

    sdk.enableTCFConsentCollection.mockImplementation(() => {
      throw new Error('native missing')
    })
    expect(() => applyTcfConsentCollection(false)).not.toThrow()
  })
})
