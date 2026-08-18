import { describe, expect, it, vi } from 'vitest'

import {
  Serializer,
  finiteNumber,
  nonEmptyString,
  normalizeCustomerId,
  withTimeout,
} from '../src/utils'

describe('normalizeCustomerId', () => {
  it('strips the Shopify customer GID prefix', () => {
    expect(normalizeCustomerId('gid://shopify/Customer/9538196275417')).toBe(
      '9538196275417'
    )
  })

  it('leaves a bare id untouched', () => {
    expect(normalizeCustomerId('123')).toBe('123')
  })

  it('accepts numeric ids', () => {
    expect(normalizeCustomerId(123)).toBe('123')
  })

  it('treats null, undefined and blank as absent', () => {
    expect(normalizeCustomerId(null)).toBeUndefined()
    expect(normalizeCustomerId(undefined)).toBeUndefined()
    expect(normalizeCustomerId('   ')).toBeUndefined()
  })
})

describe('finiteNumber', () => {
  it('guards NaN, which removeUndefined does not strip', () => {
    expect(finiteNumber(Number('x'))).toBe(0)
    expect(finiteNumber(undefined)).toBe(0)
  })

  it('parses numeric strings', () => {
    expect(finiteNumber('12.5')).toBe(12.5)
  })

  it('honours an explicit fallback', () => {
    expect(finiteNumber('nope', 1)).toBe(1)
  })
})

describe('nonEmptyString', () => {
  it('returns undefined for blank input', () => {
    expect(nonEmptyString('  ')).toBeUndefined()
    expect(nonEmptyString(null)).toBeUndefined()
  })

  it('trims and returns real values', () => {
    expect(nonEmptyString(' #1001 ')).toBe('#1001')
  })
})

describe('withTimeout', () => {
  it('rejects a promise that never settles', async () => {
    await expect(withTimeout(new Promise(() => {}), 30, 'stuck')).rejects.toThrow(
      /stuck timed out/
    )
  })

  it('passes through a value that resolves in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 500, 'fast')).resolves.toBe('ok')
  })
})

describe('Serializer', () => {
  it('preserves FIFO order regardless of individual durations', async () => {
    const order: string[] = []
    const s = new Serializer()
    s.run('slow', async () => {
      await new Promise((r) => setTimeout(r, 30))
      order.push('slow')
    })
    s.run('fast', async () => {
      order.push('fast')
    })
    await s.run('last', async () => {
      order.push('last')
    })
    expect(order).toEqual(['slow', 'fast', 'last'])
  })

  it('keeps running after a failure instead of wedging the chain', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const after: string[] = []
    const s = new Serializer()
    s.run('boom', async () => {
      throw new Error('nope')
    })
    await s.run('next', async () => {
      after.push('ran')
    })
    expect(after).toEqual(['ran'])
    warn.mockRestore()
  })

  it('never rejects, so a failed SDK call cannot surface as a redbox', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      new Serializer().run('boom', async () => {
        throw new Error('nope')
      })
    ).resolves.toBeUndefined()
    warn.mockRestore()
  })

  it('times a hung call out rather than blocking every later call', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = new Serializer()
    const started = Date.now()
    await s.run('hang', () => new Promise(() => {}), 50)
    expect(Date.now() - started).toBeLessThan(2000)
    warn.mockRestore()
  })
})
