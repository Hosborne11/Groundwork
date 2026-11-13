import * as turf from '@turf/turf'
import { getJSON } from './gis'
import { tigerStreets, frontageFrom } from './indianTrail'

// City of Concord's own zoning layer: case numbers (CASE_), acres, and prior zoning (OLDZONING)
const CONCORD_ZONING = '/gis/concord/Zoning/FeatureServer/10'
// City of Monroe zoning in Union County's town layers: conditional districts appear only as "CD"
const MONROE_ZONING = '/gis/union/UNION_COUNTY_LAYERS/MapServer/180'

const padded = (parcel, feet) => {
  const [w, s, e, n] = turf.bbox(parcel)
  const dLat = feet / 364000, dLng = dLat / Math.cos((((s + n) / 2) * Math.PI) / 180)
  return [w - dLng, s - dLat, e + dLng, n + dLat].join(',')
}
const nearPoint = (c) => ({ geometry: `${c[0]},${c[1]}`, geometryType: 'esriGeometryPoint', inSR: 4326, distance: 5, units: 'esriSRUnit_StatuteMile', spatialRel: 'esriSpatialRelIntersects' })
const ok = (r) => (r.status === 'fulfilled' && !r.value?.error ? r.value : null)
const yearOf = (t) => {
  const ys = [...String(t || '').matchAll(/(?:19|20)\d{2}|-(\d{2})(?=\D|$)/g)].map((m) => (m[1] ? 2000 + Number(m[1]) : Number(m[0])))
  return ys.length ? Math.max(...ys.filter((y) => y <= new Date().getFullYear())) : null
}

/** Adjoining zoning from a polygon layer, excluding the parcel's own footprint. */
function neighborsFrom(features, field, parcel) {
  const nbr = new Set()
  for (const f of features) {
    const d = String(f.attributes[field] || '').trim()
    if (!d || !f.geometry?.rings?.length) continue
    const poly = turf.polygon(f.geometry.rings)
    if (turf.booleanPointInPolygon(turf.pointOnFeature(poly), parcel) && turf.area(poly) <= turf.area(parcel) * 1.05) continue
    nbr.add(d)
  }
  return [...nbr].sort()
}

/**
 * Concord: approved conditional-district rezonings to the same district (e.g. RV-CD) within 5 miles,
 * with case number, acres, and prior zoning, from the city's zoning map. Older "-CU" conditional-use
 * districts count too.
 */
export async function concordApprovalContext(parcel, code) {
  const c = turf.pointOnFeature(parcel).geometry.coordinates
  const where = `ZONINGCODE IN ('${code}-CD','${code}-CU')`
  const [near, roads, zones] = await Promise.allSettled([
    getJSON(`${CONCORD_ZONING}/query`, { ...nearPoint(c), where, outFields: 'ZONINGCODE,CASE_,acres,OLDZONING', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0002, f: 'json' }),
    tigerStreets(parcel, 600),
    getJSON(`${CONCORD_ZONING}/query`, { geometry: padded(parcel, 100), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'ZONINGCODE', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, f: 'json' }),
  ])
  // one row per case: the map can split a case into several pieces; unnumbered slivers are dropped
  const byCase = new Map()
  for (const f of (ok(near)?.features || []).filter((x) => x.geometry?.rings?.length)) {
    const a = f.attributes
    const shape = turf.polygon(f.geometry.rings)
    const caseNo = String(a.CASE_ || '').trim()
    const acres = a.acres || turf.area(shape) / 4046.86
    const key = caseNo || `piece-${byCase.size}`
    const cur = byCase.get(key)
    if (cur) { cur.acres += acres; cur.pieces.push(shape); continue }
    byCase.set(key, { caseNo, code: a.ZONINGCODE, from: String(a.OLDZONING || '').trim() || null, acres, pieces: [shape] })
  }
  const precedents = [...byCase.values()].filter((x) => x.caseNo || x.acres >= 0.5).map((x) => {
    const shape = x.pieces.length === 1 ? x.pieces[0] : turf.convex(turf.featureCollection(x.pieces)) || x.pieces[0]
    return {
      petition: x.caseNo || 'Case not listed', requested: x.code, status: 'Approved', decided: null, year: yearOf(x.caseNo),
      acres: x.acres, lots: null, from: x.from, miles: turf.distance(c, turf.pointOnFeature(shape), { units: 'miles' }), shape,
    }
  }).filter((p) => !turf.booleanPointInPolygon(turf.point(c), p.shape)).sort((a, b) => a.miles - b.miles)
  const { frontage, nearestRoad } = frontageFrom(parcel, ok(roads) || [])
  const neighbors = neighborsFrom(ok(zones)?.features || [], 'ZONINGCODE', parcel)
  const intense = neighbors.filter((d) => /^(RV|RC|R-CO|O-I|B-1|CC|C-1|C-2|I-1|I-2|MX|PUD|PRD|TND)/.test(d))
  return {
    code, town: 'Concord', precedents, cityCounts: {}, pending: [], frontage, nearestRoad, neighbors, intenseNeighbors: intense,
    mapOnly: true, failed: [near, roads, zones].filter((r) => !ok(r)).length,
  }
}

