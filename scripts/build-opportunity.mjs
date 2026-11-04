#!/usr/bin/env node
/**
 * Builds public/data/opportunity-meck.json: a hexagon grid over Mecklenburg County with
 * market signals for each hexagon. The app turns these into an opportunity score.
 *
 *   npm run data:opportunity
 *
 * Takes a few minutes. Re-run monthly (after data:charlotte-water, which it also reads).
 */
import fs from 'node:fs/promises'
import * as turf from '@turf/turf'

const CLT = 'https://gis.charlottenc.gov/arcgis/rest/services'
const SOURCES = {
  county: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1',
  history: `${CLT}/PLN/RezoningHistory/MapServer/0`,
  active: `${CLT}/PLN/Rezonings/MapServer/0`,
  vacant: `${CLT}/PLN/VacantLand/MapServer/0`,
  parcels: `${CLT}/PLN/AllParcelData/MapServer/0`,
  policy: 'https://services.arcgis.com/9Nl857LBlQVyzq54/arcgis/rest/services/Charlotte_Future_2040_Policy_Map/FeatureServer/0',
}
const OUT = 'public/data/opportunity-meck.json'
const WATER = 'public/data/charlotte-water.json'
const CELL_MILES = 0.4 // hexagon side length; about 0.42 sq mi each
const NOW = new Date()
const yearsAgo = (n) => new Date(NOW.getFullYear() - n, NOW.getMonth(), NOW.getDate())
const RECENT_FROM = yearsAgo(2) // "recent" = last two years
const PRIOR_FROM = yearsAgo(6), PRIOR_TO = yearsAgo(4) // comparison window for price trend
const GROWTH_TYPES = ['Neighborhood 2', 'Neighborhood Center', 'Community Activity Center', 'Regional Activity Center', 'Innovation Mixed-Use', 'Manufacturing & Logistics', 'Campus', 'Commercial']

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36' }
const qs = (o) => new URLSearchParams(o).toString()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round = (g, d = 5) => JSON.parse(JSON.stringify(g, (k, v) => (typeof v === 'number' ? Math.round(v * 10 ** d) / 10 ** d : v)))

