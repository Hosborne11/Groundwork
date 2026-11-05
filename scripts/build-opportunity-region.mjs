#!/usr/bin/env node
/**
 * Builds opportunity hexagons for Cabarrus County, NC and York County, SC:
 *   public/data/opportunity-cabarrus.json
 *   public/data/opportunity-york.json
 *
 *   npm run data:opportunity-region            (both counties)
 *   npm run data:opportunity-region cabarrus   (one county)
 *
 * Same hexagon grid and signals as the Mecklenburg build, using what each county publishes.
 * Each file lists which signals it has, and the app scores each county against itself.
 */
import fs from 'node:fs/promises'
import * as turf from '@turf/turf'

const CELL_MILES = 0.4
const NOW = new Date()
const FIRST_YEAR = 2020
const YEARS = Array.from({ length: NOW.getFullYear() - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i)
const yearIx = (ms) => { const y = new Date(ms).getFullYear(); return y >= FIRST_YEAR && y <= NOW.getFullYear() ? y - FIRST_YEAR : -1 }
const yearsAgo = (n) => new Date(NOW.getFullYear() - n, NOW.getMonth(), NOW.getDate())
const RECENT_FROM = yearsAgo(2), PRIOR_FROM = yearsAgo(6), PRIOR_TO = yearsAgo(4)
const MIN_SALES = 5, TREND_CAP = [-0.5, 1.5]
const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb'
const ROAD_LAYERS = [{ id: 2, w: 4 }, { id: 6, w: 5 }, { id: 8, w: 1 }] // primary, secondary, local roads

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36' }
const qs = (o) => new URLSearchParams(o).toString()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round = (g, d = 5) => JSON.parse(JSON.stringify(g, (k, v) => (typeof v === 'number' ? Math.round(v * 10 ** d) / 10 ** d : v)))
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const centerOf = (f) => { if (!f?.geometry) return null; try { return turf.pointOnFeature(f).geometry.coordinates } catch { return null } }
const acresOf = (f) => { if (!f?.geometry) return 0; try { return turf.area(f) / 4046.86 } catch { return 0 } }

async function get(url, params, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${url}/query?${qs(params)}`, { headers: HEADERS })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const txt = await r.text()
      if (!txt) throw new Error('empty response from the server')
      const j = JSON.parse(txt)
      if (j.error) throw new Error(j.error.message)
      return j
    } catch (e) {
      if (i === tries - 1) throw new Error(`${url.split('/services/')[1] || url}: ${e.message}`)
      await sleep(1000 * (i + 1))
    }
  }
}
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

/* ---------------- shared building blocks ---------------- */
async function makeGrid(geoid, prefix) {
  const fc = await get(`${TIGER}/State_County/MapServer/1`, { where: `GEOID='${geoid}'`, outFields: 'GEOID', returnGeometry: true, outSR: 4326, f: 'geojson' })
  const county = fc.features[0]
  const grid = turf.hexGrid(turf.bbox(county), CELL_MILES, { units: 'miles' })
  const hexes = grid.features.filter((h) => turf.booleanIntersects(h, county)).map((h, i) => ({
    id: `${prefix}${i}`, geom: h.geometry, c: turf.centroid(h).geometry.coordinates, bbox: turf.bbox(h),
    m: { rezApproved: 0, rezActive: 0, rezAcres: 0, sales: 0, saleAcres: 0, vacantAc: 0, bigVacantAc: 0, bigVacantN: 0, water: 0, sewer: 0, growthShare: 0 },
    ppa: { small: { recent: [], prior: [] }, tract: { recent: [], prior: [] } },
    t: { filed: YEARS.map(() => 0), approved: YEARS.map(() => 0), sales: YEARS.map(() => 0) },
    rezList: [], roads: {},
  }))
  const B = 0.01, buckets = new Map(), key = (x, y) => `${Math.floor(x / B)},${Math.floor(y / B)}`
  for (const h of hexes) for (let x = h.bbox[0]; x <= h.bbox[2] + B; x += B) for (let y = h.bbox[1]; y <= h.bbox[3] + B; y += B) {
    const k = key(x, y); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(h)
  }
  const hexAt = (pt) => { if (!pt) return null; for (const h of buckets.get(key(pt[0], pt[1])) || []) if (turf.booleanPointInPolygon(pt, h.geom)) return h; return null }
  console.log(`  ${hexes.length} hexagons`)
  return { county, hexes, hexAt }
}

function addVacant(features, hexAt, acresField) {
  for (const f of features) {
    const ac = Number(f.properties[acresField]) || acresOf(f)
    const h = hexAt(centerOf(f))
    if (!h || !(ac > 0)) continue
    h.m.vacantAc += ac
    if (ac >= 2) { h.m.bigVacantAc += ac; h.m.bigVacantN++ }
  }
}

/** sales: [{ id, price, date (ms), book, page, acres, pt }] */
function addSales(sales, hexAt) {
  const deeds = new Map()
  for (const s of sales) {
    if (!s.pt) continue
    const k = s.book ? `${s.book}|${s.page}|${s.date}` : `${s.id}|${s.date}` // parcels on one deed are one sale
    const d = deeds.get(k) || { price: s.price, date: s.date, acres: 0, pt: s.pt }
    d.acres += s.acres
    deeds.set(k, d)
  }
  for (const d of deeds.values()) {
    const h = hexAt(d.pt)
    if (!h) continue
    if (d.date >= RECENT_FROM.getTime()) { h.m.sales++; h.m.saleAcres += d.acres }
    const sy = yearIx(d.date); if (sy >= 0) h.t.sales[sy]++
    const ppa = d.acres >= 0.1 ? d.price / d.acres : null
    if (!ppa || ppa > 20e6) continue
    const band = d.acres < 1 ? h.ppa.small : h.ppa.tract
    if (d.date >= RECENT_FROM.getTime()) band.recent.push(ppa)
    else if (d.date >= PRIOR_FROM.getTime() && d.date < PRIOR_TO.getTime()) band.prior.push(ppa)
  }
  return deeds.size
}

function addMains(features, hexAt, kind) {
  for (const f of features) {
    if (!f.geometry) continue
    const hit = new Set()
    for (const ln of turf.flatten(f).features) {
      const L = turf.length(ln, { units: 'feet' })
      for (let d = 0; d <= L; d += 400) { const h = hexAt(turf.along(ln, d, { units: 'feet' }).geometry.coordinates); if (h) hit.add(h) }
    }
    for (const h of hit) h.m[kind]++
  }
}

async function addRoadNames(county, hexes, hexAt) {
  const bbox = turf.bbox(county).join(',')
  for (const { id, w } of ROAD_LAYERS) {
    const roads = await getAll(`${TIGER}/Transportation/MapServer/${id}`, { geometry: bbox, geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'NAME', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, geometryPrecision: 5 }, `roads (layer ${id})`)
    for (const f of roads) {
      const name = (f.properties.NAME || '').trim()
      if (!name || !f.geometry) continue
      for (const ln of turf.flatten(f).features) {
        const L = turf.length(ln, { units: 'feet' })
        for (let d = 100; d < L; d += 200) { const h = hexAt(turf.along(ln, d, { units: 'feet' }).geometry.coordinates); if (h) h.roads[name] = (h.roads[name] || 0) + 200 * w }
      }
    }
  }
  for (const h of hexes) {
    const [first, second] = Object.entries(h.roads).sort((a, b) => b[1] - a[1])
    h.name = first ? (second && second[1] >= 0.3 * first[1] ? `${first[0]} & ${second[0]}` : first[0]) : null
  }
}

function finishTrends(hexes) {
  const spacing = CELL_MILES * Math.sqrt(3) * 1.15
  for (const h of hexes) {
    const ring = hexes.filter((o) => turf.distance(h.c, o.c, { units: 'miles' }) <= spacing)
    const bands = []
    for (const key of ['small', 'tract']) {
      const recent = ring.flatMap((o) => o.ppa[key].recent), prior = ring.flatMap((o) => o.ppa[key].prior)
      if (recent.length < MIN_SALES || prior.length < MIN_SALES) continue
      const r = median(recent), p = median(prior)
      bands.push({ band: key, recent: r, prior: p, nR: recent.length, nP: prior.length, trend: r / p - 1, w: Math.min(recent.length, prior.length) })
    }
    const wsum = bands.reduce((t, b) => t + b.w, 0)
    const raw = wsum ? bands.reduce((t, b) => t + b.trend * b.w, 0) / wsum : null
    h.m.priceTrend = raw == null ? null : Math.max(TREND_CAP[0], Math.min(TREND_CAP[1], raw))
    h.m.trendBands = bands.map(({ w, ...b }) => b)
  }
}

async function write(file, meta, hexes) {
  const out = {
    generated: NOW.toISOString(), cellMiles: CELL_MILES, years: YEARS, partialYear: { year: NOW.getFullYear(), through: NOW.toISOString().slice(0, 10) },
    ...meta,
    hexes: hexes.map((h) => ({ id: h.id, name: h.name, g: round(h.geom).coordinates[0], m: round(h.m, 3), t: h.t, place: null, rz: h.rezList.slice(0, 8) })),
  }
  await fs.mkdir('public/data', { recursive: true })
  await fs.writeFile(file, JSON.stringify(out))
  const kb = Math.round((await fs.stat(file)).size / 1024)
  const active = hexes.filter((h) => h.m.rezApproved + h.m.sales + h.m.bigVacantN > 0).length
  console.log(`Wrote ${file} (${kb} KB): ${hexes.length} hexagons, ${active} with activity\n`)
}

/* ---------------- Cabarrus County, NC ---------------- */
async function cabarrus() {
  console.log('CABARRUS COUNTY')
  const PARCELS = 'https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData/Tax_Parcels/MapServer/1'
  const CASES = 'https://services2.arcgis.com/0esqB0FgvL32hAbY/arcgis/rest/services/Case_Polygons/FeatureServer/7'
  const SEWER = 'https://services2.arcgis.com/0esqB0FgvL32hAbY/arcgis/rest/services/SGravityMain/FeatureServer/0'
  const WATER = 'https://services2.arcgis.com/0esqB0FgvL32hAbY/arcgis/rest/services/WaterSystem/FeatureServer/7'
  const { county, hexes, hexAt } = await makeGrid('37025', 'c')

  // Concord's rezoning cases (the only Cabarrus rezonings published with dates; the list stops in 2024)
  const cases = await getAll(CASES, { where: "CaseType = 'Zoning Map Amendment'", outFields: 'CaseNumber,Status,MostRecentUpdate,Year,Description', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, geometryPrecision: 5 }, 'Concord rezoning cases')
  for (const f of cases) {
    const p = f.properties, h = hexAt(centerOf(f))
    if (!h) continue
    const upd = (p.MostRecentUpdate || '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1]
    const when = upd ? Date.parse(upd) : p.Year ? Date.UTC(p.Year, 6, 1) : null
    const fy = p.Year ? p.Year - FIRST_YEAR : -1; if (fy >= 0 && fy < YEARS.length) h.t.filed[fy]++
    const approved = /approv/i.test(p.MostRecentUpdate || '') && !/withdrawn|denied/i.test(p.Status || '')
    if (approved && when) {
      const ay = yearIx(when); if (ay >= 0) h.t.approved[ay]++
      if (when >= yearsAgo(3).getTime()) { h.m.rezApproved++; h.m.rezAcres += acresOf(f) }
      h.rezList.push([p.CaseNumber, (p.Description || '').replace(/^.*?to\s+/i, '').slice(0, 40), 'Approved'])
    }
  }

  // vacant land, and vacant-land sales (the county keeps each parcel's most recent sale)
  const vacant = await getAll(PARCELS, { where: "VacantOrImproved = 'V'", outFields: 'PIN14,CALCULATED_ACREAGE', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0002, geometryPrecision: 5 }, 'vacant parcels')
  addVacant(vacant, hexAt, 'CALCULATED_ACREAGE')
  const sold = await getAll(PARCELS, { where: `VacantOrImproved = 'V' AND SaleYear >= ${FIRST_YEAR} AND SalePrice > 1000`, outFields: 'PIN14,SalePrice,SaleYear,SaleMonth,DeedBook,DeedPage,CALCULATED_ACREAGE', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0002, geometryPrecision: 5 }, 'vacant-land sales')
  const deeds = addSales(sold.filter((f) => f.geometry).map((f) => {
    const p = f.properties
    return { id: p.PIN14, price: Number(p.SalePrice), date: Date.UTC(p.SaleYear, Math.max(0, (p.SaleMonth || 7) - 1), 15), book: p.DeedBook, page: p.DeedPage, acres: Number(p.CALCULATED_ACREAGE) || acresOf(f), pt: centerOf(f) }
  }), hexAt)

  // Concord's sewer and water mains (actual pipes; other utilities in the county don't publish theirs)
  // (the two layers name their ID field differently; asking for a field that doesn't exist returns nothing)
  for (const [url, idField, kind, label] of [[SEWER, 'OBJECTID', 'sewer', 'Concord sewer mains'], [WATER, 'FID', 'water', 'Concord water mains']]) {
    try {
      addMains(await getAll(url, { where: '1=1', outFields: idField, returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, geometryPrecision: 5 }, label), hexAt, kind)
    } catch (e) {
      console.log(`\n  Skipped ${label}: ${e.message || 'no response'}. The rest of the build continues without it.`)
    }
  }

  await addRoadNames(county, hexes, hexAt)
  finishTrends(hexes)
  await write('public/data/opportunity-cabarrus.json', {
    county: 'Cabarrus',
    factors: ['rezoning', 'sales', 'trend', 'land', 'utilities'],
    measures: ['filed', 'approved', 'sales'],
    notes: {
      rezoning: 'City of Concord rezoning cases only; Concord stopped updating this list after 2024.',
      utilities: 'City of Concord water and sewer mains only.',
      sales: 'Cabarrus keeps only each parcel’s most recent sale, so earlier years are undercounted.',
    },
  }, hexes)
  console.log(`  ${cases.length} rezoning cases, ${vacant.length} vacant parcels, ${deeds} land sales (by deed)`)
}

/* ---------------- York County, SC ---------------- */
async function york() {
  console.log('YORK COUNTY')
  const Y = 'https://services1.arcgis.com/2AGLxyiJoNiVHKwq/arcgis/rest/services'
  const PARCELS = `${Y}/Parcels/FeatureServer/0`
  const ZONING = `${Y}/${encodeURIComponent('York County Zoning (regions)')}/FeatureServer/0`
  const SERVICE = `${Y}/${encodeURIComponent('County Water and Sewer Service Area Boundary')}/FeatureServer/0`
  const { county, hexes, hexAt } = await makeGrid('45091', 'y')

  // approved rezonings recorded on the county zoning map (unincorporated York County)
  const zones = await getAll(ZONING, { where: `RezoningCaseNumber IS NOT NULL AND CouncilAdoptionDate >= DATE '${FIRST_YEAR - 1}-01-01'`, outFields: 'RezoningCaseNumber,CouncilAdoptionDate,zone', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, geometryPrecision: 5 }, 'rezoned areas')
  const byCase = new Map()
  for (const f of zones) {
    const p = f.properties
    const c = byCase.get(p.RezoningCaseNumber) || { date: p.CouncilAdoptionDate, zone: p.zone, acres: 0, f }
    c.acres += acresOf(f)
    byCase.set(p.RezoningCaseNumber, c)
  }
  for (const [num, c] of byCase) {
    const h = hexAt(centerOf(c.f))
    if (!h) continue
    const ay = yearIx(c.date); if (ay >= 0) h.t.approved[ay]++
    if (c.date >= yearsAgo(3).getTime()) { h.m.rezApproved++; h.m.rezAcres += c.acres }
    h.rezList.push([`York ${num}`, c.zone, 'Approved'])
  }

  const vacant = await getAll(PARCELS, { where: "ImprovedStatus = 'Vacant'", outFields: 'ParcelID,GISSizeAC', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0002, geometryPrecision: 5 }, 'vacant parcels')
  addVacant(vacant, hexAt, 'GISSizeAC')
  const sold = await getAll(PARCELS, { where: `ImprovedStatus = 'Vacant' AND DateSold >= DATE '${FIRST_YEAR}-01-01' AND SalePrice > 1000`, outFields: 'ParcelID,SalePrice,DateSold,TransferBook,TransferPage,GISSizeAC', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0002, geometryPrecision: 5 }, 'vacant-land sales')
  const deeds = addSales(sold.filter((f) => f.geometry).map((f) => {
    const p = f.properties
    return { id: p.ParcelID, price: Number(p.SalePrice), date: p.DateSold, book: p.TransferBook, page: p.TransferPage, acres: Number(p.GISSizeAC) || acresOf(f), pt: centerOf(f) }
  }), hexAt)

  // water and sewer service areas (York publishes provider boundaries, not pipes)
  const areas = await getAll(SERVICE, { where: '1=1', outFields: 'SVCPROVIDER', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0002, geometryPrecision: 5 }, 'service areas')
  for (const h of hexes) if (areas.some((a) => a.geometry && turf.booleanPointInPolygon(h.c, a))) { h.m.water = 1; h.m.sewer = 1 }

  await addRoadNames(county, hexes, hexAt)
  finishTrends(hexes)
  await write('public/data/opportunity-york.json', {
    county: 'York',
    factors: ['rezoning', 'sales', 'trend', 'land', 'utilities'],
    measures: ['approved', 'sales'],
    notes: {
      rezoning: 'Rezonings approved by York County (unincorporated areas); town rezonings and pending cases aren’t published.',
      utilities: 'Inside a public water and sewer provider’s service area (York publishes service areas, not pipes).',
      sales: 'York keeps only each parcel’s most recent sale, so earlier years are undercounted.',
    },
  }, hexes)
  console.log(`  ${byCase.size} rezoning cases, ${vacant.length} vacant parcels, ${deeds} land sales (by deed)`)
}

const which = (process.argv[2] || 'all').toLowerCase()
if (which === 'all' || which === 'cabarrus') await cabarrus()
if (which === 'all' || which === 'york') await york()