/**
 * Monroe: the zoning map marks conditional districts only as "CD", per parcel, with no case number
 * or the district they parallel, so precedents are counts of conditionally zoned parcels nearby.
 */
export async function monroeApprovalContext(parcel, code) {
  const c = turf.pointOnFeature(parcel).geometry.coordinates
  const stats = (miles) => getJSON(`${MONROE_ZONING}/query`, {
    ...nearPoint(c), distance: miles, where: "NEW_ZONING = 'CD'",
    outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }, { statisticType: 'sum', onStatisticField: 'SHAPE.STArea()', outStatisticFieldName: 'sf' }]), f: 'json',
  })
  const [s2, s5, roads, zones] = await Promise.allSettled([
    stats(2), stats(5), tigerStreets(parcel, 600),
    getJSON(`${MONROE_ZONING}/query`, { geometry: padded(parcel, 100), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'NEW_ZONING', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, f: 'json' }),
  ])
  const row = (r) => ok(r)?.features?.[0]?.attributes
  const cd = { within2: row(s2)?.n || 0, within5: row(s5)?.n || 0, acres5: (row(s5)?.sf || 0) / 43560 } // state plane feet
  const { frontage, nearestRoad } = frontageFrom(parcel, ok(roads) || [])
  const neighbors = neighborsFrom(ok(zones)?.features || [], 'NEW_ZONING', parcel)
  const intense = neighbors.filter((d) => /^(RHD|CD|PUD|OM|NB|GB|GI|HI|DC-MX|DG-MX|CC-MX|RC-MX|MD-MX)/.test(d))
  return {
    code, town: 'Monroe', precedents: [], cityCounts: {}, pending: [], frontage, nearestRoad, neighbors, intenseNeighbors: intense,
    mapOnly: true, conditionalCounts: cd, failed: [s5, roads, zones].filter((r) => !ok(r)).length,
  }
}

