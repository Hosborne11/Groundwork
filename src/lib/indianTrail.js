import * as turf from '@turf/turf'
import { getJSON } from './gis'

// Census TIGER roads (every county); MTFCC S1100 = primary, S1200 = secondary, S1400 = local
const TIGER_ROADS = '/gis/tiger/Transportation/MapServer/8'
const IT_ZONING = '/gis/union/UNION_COUNTY_LAYERS/MapServer/174'
const ROAD_KIND = { S1100: 'primary highway', S1200: 'thoroughfare', S1400: 'local street', S1640: 'service road', S1730: 'alley', S1740: 'private road' }

const padded = (parcel, feet) => {
  const [w, s, e, n] = turf.bbox(parcel)
  const dLat = feet / 364000, dLng = dLat / Math.cos((((s + n) / 2) * Math.PI) / 180)
  return [w - dLng, s - dLat, e + dLng, n + dLat].join(',')
}

/** Street centerlines near a parcel from Census TIGER (for placing a neighborhood entrance). */
export async function tigerStreets(parcel, feet = 500) {
  const d = await getJSON(`${TIGER_ROADS}/query`, {
    geometry: padded(parcel, feet), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects',
    outFields: 'NAME,MTFCC', returnGeometry: true, outSR: 4326, f: 'json',
  })
  return (d.features || []).filter((f) => f.geometry?.paths?.length).map((f) => turf.multiLineString(f.geometry.paths, { name: f.attributes.NAME, mtfcc: f.attributes.MTFCC }))
}

// Indian Trail conditional districts carry a "CZ-" prefix without the hyphen: SF-5 -> CZ-SF5
const czCode = (code) => `CZ-${code.replace('-', '')}`
const yearOf = (caseText) => {
  const years = [...String(caseText || '').matchAll(/(?:19|20)\d{2}/g)].map((m) => Number(m[0]))
  return years.length ? Math.max(...years) : null
}

/**
 * Approval context for an Indian Trail conditional rezoning to `code`:
 *  - precedents: approved conditional rezonings to the same district within 5 miles, from the
 *    town's zoning map (only approved cases appear on a zoning map)
 *  - frontage: the most significant TIGER road touching the parcel
 *  - neighbors: zoning on adjoining land
 */
export async function itApprovalContext(parcel, code) {
  const c = turf.pointOnFeature(parcel).geometry.coordinates
  const where = `NEW_ZONIN = '${czCode(code)}'`
  const nearGeom = { geometry: `${c[0]},${c[1]}`, geometryType: 'esriGeometryPoint', inSR: 4326, distance: 5, units: 'esriSRUnit_StatuteMile', spatialRel: 'esriSpatialRelIntersects' }
  const [stats, roads, zones] = await Promise.allSettled([
    // the map stores one polygon per lot, so count lots per case on the server
    getJSON(`${IT_ZONING}/query`, {
      ...nearGeom, where, outFields: 'CASE_NU', groupByFieldsForStatistics: 'CASE_NU',
      outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }]), f: 'json',
    }),
    tigerStreets(parcel, 600),
    getJSON(`${IT_ZONING}/query`, {
      geometry: padded(parcel, 100), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects',
      outFields: 'NEW_ZONIN', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, f: 'json',
    }),
  ])
  const ok = (r) => (r.status === 'fulfilled' && !r.value?.error ? r.value : null)

  // each case's extent, for distance and an outline on the map
  const caseRows = (ok(stats)?.features || []).map((f) => ({ name: String(f.attributes.CASE_NU || '').trim(), lots: f.attributes.n })).filter((x) => x.name).slice(0, 30)
  const extents = await Promise.allSettled(caseRows.map((x) => getJSON(`${IT_ZONING}/query`, {
    where: `${where} AND CASE_NU = '${x.name.replace(/'/g, "''")}'`, returnExtentOnly: true, outSR: 4326, f: 'json',
  })))
  const precedents = caseRows.map((x, i) => {
    const e = ok(extents[i])?.extent
    if (!e || !Number.isFinite(e.xmin)) return null
    const shape = turf.bboxPolygon([e.xmin, e.ymin, e.xmax, e.ymax], { properties: { petition: x.name } })
    return {
      petition: x.name, requested: czCode(code), status: 'Approved', from: null, decided: null, year: yearOf(x.name),
      lots: x.lots, acres: null, miles: turf.distance(c, turf.center(shape), { units: 'miles' }), shape,
    }
  }).filter(Boolean).filter((p) => !turf.booleanContains(p.shape, turf.point(c)) || p.lots > 1)
    .sort((a, b) => a.miles - b.miles)

  // frontage: TIGER roads whose line passes within ~60 ft of the parcel
  const reach = turf.buffer(parcel, 60, { units: 'feet' })
  const rank = (m) => (m === 'S1100' ? 0 : m === 'S1200' ? 1 : m === 'S1400' ? 2 : 3)
  const front = (ok(roads) || []).filter((r) => turf.booleanIntersects(r, reach)).sort((a, b) => rank(a.properties.mtfcc) - rank(b.properties.mtfcc))
  const frontage = front.length ? { name: front[0].properties.name, kind: ROAD_KIND[front[0].properties.mtfcc] || 'street', arterial: rank(front[0].properties.mtfcc) <= 1 } : null
  // no road touches the parcel: name the nearest one, measured edge to edge
  let nearestRoad = null
  if (!frontage) {
    const outline = turf.polygonToLine(parcel)
    const lines = (outline.type === 'FeatureCollection' ? outline.features : [outline]).flatMap((l) => (l.geometry.type === 'LineString' ? [l] : l.geometry.coordinates.map((c) => turf.lineString(c))))
    const pv = lines.flatMap((l) => l.geometry.coordinates)
    for (const r of ok(roads) || []) {
      for (const path of r.geometry.coordinates) {
        if (path.length < 2) continue
        const rl = turf.lineString(path)
        let d = Math.min(...pv.map((v) => turf.pointToLineDistance(v, rl, { units: 'feet' })))
        for (const v of path) for (const l of lines) d = Math.min(d, turf.pointToLineDistance(v, l, { units: 'feet' }))
        if (!nearestRoad || d < nearestRoad.feet) nearestRoad = { name: r.properties.name, feet: Math.round(d) }
      }
    }
  }

  // adjoining zoning (excluding the parcel's own footprint)
  const nbr = new Set()
  for (const f of ok(zones)?.features || []) {
    const d = String(f.attributes.NEW_ZONIN || '').trim()
    if (!d || !f.geometry?.rings?.length) continue
    const poly = turf.polygon(f.geometry.rings)
    if (turf.booleanPointInPolygon(turf.pointOnFeature(poly), parcel) && turf.area(poly) <= turf.area(parcel) * 1.05) continue
    nbr.add(d)
  }
  const neighbors = [...nbr].sort()
  const intense = neighbors.filter((d) => /^(CZ-)?(SF-?5|MFR|MXD|NBD|GBD|RBD|DCD|DTD|L-?I|H-?I)/.test(d))

  return {
    code, town: 'Indian Trail', precedents, cityCounts: {}, pending: [], frontage, nearestRoad, neighbors, intenseNeighbors: intense,
    mapOnly: true, // precedents come from the zoning map: approved cases only
    failed: [stats, roads, zones].filter((r) => !ok(r)).length,
  }
}