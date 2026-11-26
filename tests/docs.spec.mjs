import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const repository = new URL('../', import.meta.url)
const stacks = [
  "'Helvetica Neue', Helvetica, -apple-system, BlinkMacSystemFont, Arial, sans-serif",
  'ui-monospace, SFMono-Regular, Menlo, monospace',
]

test('every image and link in the README resolves inside the repository', () => {
  const readme = readFileSync(new URL('README.md', repository), 'utf8')
  const targets = [...readme.matchAll(/(?:src|srcset|href)="([^"]+)"|\]\(([^)\s]+)\)/g)].map((match) => match[1] ?? match[2])
  const local = targets.filter((target) => !/^[a-z]+:|^#/.test(target))
  expect(local.length).toBeGreaterThan(8)
  for (const target of local) expect(existsSync(new URL(target, repository)), target).toBe(true)
})

test('the generated posters are self-contained SVG set in system font stacks', () => {
  const posters = [...readdirSync(new URL('docs/', repository)).map((file) => `docs/${file}`), 'public/og-preview.svg']
    .filter((file) => file.endsWith('.svg'))
  expect(posters.length).toBeGreaterThan(8)
  for (const poster of posters) {
    const svg = readFileSync(new URL(poster, repository), 'utf8')
    expect(svg, poster).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+" viewBox="0 0 \d+ \d+"/)
    expect(svg, poster).not.toMatch(/<script|<image|<foreignObject|<style|@import|@font-face|\shref=|\ssrc=|url\(/)
    const families = new Set([...svg.matchAll(/font-family="([^"]+)"/g)].map((match) => match[1]))
    expect(families.size, poster).toBeGreaterThan(0)
    for (const family of families) expect(stacks, poster).toContain(family)
  }
})

test('the README gallery is a 2× capture of the 1440 × 900 gallery with no embedded metadata', () => {
  const readme = readFileSync(new URL('README.md', repository), 'utf8')
  expect(readme).toContain('src="docs/gallery-overview.png"')
  const png = readFileSync(new URL('docs/gallery-overview.png', repository))
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2880, 1800])
  const chunks = new Set()
  for (let offset = 8; offset < png.length; offset += png.readUInt32BE(offset) + 12) chunks.add(png.toString('latin1', offset + 4, offset + 8))
  expect([...chunks].sort()).toEqual(['IDAT', 'IEND', 'IHDR'])
})
