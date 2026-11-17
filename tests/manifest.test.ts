import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const readme = readFileSync(path.join(root, 'README.md'), 'utf8')

const section = (heading: string) => {
  const start = readme.indexOf(`\n## ${heading}\n`)
  expect(start, `missing section "${heading}"`).toBeGreaterThan(-1)
  const end = readme.indexOf('\n## ', start + 1)
  return readme.slice(start, end === -1 ? undefined : end)
}

const tableRows = (text: string) =>
  text
    .split('\n')
    .filter((line) => /^\| `[^`]+` \|/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))

describe('appbrew manifest', () => {
  const manifest = pkg.appbrew

  it('has the catalog fields Appbrew Studio reads', () => {
    expect(manifest.title).toBe('Linkrunner')
    expect(manifest.access).toBe('self-serve')
    expect(manifest.image).toMatch(/^https:\/\/.+\.png$/)
    expect(manifest.configKey).toBe('linkrunner')
    expect(manifest.requiresNativeBuild).toBe(true)
    expect(pkg.description.split(/\s+/).length).toBeLessThanOrEqual(25)
  })

  it('requires only the token', () => {
    const required = manifest.settings.filter((s: any) => s.required)
    expect(required.map((s: any) => s.key)).toEqual(['token'])
  })

  it('gives every text and json setting a placeholder', () => {
    for (const s of manifest.settings) {
      if (s.type === 'boolean') continue
      expect(s.placeholder, s.key).toBeTruthy()
    }
  })
})

describe('README', () => {
  it('keeps the template sections in order', () => {
    const headings = [...readme.matchAll(/^## (.+)$/gm)].map((m) => m[1])
    expect(headings).toEqual([
      '1. Description',
      '2. Access',
      '3. Requirements',
      '4. Merchant config form',
      '5. Codebase changes (merchant app)',
      '6. Studio / theme config',
      '7. Screenshots and videos',
      '8. How it works',
      '9. Troubleshooting',
      '10. Versioning and release',
      '11. Support',
    ])
  })

  it('header matches package.json', () => {
    const header = readme.slice(0, readme.indexOf('\n---', 3))
    expect(header).toContain(`title: ${pkg.appbrew.title}`)
    expect(header).toContain(`access: ${pkg.appbrew.access}`)
    expect(header).toContain(`image: ${pkg.appbrew.image}`)
  })

  it('lists the package version in sections 3 and 5', () => {
    expect(section('3. Requirements')).toContain(`| Version | \`${pkg.version}\``)
    expect(section('5. Codebase changes (merchant app)')).toContain(
      `"@linkrunner/appbrew": "${pkg.version}"`
    )
  })

  it('section 4 table matches appbrew.settings key by key', () => {
    const rows = tableRows(section('4. Merchant config form'))
    const yesNo = (v: boolean) => (v ? 'Yes' : 'No')
    expect(rows.map((r) => r[0])).toEqual(
      pkg.appbrew.settings.map((s: any) => `\`${s.key}\``)
    )
    for (const [i, s] of pkg.appbrew.settings.entries()) {
      const [, label, type, required, secret] = rows[i]
      expect({ label, type, required, secret }, s.key).toEqual({
        label: s.title,
        type: s.type,
        required: yesNo(s.required),
        secret: yesNo(!!s.secret),
      })
    }
  })

  it('has no real-looking keys', () => {
    expect(readme).not.toMatch(/["'`][A-Za-z0-9_-]{32,}["'`]/)
  })
})