async function get(url, params, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${url}/query?${qs(params)}`, { headers: HEADERS })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      if (j.error) throw new Error(j.error.message)
      return j
    } catch (e) {
      if (i === tries - 1) throw new Error(`${url.split('/services/')[1] || url}: ${e.message}`)
      await sleep(1000 * (i + 1))
    }
  }
}

/** Every feature matching a query, page by page. */
async function getAll(url, params, label, pageSize = 2000) {
  const out = []
  for (let offset = 0; ; offset += pageSize) {
    const j = await get(url, { ...params, resultOffset: offset, resultRecordCount: pageSize, f: 'geojson' })
    const feats = j.features || []
    out.push(...feats)
    process.stdout.write(`\r  ${label}: ${out.length}`)
    if (feats.length < pageSize && !j.exceededTransferLimit && !j.properties?.exceededTransferLimit) break
    await sleep(150)
  }
  process.stdout.write('\n')
  return out
}

const centerOf = (f) => { if (!f?.geometry) return null; try { return turf.pointOnFeature(f).geometry.coordinates } catch { return null } }
// some county records come back without a shape; treat those as unmeasurable instead of crashing
const acresOf = (f) => { if (!f?.geometry) return 0; try { return turf.area(f) / 4046.86 } catch { return 0 } }
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/* ---------------- 1. hexagon grid ---------------- */
console.log('Building the hexagon grid over Mecklenburg County…')
const countyFc = await get(SOURCES.county, { where: "GEOID='37119'", outFields: 'GEOID', returnGeometry: true, outSR: 4326, f: 'geojson' })
const county = countyFc.features[0]
const grid = turf.hexGrid(turf.bbox(county), CELL_MILES, { units: 'miles' })
const hexes = grid.features.filter((h) => turf.booleanIntersects(h, county)).map((h, i) => ({
  id: i, geom: h.geometry, c: turf.centroid(h).geometry.coordinates, bbox: turf.bbox(h),
  m: { rezApproved: 0, rezActive: 0, rezAcres: 0, rezWithdrawn: 0, sales: 0, saleAcres: 0, vacantAc: 0, bigVacantAc: 0, bigVacantN: 0, water: 0, sewer: 0, growthShare: 0 },
  ppaRecent: [], ppaPrior: [], rezList: [], place: null,
}))
console.log(`  ${hexes.length} hexagons`)

// fast point lookup: bucket hexes by a coarse grid
const B = 0.01
const buckets = new Map()
const key = (x, y) => `${Math.floor(x / B)},${Math.floor(y / B)}`
for (const h of hexes) {
  for (let x = h.bbox[0]; x <= h.bbox[2] + B; x += B) for (let y = h.bbox[1]; y <= h.bbox[3] + B; y += B) {
    const k = key(x, y); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(h)
  }
}
const hexAt = (pt) => {
  if (!pt) return null
  for (const h of buckets.get(key(pt[0], pt[1])) || []) if (turf.booleanPointInPolygon(pt, h.geom)) return h
  return null
}

/* ---------------- 2. rezonings ---------------- */
console.log('Rezonings…')
const hist = await getAll(SOURCES.history, { where: "Received >= DATE '2020-01-01'", outFields: 'Petition,Status,Received,Approved,PetAcres,RequestedZoning', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, geometryPrecision: 5 }, 'decided and pending petitions')
const seen = new Set()
for (const f of hist) {
  const p = f.properties
  if (!f.geometry || seen.has(p.Petition)) continue
  seen.add(p.Petition)
  const h = hexAt(centerOf(f))
  if (!h) continue
  const when = p.Approved || p.Received
  if (p.Status === 'App' && when >= yearsAgo(3).getTime()) { h.m.rezApproved++; h.m.rezAcres += Number(p.PetAcres) || 0; h.rezList.push([p.Petition, (p.RequestedZoning || '').trim(), 'Approved']) }
  if (p.Status === 'Wd' && when >= yearsAgo(3).getTime()) h.m.rezWithdrawn++
}
const active = await getAll(SOURCES.active, { where: '1=1', outFields: 'Petition,ReqZone,PetAcres', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, geometryPrecision: 5 }, 'petitions in process')
for (const f of active) {
  const h = hexAt(centerOf(f))
  if (!h) continue
  h.m.rezActive++; h.m.rezAcres += Number(f.properties.PetAcres) || 0
  h.rezList.push([f.properties.Petition, (f.properties.ReqZone || '').trim(), 'In process'])
}

/* ---------------- 3. vacant land supply ---------------- */
console.log('Vacant land…')
const vacant = await getAll(SOURCES.vacant, { where: '1=1', outFields: 'pid,totalac', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0002, geometryPrecision: 5 }, 'vacant parcels')
for (const f of vacant) {
  const ac = Number(f.properties.totalac) || acresOf(f)
  const h = hexAt(centerOf(f))
  if (!h || !(ac > 0)) continue
  h.m.vacantAc += ac
  if (ac >= 2) { h.m.bigVacantAc += ac; h.m.bigVacantN++ } // parcels large enough to become subdivisions
}

/* ---------------- 4. vacant-land sales and prices ---------------- */
console.log('Land sales…')
const sales = await getAll(SOURCES.parcels, {
  where: `txt_vacantorimproved LIKE 'VAC%' AND saledate >= DATE '${PRIOR_FROM.toISOString().slice(0, 10)}' AND saleprice > 1000`,
  outFields: 'parcelid,saleprice,saledate,deed_book,deed_page,legalacres,yearid', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.00005, geometryPrecision: 6,
}, 'vacant-land sales')
// one row per parcel sale, then group parcels sold on the same deed (the county repeats the full price on each)
const bySale = new Map()
let noShape = 0
for (const f of sales) {
  const p = f.properties
  if (!f.geometry) { noShape++; continue } // can't place it on the map
  const k = `${p.parcelid}|${p.saledate}`
  if (!bySale.has(k)) bySale.set(k, f)
}
if (noShape) console.log(`  skipped ${noShape} sales with no parcel shape`)
const deeds = new Map()
for (const f of bySale.values()) {
  const p = f.properties
  const k = `${p.deed_book}|${p.deed_page}|${p.saledate}`
  const ac = Number(p.legalacres) > 0 ? Number(p.legalacres) : acresOf(f)
  const d = deeds.get(k) || { price: Number(p.saleprice), date: p.saledate, acres: 0, pt: centerOf(f) }
  d.acres += ac
  deeds.set(k, d)
}
for (const d of deeds.values()) {
  const h = hexAt(d.pt)
  if (!h) continue
  if (d.date >= RECENT_FROM.getTime()) { h.m.sales++; h.m.saleAcres += d.acres }
  const ppa = d.acres >= 0.1 ? d.price / d.acres : null // tiny slivers make price per acre meaningless
  if (!ppa || ppa > 20e6) continue
  if (d.date >= RECENT_FROM.getTime()) h.ppaRecent.push(ppa)
  else if (d.date >= PRIOR_FROM.getTime() && d.date < PRIOR_TO.getTime()) h.ppaPrior.push(ppa)
}

/* ---------------- 5. reported water and sewer mains ---------------- */
try {
  const water = JSON.parse(await fs.readFile(WATER, 'utf8'))
  for (const r of water.records || []) {
    if (!r.geometry || (r.kind !== 'water' && r.kind !== 'sewer')) continue
    // sample along each main so long mains count in every hexagon they cross
    const asLines = r.geometry.type.includes('Line') ? turf.feature(r.geometry) : turf.polygonToLine(turf.feature(r.geometry))
    const lines = (asLines.type === 'FeatureCollection' ? asLines.features : [asLines]).flatMap((f) => turf.flatten(f).features)
    const hit = new Set()
    for (const ln of lines) {
      const L = turf.length(ln, { units: 'feet' })
      for (let d = 0; d <= L; d += 400) { const h = hexAt(turf.along(ln, d, { units: 'feet' }).geometry.coordinates); if (h) hit.add(h) }
    }
    for (const h of hit) h.m[r.kind]++
  }
  console.log('Charlotte Water records: added')
} catch { console.log('Charlotte Water data not found; run data:charlotte-water first for the utilities signal.') }

/* ---------------- 6. 2040 Policy Map ---------------- */
console.log('2040 Policy Map…')
const policy = await getAll(SOURCES.policy, { where: '1=1', outFields: 'PlaceTypeFullTxt', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0003, geometryPrecision: 5 }, 'place-type areas')
const pIndex = policy.filter((f) => f.geometry).map((f) => ({ f, bb: turf.bbox(f), type: f.properties.PlaceTypeFullTxt }))
let done = 0
for (const h of hexes) {
  const hexArea = turf.area(turf.feature(h.geom)) || 1
  const byType = {}
  for (const p of pIndex) {
    if (p.bb[2] < h.bbox[0] || p.bb[0] > h.bbox[2] || p.bb[3] < h.bbox[1] || p.bb[1] > h.bbox[3]) continue
    let a = 0
    try { const o = turf.intersect(turf.featureCollection([turf.feature(h.geom), p.f])); a = o ? turf.area(o) : 0 } catch { /* bad shape */ }
    if (a) byType[p.type] = (byType[p.type] || 0) + a
  }
  const growth = GROWTH_TYPES.reduce((t, k) => t + (byType[k] || 0), 0)
  h.m.growthShare = Math.min(1, growth / hexArea)
  h.place = Object.entries(byType).sort((a, b) => b[1] - a[1])[0]?.[0] || null
  if (++done % 100 === 0) process.stdout.write(`\r  place types: ${done}/${hexes.length}`)
}
process.stdout.write('\n')

/* ---------------- 7. price trend (with neighbors, since sales are sparse) ---------------- */
const spacing = CELL_MILES * Math.sqrt(3) * 1.15 // distance between neighboring hexagon centers, with slack
for (const h of hexes) {
  const ring = hexes.filter((o) => turf.distance(h.c, o.c, { units: 'miles' }) <= spacing)
  const recent = ring.flatMap((o) => o.ppaRecent), prior = ring.flatMap((o) => o.ppaPrior)
  h.m.ppaRecent = median(recent); h.m.ppaPrior = median(prior)
  h.m.ppaN = [recent.length, prior.length]
  h.m.priceTrend = recent.length >= 3 && prior.length >= 3 ? h.m.ppaRecent / h.m.ppaPrior - 1 : null
}

/* ---------------- write ---------------- */
const out = {
  generated: NOW.toISOString(), county: 'Mecklenburg', cellMiles: CELL_MILES,
  windows: { recentFrom: RECENT_FROM.toISOString().slice(0, 10), priorFrom: PRIOR_FROM.toISOString().slice(0, 10), priorTo: PRIOR_TO.toISOString().slice(0, 10), rezoningsFrom: yearsAgo(3).toISOString().slice(0, 10) },
  hexes: hexes.map((h) => ({ id: h.id, g: round(h.geom).coordinates[0], m: round(h.m, 3), place: h.place, rz: h.rezList.slice(0, 8) })),
}
await fs.mkdir('public/data', { recursive: true })
await fs.writeFile(OUT, JSON.stringify(out))
const kb = Math.round((await fs.stat(OUT)).size / 1024)
const withData = hexes.filter((h) => h.m.rezApproved + h.m.rezActive + h.m.sales + h.m.bigVacantN > 0).length
console.log(`\nWrote ${OUT} (${kb} KB): ${hexes.length} hexagons, ${withData} with activity`)
console.log(`  rezonings ${seen.size} decided/pending + ${active.length} in process, ${vacant.length} vacant parcels, ${deeds.size} land sales (by deed), ${pIndex.length} place-type areas`)
