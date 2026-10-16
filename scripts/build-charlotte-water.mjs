#!/usr/bin/env node
/**
 * Builds public/data/charlotte-water.json from Charlotte Water's comments in
 * rezoning staff analyses (public records).
 *
 *   npm run data:charlotte-water                 # all petitions since 2020
 *   npm run data:charlotte-water -- --limit 25   # quick test run
 *   npm run data:charlotte-water -- --since 2023
 *
 * Results are cached per petition in .cache/charlotte-water/, so you can stop and
 * restart, and re-runs only fetch new petitions. Delete the cache to start fresh.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import * as turf from '@turf/turf'
import { waterSection, parseWaterStatements, streetSearchToken } from './lib/parseWater.mjs'

// Quiet pdf.js warnings about canvas features we don't need for text extraction.
const warn = console.warn
console.warn = (...a) => (/polyfill|standardFontDataUrl|TT:|Warning: /.test(String(a[0])) ? null : warn(...a))
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] == null ? true : arr[i + 1]]] : acc), []))
const SINCE = Number(args.since || 2020)
const LIMIT = args.limit ? Number(args.limit) : Infinity
const CONCURRENCY = Number(args.concurrency || 3)

const CLT = 'https://gis.charlottenc.gov/arcgis/rest/services'
const HISTORY = `${CLT}/PLN/RezoningHistory/MapServer/0`
const STREETS = `${CLT}/CountyData/Streets/MapServer/0`
const PARCELS = `${CLT}/CountyData/Parcels/MapServer/0`
const SITE = 'https://www.charlottenc.gov'
const OUT = 'public/data/charlotte-water.json'
const CACHE = '.cache/charlotte-water'
const STREET_SEARCH_FT = 1500

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const qs = (o) => new URLSearchParams(o).toString()
const round = (g) => JSON.parse(JSON.stringify(g, (k, v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v)))

// City websites often turn away requests that don't look like a browser.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

async function get(url, { as = 'json', tries = 3, onStatus } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' })
      onStatus?.(res.status)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (as === 'json') { const j = await res.json(); if (j.error) throw new Error(j.error.message); return j }
      if (as === 'text') return await res.text()
      return Buffer.from(await res.arrayBuffer())
    } catch (e) {
      if (i === tries - 1) throw e
      await sleep(800 * (i + 1))
    }
  }
}

async function pdfText(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise
  let text = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent()
    text += c.items.map((x) => x.str).join(' ') + ' '
  }
  await doc.destroy()
  return text
}

/* ---------- 1. petitions with their footprints ---------- */

async function loadPetitions() {
  const byId = new Map()
  for (let offset = 0; ; offset += 1000) {
    const d = await get(`${HISTORY}/query?${qs({
      where: `Received >= DATE '${SINCE}-01-01'`,
      outFields: 'Petition,Received,Hyperlink,Status',
      returnGeometry: true, outSR: 4326, geometryPrecision: 6,
      orderByFields: 'Received DESC', resultOffset: offset, resultRecordCount: 1000, f: 'geojson',
    })}`)
    const feats = d?.features || []
    for (const f of feats) {
      const a = f.properties
      if (!a.Petition || !f.geometry) continue
      const cur = byId.get(a.Petition) || { petition: a.Petition, received: a.Received, link: a.Hyperlink, polys: [] }
      cur.polys.push(f.geometry)
      byId.set(a.Petition, cur)
    }
    if (feats.length < 1000) break
  }
  return [...byId.values()].map((p) => {
    const polys = p.polys
      .flatMap((g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates))
      .map((poly) => poly.map(cleanRing).filter(Boolean))
      .filter((poly) => poly.length) // drop polygons whose outer ring was unusable
    return { ...p, footprint: polys.length ? { type: 'MultiPolygon', coordinates: polys } : null }
  }).filter((p) => p.footprint)
}

// The city's data occasionally has slivers: rings with repeated or too few points.
function cleanRing(ring) {
  const out = []
  for (const pt of ring) {
    const last = out[out.length - 1]
    if (!last || last[0] !== pt[0] || last[1] !== pt[1]) out.push(pt)
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0])
  return out.length >= 4 ? out : null
}

// turf.simplify can still reject odd shapes; fall back to the unsimplified shape.
function safeSimplify(feature, tolerance) {
  try { return turf.simplify(feature, { tolerance }) } catch { return feature }
}

/* ---------- 2. staff analysis PDFs for a petition ---------- */

function rankDoc(href) {
  if (/final-staff-analysis|[-_]fsa[._]/i.test(href)) return 0
  if (/post-hearing|posthsa/i.test(href)) return 1
  if (/pre-hearing|phsa/i.test(href)) return 2
  return null
}

const DOC_BASE = 'https://www.charlottenc.gov/files/sharedassets/city/v/1/growth-and-development/planning-and-zoning/rezoning/documents'

