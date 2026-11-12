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
  const precedents = (ok(near)?.features || []).filter((f) => f.geometry?.rings?.length).map((f) => {
    const a = f.attributes
    const shape = turf.polygon(f.geometry.rings)
    const caseNo = String(a.CASE_ || '').trim()
    return {
      petition: caseNo || 'Case not listed', requested: a.ZONINGCODE, status: 'Approved', decided: null, year: yearOf(caseNo),
      acres: a.acres || turf.area(shape) / 4046.86, lots: null, from: String(a.OLDZONING || '').trim() || null,
      miles: turf.distance(c, turf.pointOnFeature(shape), { units: 'miles' }), shape,
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