/* ---------- Mecklenburg towns on ArcGIS Online (no proxy needed) ---------- */
const MATTHEWS = 'https://services5.arcgis.com/Ueg5beFsCRb0dUTQ/arcgis/rest/services'
const MATTHEWS_LAYERS = ['Traditional_Residential_Districts', 'Conditional_Only_District', 'Conditional_Districts', 'Traditional_Nonresidential_Districts']
const MINT_HILL = 'https://services5.arcgis.com/4q0H41ETciaWgDNF/arcgis/rest/services/Zoning_Layer/FeatureServer/0'
const atParcel = (parcel) => {
  const c = turf.pointOnFeature(parcel).geometry.coordinates
  return { geometry: `${c[0]},${c[1]}`, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', returnGeometry: false, f: 'json' }
}
// "R-12(CD)" / "R-12 (CD)" -> base "R-12", conditional true; Mint Hill "R DO-A (CD)" -> "R"
const parseCode = (raw) => {
  const t = String(raw || '').trim()
  const conditional = /\(CD\)|\bCD\b/i.test(t)
  const base = t.replace(/\s*\(CD\)\s*/gi, '').replace(/\s+DO-[AB]\b/gi, '').trim()
  return { raw: t, base, conditional }
}

/** Zoning for a parcel in Matthews or Mint Hill, or null. */
export async function meckTownZoning(parcel) {
  const q = atParcel(parcel)
  const [mt, mh] = await Promise.all([
    Promise.all(MATTHEWS_LAYERS.map((n) => getJSON(`${MATTHEWS}/${n}/FeatureServer/0/query`, { ...q, outFields: 'ZONE_DES' }).catch(() => null))),
    getJSON(`${MINT_HILL}/query`, { ...q, outFields: 'ZoneDes,Petition' }).catch(() => null),
  ])
  const mtHit = mt.map((r) => r?.features?.[0]?.attributes?.ZONE_DES).find(Boolean)
  if (mtHit) return { town: 'Matthews', ...parseCode(mtHit), key: parseCode(mtHit).base.replace(/^RVS$/, 'R-VS') }
  const mhAttrs = mh?.features?.[0]?.attributes
  if (mhAttrs?.ZoneDes) {
    const p = parseCode(mhAttrs.ZoneDes)
    return { town: 'Mint Hill', ...p, key: p.base === 'R' ? 'MH:R' : null, petition: mhAttrs.Petition || null }
  }
  const hv = await huntersvilleZoning(parcel).catch(() => null)
  return hv || meckCountyZoning(parcel).catch(() => null)
}

/** Matthews: approved conditional rezonings to the scenario district (R-x(CD), or R-VS areas). */
export async function matthewsApprovalContext(parcel, code) {
  const c = turf.pointOnFeature(parcel).geometry.coordinates
  const isVS = code === 'R-VS'
  const layer = isVS ? 'Conditional_Only_District' : 'Traditional_Residential_Districts'
  const where = isVS ? "ZONE_DES IN ('R-VS','RVS')" : `ZONE_DES LIKE '${code}%(CD)'`
  const [near, roads, zones] = await Promise.allSettled([
    getJSON(`${MATTHEWS}/${layer}/FeatureServer/0/query`, { ...nearPoint(c), where, outFields: 'ZONE_DES,CaseFile,Date', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0002, f: 'json' }),
    tigerStreets(parcel, 600),
    Promise.all(MATTHEWS_LAYERS.map((n) => getJSON(`${MATTHEWS}/${n}/FeatureServer/0/query`, { geometry: padded(parcel, 100), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'ZONE_DES', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, f: 'json' }).catch(() => null)))
      .then((rs) => ({ features: rs.flatMap((r) => r?.features || []) })),
  ])
  const precedents = (ok(near)?.features || []).filter((f) => f.geometry?.rings?.length).map((f) => {
    const a = f.attributes, shape = turf.polygon(f.geometry.rings)
    const caseNo = String(a.CaseFile || '').trim()
    return {
      petition: caseNo || 'Case not listed', requested: a.ZONE_DES, status: 'Approved', decided: null,
      year: a.Date ? new Date(a.Date).getFullYear() : yearOf(caseNo), acres: turf.area(shape) / 4046.86, lots: null, from: null,
      miles: turf.distance(c, turf.pointOnFeature(shape), { units: 'miles' }), shape,
    }
  }).filter((p) => p.acres >= 0.5 && !turf.booleanPointInPolygon(turf.point(c), p.shape)).sort((a, b) => a.miles - b.miles)
  const { frontage, nearestRoad } = frontageFrom(parcel, ok(roads) || [])
  const neighbors = neighborsFrom(ok(zones)?.features || [], 'ZONE_DES', parcel)
  const intense = neighbors.filter((d) => /^(R-9|R-VS|RVS|SRN|C-MF|MUD|R-12MF|R-15MF|B-|O|I-|HUC|ENT|CRC)/.test(d))
  return { code, town: 'Matthews', precedents, cityCounts: {}, pending: [], frontage, nearestRoad, neighbors, intenseNeighbors: intense, mapOnly: true, failed: [near, roads, zones].filter((r) => !ok(r)).length }
}

/** Mint Hill: conditional R rezonings nearby, with petition numbers and rezone dates. */
export async function mintHillApprovalContext(parcel, code) {
  const c = turf.pointOnFeature(parcel).geometry.coordinates
  const [near, roads, zones] = await Promise.allSettled([
    getJSON(`${MINT_HILL}/query`, { ...nearPoint(c), where: "ZoneDes LIKE 'R%(CD)'", outFields: 'ZoneDes,Petition,RezoneDate', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0002, f: 'json' }),
    tigerStreets(parcel, 600),
    getJSON(`${MINT_HILL}/query`, { geometry: padded(parcel, 100), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'ZoneDes', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, f: 'json' }),
  ])
  const precedents = (ok(near)?.features || []).filter((f) => f.geometry?.rings?.length).map((f) => {
    const a = f.attributes, shape = turf.polygon(f.geometry.rings)
    const caseNo = String(a.Petition || '').trim()
    return {
      petition: caseNo || 'Petition not listed', requested: String(a.ZoneDes || '').trim(), status: 'Approved', decided: null,
      year: a.RezoneDate ? new Date(a.RezoneDate).getFullYear() : yearOf(caseNo), acres: turf.area(shape) / 4046.86, lots: null, from: null,
      miles: turf.distance(c, turf.pointOnFeature(shape), { units: 'miles' }), shape,
    }
  }).filter((p) => p.acres >= 0.5 && !turf.booleanPointInPolygon(turf.point(c), p.shape)).sort((a, b) => a.miles - b.miles)
  const { frontage, nearestRoad } = frontageFrom(parcel, ok(roads) || [])
  const neighbors = neighborsFrom(ok(zones)?.features || [], 'ZoneDes', parcel)
  const intense = neighbors.filter((d) => /\(CD\)|PUD|B-|O-A|I-G|^I\b|R-MH/.test(d))
  return { code, town: 'Mint Hill', precedents, cityCounts: {}, pending: [], frontage, nearestRoad, neighbors, intenseNeighbors: intense, mapOnly: true, failed: [near, roads, zones].filter((r) => !ok(r)).length }
}

/* ---------- Huntersville (ArcGIS Online) ---------- */
const HV = 'https://services7.arcgis.com/CADYoH7VVBN3BQHU/arcgis/rest/services'
const HV_ZONING = `${HV}/huntersville_zoning_current/FeatureServer/0`
const HV_ARCHIVE = `${HV}/Archived_Rezonings_v2/FeatureServer/0`
// "NR(TND-O)(CD)" -> { base: 'NR', conditional: true }; Huntersville's "R" is keyed "HV:R"
const hvParse = (raw) => {
  const t = String(raw || '').trim()
  const base = t.split('(')[0].trim()
  return { raw: t, base, conditional: /\(CD\)/i.test(t), key: base === 'R' ? 'HV:R' : base }
}
const hvResult = (r) => {
  const t = String(r || '').trim().toLowerCase()
  return t.startsWith('appr') ? 'Approved' : t.startsWith('den') ? 'Denied' : t.startsWith('with') ? 'Withdrawn' : 'Outcome not recorded'
}

export async function huntersvilleZoning(parcel) {
  const r = await getJSON(`${HV_ZONING}/query`, { ...atParcel(parcel), outFields: 'ZONE_DES,ZONE_PETIT,ETJ' }).catch(() => null)
  const a = r?.features?.[0]?.attributes
  if (!a?.ZONE_DES) return null
  const p = hvParse(a.ZONE_DES)
  return { town: 'Huntersville', ...p, petition: String(a.ZONE_PETIT || '').trim() || null, etj: /etj/i.test(String(a.ETJ || '')) }
}

/** Huntersville: rezonings to the same district nearby, with outcomes from the town's archive. */
export async function huntersvilleApprovalContext(parcel, key) {
  const code = key === 'HV:R' ? 'R' : key
  const c = turf.pointOnFeature(parcel).geometry.coordinates
  const [arch, cur, record, roads, zones] = await Promise.allSettled([
    getJSON(`${HV_ARCHIVE}/query`, { ...nearPoint(c), where: '1=1', outFields: 'CaseNumber,Year,OldZoning,NewZoning,Result', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0002, f: 'json' }),
    getJSON(`${HV_ZONING}/query`, { ...nearPoint(c), where: "ZONE_DES LIKE '%(CD)%'", outFields: 'ZONE_DES,ZONE_PETIT,REZONE_DAT', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0002, f: 'json' }),
    getJSON(`${HV_ARCHIVE}/query`, { where: '1=1', outFields: 'Result', groupByFieldsForStatistics: 'Result', outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'FID', outStatisticFieldName: 'n' }]), f: 'json' }),
    tigerStreets(parcel, 600),
    getJSON(`${HV_ZONING}/query`, { geometry: padded(parcel, 100), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'ZONE_DES', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, f: 'json' }),
  ])
  const toCase = (shape, props) => ({ ...props, acres: turf.area(shape) / 4046.86, lots: null, miles: turf.distance(c, turf.pointOnFeature(shape), { units: 'miles' }), shape })
  const seen = new Set()
  const precedents = []
  // archive (through 2024): exact district match on any of the new zoning's parts ("HC(CD) & NR")
  for (const f of ok(arch)?.features || []) {
    const a = f.attributes
    if (!f.geometry?.rings?.length) continue
    const parts = String(a.NewZoning || '').split(/&|,|\//).map((x) => hvParse(x).base)
    if (!parts.includes(code)) continue
    const id = String(a.CaseNumber || '').trim()
    if (id && seen.has(id)) continue
    if (id) seen.add(id)
    precedents.push(toCase(turf.polygon(f.geometry.rings), {
      petition: id || 'Case not listed', requested: String(a.NewZoning || '').trim(), status: hvResult(a.Result), decided: null,
      year: Number(a.Year) || yearOf(id), from: String(a.OldZoning || '').trim() || null,
    }))
  }
  // newer conditional rezonings on the current map (2025 on), not already in the archive
  for (const f of ok(cur)?.features || []) {
    const a = f.attributes
    const p = hvParse(a.ZONE_DES)
    const id = String(a.ZONE_PETIT || '').trim()
    if (p.base !== code || !f.geometry?.rings?.length || (id && seen.has(id))) continue
    if (id) seen.add(id)
    precedents.push(toCase(turf.polygon(f.geometry.rings), {
      petition: id || 'Petition not listed', requested: p.raw, status: 'Approved', decided: null,
      year: a.REZONE_DAT ? new Date(a.REZONE_DAT).getFullYear() : yearOf(id), from: null,
    }))
  }
  const near = precedents.filter((p) => p.acres >= 0.5 && !turf.booleanPointInPolygon(turf.point(c), p.shape)).sort((a, b) => a.miles - b.miles)
  // the town's whole archive: how rezonings have ended
  const tally = {}
  for (const f of ok(record)?.features || []) { const k = hvResult(f.attributes.Result); tally[k] = (tally[k] || 0) + f.attributes.n }
  const recordNote = Object.keys(tally).length
    ? `Huntersville’s rezoning archive (through 2024) records ${['Approved', 'Denied', 'Withdrawn'].filter((k) => tally[k]).map((k) => `${tally[k]} ${k.toLowerCase()}`).join(', ')}${tally['Outcome not recorded'] ? `, plus ${tally['Outcome not recorded']} without an outcome` : ''}.`
    : null
  const { frontage, nearestRoad } = frontageFrom(parcel, ok(roads) || [])
  const neighbors = neighborsFrom(ok(zones)?.features || [], 'ZONE_DES', parcel)
  const intense = neighbors.filter((d) => /^(NR|TND|TOD|NC|TC|CB|HC|CI|SP|VS)/.test(d))
  return { code, town: 'Huntersville', precedents: near, cityCounts: {}, pending: [], recordNote, frontage, nearestRoad, neighbors, intenseNeighbors: intense, mapOnly: false, failed: [arch, cur, roads, zones].filter((r) => !ok(r)).length }
}