async function candidateDocs(p) {
  const [year, num] = p.petition.split('-')
  const link = (p.link || '').trim()
  const pageUrl = link ? (/^https?:\/\//.test(link) ? link : `https://${link}`) : `${SITE}/Growth-and-Development/Planning-and-Development/Rezoning/${year}/${p.petition}`
  const docs = []
  let pageStatus = null
  const html = await get(pageUrl, { as: 'text', tries: 2, onStatus: (st) => { pageStatus = st } }).catch((e) => { pageStatus = pageStatus || e.message; return null })
  if (html) {
    for (const m of html.matchAll(/href="([^"]+?\.pdf[^"]*)"/gi)) {
      const href = new URL(m[1].replace(/&amp;/g, '&'), pageUrl).toString()
      const rank = rankDoc(href)
      if (rank != null) docs.push({ href, rank })
    }
  }
  // Fallback: the city's usual file names, in case the petition page can't be read.
  for (const [folder, suf, rank] of [['final-staff-analysis', 'fsa', 0], ['post-hearing-staff-analysis', 'posthsa', 1], ['pre-hearing-staff-analysis', 'phsa', 2]]) {
    docs.push({ href: `${DOC_BASE}/${year}-petitions/${folder}/${year}_${num}_${suf}.pdf`, rank: rank + 0.25 })
  }
  // 2025+ petitions also publish to a document folder with predictable names.
  // Some files also sit loose in the top folder, and 2026+ has standalone Charlotte Water memos.
  if (Number(year) >= 2025) {
    const CM = 'https://ww.charmeck.org/docs/Rezoning'
    for (const [suf, rank] of [['FSA', 0], ['PostHSA', 1], ['PHSA', 2]]) {
      docs.push({ href: `${CM}/${year}-${suf}/${p.petition}-${suf}.pdf`, rank: rank + 0.5 })
      docs.push({ href: `${CM}/${p.petition}-${suf}.pdf`, rank: rank + 0.75 })
    }
    docs.push({ href: `${CM}/${year}-Water/${p.petition}-Water.pdf`, rank: -1 })
  }
  const seen = new Set()
  return { pageUrl, pageStatus, pageLinks: docs.filter((d) => Number.isInteger(d.rank)).length, docs: docs.sort((a, b) => a.rank - b.rank).filter((d) => (seen.has(d.href) ? false : seen.add(d.href))) }
}

async function readPetition(p) {
  const cacheFile = path.join(CACHE, `${p.petition}.json`)
  try {
    const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8'))
    if (cached.status !== 'no-docs') return cached // earlier "no-docs" results get another try
  } catch { /* not cached */ }

  let result = { petition: p.petition, status: 'no-docs' }
  try {
    const { pageUrl, pageStatus, pageLinks, docs } = await candidateDocs(p)
    result = { ...result, page: pageUrl, pageStatus, pageLinks }
    for (const d of docs) {
      const buf = await get(d.href, { as: 'buffer' }).catch(() => null)
      await sleep(250)
      if (!buf || buf.subarray(0, 4).toString() !== '%PDF') continue
      const section = waterSection(await pdfText(buf))
      const parsed = parseWaterStatements(section)
      result = { ...result, status: 'no-statement', source: d.href }
      if (parsed.pipes.length || parsed.noWater || parsed.noSewer) {
        result = { ...result, status: 'ok', section: section.slice(0, 1200), ...parsed }
        break
      }
    }
  } catch (e) {
    result = { ...result, status: 'error', error: e.message }
  }
  if (result.status !== 'error') await fs.writeFile(cacheFile, JSON.stringify(result))
  return result
}

/* ---------- 3. place each pipe on the map ---------- */

const parcelCache = new Map()
async function parcelShape(id) {
  if (parcelCache.has(id)) return parcelCache.get(id)
  const d = await get(`${PARCELS}/query?${qs({ where: `PID = '${id}'`, outFields: 'PID', returnGeometry: true, outSR: 4326, geometryPrecision: 6, f: 'geojson' })}`).catch(() => null)
  const g = d?.features?.[0]?.geometry || null
  parcelCache.set(id, g)
  return g
}

async function streetNear(token, footprint) {
  const env = turf.bbox(footprint)
  const d = await get(`${STREETS}/query?${qs({
    where: `UPPER(STREETNAME) LIKE '%${token.replace(/'/g, "''")}%'`,
    geometry: env.join(','), geometryType: 'esriGeometryEnvelope', inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects', distance: STREET_SEARCH_FT, units: 'esriSRUnit_Foot',
    outFields: 'STREETNAME,STREETTYPE', returnGeometry: true, outSR: 4326, geometryPrecision: 6, f: 'json',
  })}`).catch(() => null)
  const paths = (d?.features || []).flatMap((f) => f.geometry?.paths || [])
  if (!paths.length) return null
  const names = [...new Set((d.features || []).map((f) => `${f.attributes.STREETNAME} ${f.attributes.STREETTYPE || ''}`.trim()))]
  return { geometry: { type: 'MultiLineString', coordinates: paths }, matched: names.slice(0, 3).join(' / ') }
}

const SITE_WORDS = /property|site|rezoning boundary|parcel boundary|frontage|subject/i

async function placeRecords(p, r) {
  const out = []
  const received = p.received ? new Date(p.received).toISOString().slice(0, 7) : null
  const base = { petition: p.petition, received, source: r.source, page: r.page }
  const siteShape = safeSimplify(turf.feature(p.footprint), 0.00002)
  // Charlotte Water's statements describe mains "accessible for the rezoning boundary",
  // so the site's edge is a safe fallback when a street or parcel can't be matched.
  const edgeLines = turf.flatten(turf.polygonToLine(siteShape)).features.map((f) => f.geometry.coordinates)
  const siteEdge = round({ type: 'MultiLineString', coordinates: edgeLines })

  for (const pipe of r.pipes || []) {
    let geometry = null, where = null, matched = null, precision = null
    if (pipe.parcelId) {
      geometry = await parcelShape(pipe.parcelId)
      where = `inside parcel ${pipe.parcelId}`
      precision = 'parcel'
    } else if (pipe.street && SITE_WORDS.test(pipe.street)) {
      where = 'along the site boundary'
      precision = 'site'
      geometry = siteEdge
    } else if (pipe.street) {
      where = `along ${pipe.street.replace(/\s+/g, ' ')}`
      const token = streetSearchToken(pipe.street)
      const s = token ? await streetNear(token, p.footprint) : null
      if (s) { geometry = s.geometry; matched = s.matched; precision = 'street' }
    }
    if (!geometry) { geometry = siteEdge; precision = 'site' }
    out.push({ ...base, kind: pipe.kind, sizeIn: pipe.sizeIn, where, matched, precision, located: true, geometry: round(geometry) })
  }
  const site = round(safeSimplify(turf.feature(p.footprint), 0.0001).geometry)
  if (r.noSewer) out.push({ ...base, kind: 'no-sewer', where: 'rezoning site', precision: 'site', located: true, geometry: site })
  if (r.noWater) out.push({ ...base, kind: 'no-water', where: 'rezoning site', precision: 'site', located: true, geometry: site })
  return out
}

/* ---------- run ---------- */

await fs.mkdir(CACHE, { recursive: true })
await fs.mkdir(path.dirname(OUT), { recursive: true })

console.log(`Loading Charlotte rezoning petitions since ${SINCE}…`)
const petitions = (await loadPetitions()).slice(0, LIMIT)
console.log(`${petitions.length} petitions. Reading staff analyses (${CONCURRENCY} at a time; cached results are reused)…`)

const records = []
const stats = { ok: 0, 'no-statement': 0, 'no-docs': 0, error: 0, pipes: 0, street: 0, parcel: 0, site: 0 }
let done = 0
const pageStatusCounts = {}
const noDocExamples = []
const queue = [...petitions]
async function worker() {
  while (queue.length) {
    const p = queue.shift()
    const r = await readPetition(p)
    stats[r.status] = (stats[r.status] || 0) + 1
    if (r.pageStatus != null) pageStatusCounts[r.pageStatus] = (pageStatusCounts[r.pageStatus] || 0) + 1
    if (r.status === 'no-docs') noDocExamples.push(`${r.petition} (page ${r.pageStatus ?? '?'}, ${r.pageLinks ?? 0} links)`)
    if (r.status === 'ok') {
      let recs = []
      try { recs = await placeRecords(p, r) } catch (e) {
        stats.skipped = (stats.skipped || 0) + 1
        console.log(`  Skipped ${p.petition}: ${e.message}`)
      }
      records.push(...recs)
      for (const x of recs) if (x.kind === 'water' || x.kind === 'sewer') { stats.pipes++; stats[x.precision]++ }
    }
    done++
    if (done % 25 === 0 || done === petitions.length) {
      process.stdout.write(`  ${done}/${petitions.length}  statements: ${stats.ok}  pipes: ${stats.pipes}  no documents: ${stats['no-docs']}\n`)
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

records.sort((a, b) => (b.received || '').localeCompare(a.received || ''))
await fs.writeFile(OUT, JSON.stringify({ generated: new Date().toISOString(), since: SINCE, stats, records }))
const kb = Math.round((await fs.stat(OUT)).size / 1024)
console.log(`\nWrote ${OUT} (${kb} KB)`)
console.log(`  Petitions with a Charlotte Water statement: ${stats.ok}`)
console.log(`  Pipe statements: ${stats.pipes} (on a matched street: ${stats.street}, a named parcel: ${stats.parcel}, the site boundary: ${stats.site})`)
console.log(`  No statement found: ${stats['no-statement']}, no staff analysis online: ${stats['no-docs']}, errors (retry later): ${stats.error}, skipped (bad shape): ${stats.skipped || 0}`)
const pageCodes = Object.entries(pageStatusCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(', ')
console.log(`  Petition page responses: ${pageCodes || 'none fetched'}`)
const noDocSample = noDocExamples.slice(0, 5)
if (noDocSample.length) console.log(`  Examples with no documents: ${noDocSample.join(', ')}`)
