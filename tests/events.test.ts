import { describe, expect, it } from 'vitest'

import {
  HANDLED_SEPARATELY,
  NEVER_FIRED_EVENTS,
  buildEventData,
  buildPurchaseEventData,
  toEcommercePayload,
} from '../src/events'

/**
 * Captured verbatim from a real `add_to_cart` on the Natori demo store — the
 * shape Appbrew's `transformProduct` + `getCart` actually produce, including
 * the dynamic `item_size` / `item_color` keys derived from Shopify variant
 * options.
 */
const addToCart = {
  value: 195,
  currency: 'USD',
  sub_total: 195,
  discount: 0,
  items: [
    {
      item_id: '7486390763543',
      item_variant: '41996942409751',
      item_name: 'Shima Caftan',
      handle: 'kabibi-caftan-fuchsia-white',
      price: 195,
      original_price: 195,
      discount: 0,
      quantity: 1,
      sku: 'U70041-Fuchsia/White-L',
      item_brand: 'Natori',
      item_category: 'Parent',
      affiliation: 'Natori',
      item_size: 'L',
      item_color: 'Fuchsia/White',
      img_url: 'https://cdn.shopify.com/s/files/1/0737/2754/1271/files/x.jpg',
      url: '',
    },
  ],
}

describe('toEcommercePayload', () => {
  const out = toEcommercePayload(addToCart)

  it('keys content_ids on the variant id, which is what Meta catalogues match', () => {
    expect(out.content_ids).toEqual(['41996942409751'])
  })

  it('keys item_group_ids on the product id', () => {
    expect(out.item_group_ids).toEqual(['7486390763543'])
  })

  it('builds contents with the catalogue price', () => {
    expect(out.contents).toEqual([
      { id: '41996942409751', quantity: 1, item_price: 195 },
    ])
  })

  it('carries value, currency, content_type and num_items', () => {
    expect(out.value).toBe(195)
    expect(out.currency).toBe('USD')
    expect(out.content_type).toBe('product')
    expect(out.num_items).toBe(1)
  })

  it('sums quantity across multiple line items', () => {
    const multi = toEcommercePayload({
      currency: 'INR',
      value: 300,
      items: [
        { item_id: 'p1', item_variant: 'v1', price: 100, quantity: 2 },
        { item_id: 'p2', item_variant: 'v2', price: 100, quantity: 1 },
      ],
    })
    expect(multi.num_items).toBe(3)
    expect(multi.content_ids).toEqual(['v1', 'v2'])
  })

  it('falls back to the product id when no variant is present', () => {
    const out = toEcommercePayload({ items: [{ item_id: 'p1', price: 5 }] })
    expect(out.content_ids).toEqual(['p1'])
  })

  it('skips items with no usable id rather than emitting empty ids', () => {
    expect(toEcommercePayload({ items: [{ price: 5 }] }).content_ids).toBeUndefined()
  })

  it('defaults a missing quantity to 1', () => {
    expect(toEcommercePayload({ items: [{ item_id: 'p1', price: 5 }] }).num_items).toBe(1)
  })

  it('coerces a non-numeric price to 0 rather than NaN', () => {
    const out = toEcommercePayload({ items: [{ item_id: 'p1', price: 'abc' }] })
    expect(out.contents?.[0].item_price).toBe(0)
  })

  it('returns currency alone when there are no items', () => {
    expect(toEcommercePayload({ currency: 'USD' })).toEqual({ currency: 'USD' })
  })

  it('returns an empty object for an empty payload', () => {
    expect(toEcommercePayload({})).toEqual({})
  })
})

describe('buildEventData', () => {
  it('preserves raw Appbrew keys alongside the Meta fields', () => {
    const out = buildEventData(addToCart)
    expect(out.sub_total).toBe(195)
    expect(out.content_ids).toEqual(['41996942409751'])
  })

  it('preserves dynamic item_* keys from Shopify variant options', () => {
    const out = buildEventData(addToCart)
    expect(out.items[0].item_size).toBe('L')
    expect(out.items[0].item_color).toBe('Fuchsia/White')
  })

  it('merges extra params such as session UTMs', () => {
    expect(buildEventData(addToCart, { utm_source: 'meta' }).utm_source).toBe('meta')
  })

  it('strips undefined values', () => {
    expect(Object.keys(buildEventData({ a: undefined, b: 1 }))).toEqual(['b'])
  })

  it('leaves item-less payloads untouched apart from extras', () => {
    expect(buildEventData({ search_term: 'caftan' })).toEqual({ search_term: 'caftan' })
  })
})

describe('buildPurchaseEventData', () => {
  it('adds order_id, which Meta requires on Purchase', () => {
    const out = buildPurchaseEventData({ ...addToCart, transaction_id: '#1001' })
    expect(out.order_id).toBe('#1001')
  })

  it('omits order_id when there is no transaction id', () => {
    expect(buildPurchaseEventData(addToCart).order_id).toBeUndefined()
  })
})

describe('event classification', () => {
  it('does not map the five events that never fire in @gauntlet', () => {
    expect(NEVER_FIRED_EVENTS).toEqual([
      'add_payment_info',
      'select_item',
      'select_promotion',
      'view_block',
      'view_promotion',
    ])
  })

  it('drives signup() from both signup and login', () => {
    expect(HANDLED_SEPARATELY).toContain('signup')
    expect(HANDLED_SEPARATELY).toContain('login')
  })

  it('handles purchase, refund, logout and installs outside trackEvent', () => {
    expect(HANDLED_SEPARATELY).toContain('purchase')
    expect(HANDLED_SEPARATELY).toContain('refund')
    expect(HANDLED_SEPARATELY).toContain('logout')
    expect(HANDLED_SEPARATELY).toContain('app_install_android')
    expect(HANDLED_SEPARATELY).toContain('app_install_ios')
  })
})
