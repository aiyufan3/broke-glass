import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { paradigmIds, paradigms } from '../src/data/paradigms.ts'

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

/*
 * Every place that states how many paradigms there are, or lists them, is read from the
 * registry in src/data/paradigms.ts. Nothing here repeats the list: a copied list is how
 * package.json kept saying "Five" after StrataOS arrived.
 */
const count = paradigmIds.length
const names = paradigmIds.map((id) => paradigms[id].name)
const CARDINAL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const ORDINAL = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth']
const read = (path) => readFileSync(new URL(path, repository), 'utf8')
const number = (token) => {
  const word = token.toLowerCase()
  if (/^\d+$/.test(word)) return Number(word)
  if (CARDINAL.includes(word)) return CARDINAL.indexOf(word)
  if (ORDINAL.includes(word)) return ORDINAL.indexOf(word)
  throw new Error(`"${token}" is not a count`)
}
const listed = (text) => text.split(/,\s*|\s+and\s+/).map((name) => name.trim()).filter(Boolean)

/** Text of every place a visitor, a crawler or npm reads the count: package metadata, the static document and the README. */
function sources() {
  const html = read('index.html')
  const meta = (key) => html.match(new RegExp(`(?:name|property)="${key}" content="([^"]+)"`))?.[1] ?? `(no ${key})`
  return {
    'package.json description': JSON.parse(read('package.json')).description,
    'index.html title': html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '(no title)',
    ...Object.fromEntries(['description', 'og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image:alt'].map((key) => [`index.html ${key}`, meta(key)])),
    README: read('README.md'),
  }
}

// A count followed by what it counts, or "all six", "the other six", "the existing six". Any new
// sentence in these shapes is checked without editing this test.
const NUMBER = `\\d+|${CARDINAL.join('|')}`
const PHRASES = new RegExp([
  `\\b(${NUMBER})\\s+(?:post-glass|mobile OS paradigms|mobile operating systems|paradigms|home screens|engines|halftone plates|focus views|native consoles)\\b`,
  `\\b(?:all|other|existing) (${NUMBER})\\b`,
  'numerals (\\d+)',
  '<kbd>1</kbd>–<kbd>(\\d+)</kbd>',
].join('|'), 'gi')

test('every stated paradigm count matches the registry', () => {
  const seen = []
  for (const [where, text] of Object.entries(sources())) {
    for (const match of text.matchAll(PHRASES)) {
      const token = match.slice(1).find((group) => group !== undefined)
      seen.push(where)
      expect(number(token), `${where}: "${match[0]}"`).toBe(count)
    }
  }
  // The places this check exists for must keep stating a count it can read.
  for (const where of ['package.json description', 'index.html title', 'index.html description', 'index.html og:title', 'index.html twitter:title', 'README']) {
    expect(seen, `${where} states no count this test can read`).toContain(where)
  }
  const readme = read('README.md')
  expect(readme.match(/alt="(\d+) paradigms"/)?.[1], 'README badge alt').toBe(String(count))
  expect(readme.match(/alt="broke-glass\. (\d+) paradigms\./)?.[1], 'README hero alt').toBe(String(count).padStart(2, '0'))
  expect(read('docs/badge-paradigms.svg'), 'generated badge').toContain(`>${count} PARADIGMS<`)
})

test('the next open slot is the one after the last registered paradigm', () => {
  const readme = read('README.md')
  const next = String(count + 1).padStart(2, '0')
  expect(readme.match(/Contribute Paradigm #(\d+)/)?.[1], 'Contribute heading').toBe(next)
  expect(readme.match(/Slot (\d+) is open/)?.[1], 'architecture paragraph').toBe(next)
  expect(number(readme.match(/\bAn? (\w+) slot is open/)?.[1] ?? '(none)'), 'architecture diagram alt').toBe(count + 1)
})

test('every list of paradigms in the README names the registry in order', () => {
  const readme = read('README.md')
  const lists = {
    'gallery alt': readme.match(/The running gallery: ([^"]+?) side by side/)?.[1],
    'silhouette alt': readme.match(/Silhouette test: ([^"]+?) under a 12px/)?.[1],
  }
  for (const [where, text] of Object.entries(lists)) expect(listed(text ?? ''), where).toEqual(names)
  const specimens = [...readme.matchAll(/^\| \*\*(\d+)&nbsp;(\w+)\*\* \|/gm)]
  expect(specimens.map((row) => row[2]), 'specimen sheet rows').toEqual(names)
  expect(specimens.map((row) => Number(row[1])), 'specimen sheet numbering').toEqual(names.map((_, index) => index + 1))
  const engines = [...readme.matchAll(/^\| (\w+OS) \| .+ \| `([\w/]+\.ts)` \|/gm)]
  expect(engines.map((row) => row[1]), 'engine table rows').toEqual(names)
  // The engine table and the architecture diagram name each paradigm's model file, which is the
  // one .ts file in its folder besides the renderer.
  const models = paradigmIds.map((id) => {
    const files = readdirSync(new URL(`src/themes/${id}/`, repository)).filter((file) => file.endsWith('.ts') && file !== 'renderer.ts')
    expect(files, `src/themes/${id} model file`).toHaveLength(1)
    return files[0]
  })
  expect(engines.map((row) => row[2]), 'engine table modules').toEqual(paradigmIds.map((id, index) => `${id}/${models[index]}`))
  expect(listed(readme.match(/feeds \w+ engines: ([^.]+(?:\.ts[^.]*)*?)\. A/)?.[1] ?? ''), 'architecture alt').toEqual(models)
})