/* ---------- Mecklenburg County's towns zoning layer (Pineville; Cornelius and Davidson later) ---------- */
const MECK_TOWNS = 'https://meckgis.mecklenburgcountync.gov/server/rest/services/UnincorporatedCountyandTownsZoning/FeatureServer/0'
const MECK_PREFIX = { PINEVILLE: ['Pineville', 'PV:'] }

/** Zoning for a parcel in a town covered only by the county's layer. */
export async function meckCountyZoning(parcel) {
  const r = await getJSON(`${MECK_TOWNS}/query`, { ...atParcel(parcel), outFields: 'zone_des,munic' })
  const a = r?.features?.[0]?.attributes
  const town = MECK_PREFIX[String(a?.munic || '').trim().toUpperCase()]
  if (!a?.zone_des || !town) return null
  const p = parseCode(a.zone_des)
  return { town: town[0], ...p, key: `${town[1]}${p.base}` }
}

/** Pineville: areas carrying the scenario district within 5 miles (the county layer has no case data). */
export async function pinevilleApprovalContext(parcel, key) {
  const code = key.replace(/^PV:/, '')
  const c = turf.pointOnFeature(parcel).geometry.coordinates
  const [near, roads, zones] = await Promise.allSettled([
    getJSON(`${MECK_TOWNS}/query`, { ...nearPoint(c), where: `munic = 'PINEVILLE' AND zone_des LIKE '${code}%'`, outFields: 'zone_des', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0002, f: 'json' }),
    tigerStreets(parcel, 600),
    getJSON(`${MECK_TOWNS}/query`, { geometry: padded(parcel, 100), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'zone_des', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, f: 'json' }),
  ])
  const precedents = (ok(near)?.features || []).filter((f) => f.geometry?.rings?.length && parseCode(f.attributes.zone_des).base === code).map((f, i) => {
    const shape = turf.polygon(f.geometry.rings)
    return { petition: `Area zoned ${String(f.attributes.zone_des).trim()}`, requested: String(f.attributes.zone_des).trim(), status: 'On the map', decided: null, year: null,
      acres: turf.area(shape) / 4046.86, lots: null, from: null, miles: turf.distance(c, turf.pointOnFeature(shape), { units: 'miles' }), shape }
  }).filter((p) => p.acres >= 1 && !turf.booleanPointInPolygon(turf.point(c), p.shape)).sort((a, b) => a.miles - b.miles)
  const { frontage, nearestRoad } = frontageFrom(parcel, ok(roads) || [])
  const neighbors = neighborsFrom(ok(zones)?.features || [], 'zone_des', parcel)
  const intense = neighbors.filter((d) => /^(R-7|R-MF|RMX|DC|B-|O-|G-I)/.test(d))
  return { code: key, town: 'Pineville', precedents, cityCounts: {}, pending: [], frontage, nearestRoad, neighbors, intenseNeighbors: intense, mapOnly: true, zonedAreas: true, failed: [near, roads, zones].filter((r) => !ok(r)).length }
}

/* ---------- Kannapolis (Cabarrus County's town zoning layer 3) ---------- */
const KANNAPOLIS_ZONING = '/gis/cabarrus/OpenData/Zoning_By_Municipalities/MapServer/3'

/** Kannapolis: approved conditional rezonings to the scenario district (e.g. "R8-CZ"), with case numbers and dates. */
export async function kannapolisApprovalContext(parcel, key) {
  const code = key.replace(/^KN:/, '')
  const c = turf.pointOnFeature(parcel).geometry.coordinates
  const [near, roads, zones] = await Promise.allSettled([
    getJSON(`${KANNAPOLIS_ZONING}/query`, { ...nearPoint(c), where: `ZONINGCODE = '${code}-CZ'`, outFields: 'ZONINGCODE,CASE_NUMBE,EFFECTIVE_,ACRES', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0002, f: 'json' }),
    tigerStreets(parcel, 600),
    getJSON(`${KANNAPOLIS_ZONING}/query`, { geometry: padded(parcel, 100), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'ZONINGCODE', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, f: 'json' }),
  ])
  const byCase = new Map()
  for (const f of (ok(near)?.features || []).filter((x) => x.geometry?.rings?.length)) {
    const a = f.attributes, shape = turf.polygon(f.geometry.rings)
    const id = String(a.CASE_NUMBE || '').trim()
    const k = id || `piece-${byCase.size}`
    const cur = byCase.get(k)
    const acres = Number(a.ACRES) || turf.area(shape) / 4046.86
    if (cur) { cur.acres += acres; cur.pieces.push(shape); continue }
    byCase.set(k, { id, code: a.ZONINGCODE, date: a.EFFECTIVE_, acres, pieces: [shape] })
  }
  const precedents = [...byCase.values()].filter((x) => x.id || x.acres >= 0.5).map((x) => {
    const shape = x.pieces.length === 1 ? x.pieces[0] : turf.convex(turf.featureCollection(x.pieces)) || x.pieces[0]
    const year = x.date ? new Date(x.date).getFullYear() : yearOf(x.id)
    return { petition: x.id || 'Case not listed', requested: x.code, status: 'Approved', decided: null, year: Number.isFinite(year) ? year : null,
      acres: x.acres, lots: null, from: null, miles: turf.distance(c, turf.pointOnFeature(shape), { units: 'miles' }), shape }
  }).filter((p) => !turf.booleanPointInPolygon(turf.point(c), p.shape)).sort((a, b) => a.miles - b.miles)
  const { frontage, nearestRoad } = frontageFrom(parcel, ok(roads) || [])
  const neighbors = neighborsFrom(ok(zones)?.features || [], 'ZONINGCODE', parcel)
  const intense = neighbors.filter((d) => /^(R6|R7|R8|R18|PD|C|MX|O|I)/.test(d))
  return { code: key, town: 'Kannapolis', precedents, cityCounts: {}, pending: [], frontage, nearestRoad, neighbors, intenseNeighbors: intense, mapOnly: true, failed: [near, roads, zones].filter((r) => !ok(r)).length }
}