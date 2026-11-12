import * as turf from '@turf/turf'
import { getJSON } from './gis'

const ZONING = '/gis/clt/PLN/Zoning/MapServer/0'
const ACTIVE = '/gis/clt/PLN/Rezonings/MapServer/0'
const HISTORY = '/gis/clt/PLN/RezoningHistory/MapServer/0'
const POLICY = '/gis/agolclt/Charlotte_Future_2040_Policy_Map/FeatureServer/0'

export const STATUS = { App: 'Approved', Wd: 'Withdrawn', Den: 'Denied', Pen: 'Pending', Def: 'Deferred' }
const HALF_MILE_FT = 2640

const atPoint = ([lng, lat], outFields) => ({
  geometry: `${lng},${lat}`,
  geometryType: 'esriGeometryPoint',
  inSR: 4326,
  spatialRel: 'esriSpatialRelIntersects',
  outFields,
  returnGeometry: false,
  f: 'json',
})

const polygonGeom = (parcel) => {
  const simple = turf.simplify(parcel, { tolerance: 0.00002 })
  const rings = simple.geometry.type === 'Polygon' ? simple.geometry.coordinates : simple.geometry.coordinates.flat()
  return JSON.stringify({ rings, spatialReference: { wkid: 4326 } })
}

export const centerOf = (parcel) => turf.pointOnFeature(parcel).geometry.coordinates

/** City of Charlotte zoning at the parcel (null outside Charlotte's zoning jurisdiction). */
export async function charlotteZoning(parcel) {
  const d = await getJSON(`${ZONING}/query`, atPoint(centerOf(parcel), 'ZoneDes,ZoneClass,ZonePetition,Overlay,Hyperlink,RezoneDate'))
  const a = d.features?.[0]?.attributes
  if (!a) return null
  return {
    code: (a.ZoneDes || '').trim(),
    className: (a.ZoneClass || '').trim(),
    petition: (a.ZonePetition || '').trim() || null,
    overlay: a.Overlay && a.Overlay !== 'none' ? a.Overlay : null,
    link: a.Hyperlink || null,
    rezonedOn: a.RezoneDate ? new Date(a.RezoneDate) : null,
  }
}

/** Charlotte Future 2040 Policy Map place type at the parcel. */
export async function placeType(parcel) {
  const d = await getJSON(`${POLICY}/query`, atPoint(centerOf(parcel), 'PlaceTypeFullTxt,PlaceTypeCde,CommunityPlanningArea'))
  const a = d.features?.[0]?.attributes
  return a ? { name: a.PlaceTypeFullTxt, code: a.PlaceTypeCde, area: a.CommunityPlanningArea } : null
}

/** Rezoning petitions currently in process that touch this parcel. */
export async function activePetitions(parcel) {
  const d = await getJSON(`${ACTIVE}/query`, {
    geometry: polygonGeom(parcel),
    geometryType: 'esriGeometryPolygon',
    inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'Petition,Petitioner,ExistZone,ReqZone,Status,Received,PetAcres',
    returnGeometry: false,
    f: 'json',
  })
  return (d.features || []).map(({ attributes: a }) => ({
    petition: a.Petition, petitioner: a.Petitioner, from: a.ExistZone, to: a.ReqZone,
    status: STATUS[a.Status] || 'In review', received: a.Received ? new Date(a.Received) : null, acres: a.PetAcres,
  }))
}

/** Petitions within half a mile since 2020, each with a point inside its site. */
export async function nearbyHistory(parcel) {
  const d = await getJSON(`${HISTORY}/query`, {
    geometry: polygonGeom(parcel),
    geometryType: 'esriGeometryPolygon',
    inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects',
    distance: HALF_MILE_FT,
    units: 'esriSRUnit_Foot',
    where: "Received >= DATE '2020-01-01'",
    outFields: 'Petition,ExistingZoning,RequestedZoning,Status,Received,Approved,PetAcres,Type',
    orderByFields: 'Received DESC',
    returnGeometry: true,
    outSR: 4326,
    maxAllowableOffset: 0.00005,
    geometryPrecision: 6,
    resultRecordCount: 200,
    f: 'geojson',
  })
  // One petition can span several rows (one per original zoning area); keep one per petition.
  const seen = new Set()
  return (d.features || []).filter((f) => (seen.has(f.properties.Petition) ? false : seen.add(f.properties.Petition))).map((f) => {
    const a = f.properties
    let point = null
    try { point = f.geometry ? turf.pointOnFeature(f).geometry.coordinates : null } catch { /* bad shape */ }
    return {
      petition: a.Petition, from: (a.ExistingZoning || '').trim(), to: (a.RequestedZoning || '').trim(),
      status: STATUS[a.Status] || 'Pending', received: a.Received ? new Date(a.Received) : null, acres: a.PetAcres,
      conditional: a.Type === 'CD' || a.Type === 'Conditional', point,
    }
  })
}

/** 2040 Policy Map polygons around a parcel (generalized), for classifying nearby sites locally. */
export async function placeTypesAround(parcel, miles = 0.6) {
  const [w, s, e, n] = turf.bbox(parcel)
  const lat = (s + n) / 2
  const dLat = miles / 69
  const dLng = dLat / Math.cos((lat * Math.PI) / 180)
  const d = await getJSON(`${POLICY}/query`, {
    geometry: [w - dLng, s - dLat, e + dLng, n + dLat].join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'PlaceTypeFullTxt',
    returnGeometry: true,
    outSR: 4326,
    maxAllowableOffset: 0.0002,
    geometryPrecision: 5,
    f: 'geojson',
  })
  return d.features || []
}

/** Place type name at a point, from polygons returned by placeTypesAround. */
export function placeTypeAt(polygons, point) {
  if (!point) return null
  const pt = turf.point(point)
  for (const f of polygons) {
    try { if (turf.booleanPointInPolygon(pt, f)) return f.properties.PlaceTypeFullTxt } catch { /* skip bad shape */ }
  }
  return null
}

let baseRatesCache = null
/** Citywide outcomes since 2020 and approval timing since the UDO took effect. */
export function cityBaseRates() {
  if (baseRatesCache) return baseRatesCache
  baseRatesCache = (async () => {
    const [counts, timing] = await Promise.all([
      getJSON(`${HISTORY}/query`, {
        where: "Received >= DATE '2020-01-01'",
        groupByFieldsForStatistics: 'Status',
        outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'Petition', outStatisticFieldName: 'n' }]),
        f: 'json',
      }),
      getJSON(`${HISTORY}/query`, {
        where: "Status = 'App' AND Received >= DATE '2023-06-01' AND Approved IS NOT NULL",
        outFields: 'Received,Approved',
        returnGeometry: false,
        f: 'json',
      }),
    ])
    const by = Object.fromEntries((counts.features || []).map((f) => [f.attributes.Status, f.attributes.n]))
    const decided = (by.App || 0) + (by.Wd || 0) + (by.Den || 0)
    const days = (timing.features || [])
      .map((f) => (f.attributes.Approved - f.attributes.Received) / 864e5)
      .filter((x) => x > 0)
      .sort((a, b) => a - b)
    const q = (p) => (days.length ? Math.round(days[Math.floor(days.length * p)]) : null)
    return {
      decided,
      approved: by.App || 0, withdrawn: by.Wd || 0, denied: by.Den || 0,
      pct: (k) => (decided ? Math.round(((by[k] || 0) / decided) * 100) : 0),
      days: { p25: q(0.25), median: q(0.5), p75: q(0.75), n: days.length },
    }
  })().catch((e) => { baseRatesCache = null; throw e })
  return baseRatesCache
}

/** Active petitions citywide, for the map layer. */
export async function activePetitionShapes() {
  return getJSON(`${ACTIVE}/query`, {
    where: '1=1',
    outFields: 'Petition,Petitioner,ExistZone,ReqZone,Received,PetAcres',
    returnGeometry: true,
    outSR: 4326,
    geometryPrecision: 6,
    f: 'geojson',
  })
}

/** Existing street centerlines near a parcel (for placing a neighborhood entrance). */
export async function nearbyStreets(parcel, feet = 500) {
  const [w, s, e, n] = turf.bbox(parcel)
  const dLat = feet / 364000, dLng = dLat / Math.cos((((s + n) / 2) * Math.PI) / 180)
  const d = await getJSON('/gis/clt/CountyData/Streets/MapServer/0/query', {
    geometry: [w - dLng, s - dLat, e + dLng, n + dLat].join(','),
    geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects',
    outFields: 'STREETNAME', returnGeometry: true, outSR: 4326, f: 'json',
  })
  return (d.features || []).filter((f) => f.geometry?.paths?.length).map((f) => turf.multiLineString(f.geometry.paths, { name: f.attributes.STREETNAME }))
}

/* ---------- approval context for a rezoning scenario ---------- */
// Charlotte's UDO took effect June 1, 2023; districts like N1-C and N2-A only exist from then on.
const UDO_START = '2023-06-01'
const MILE = 5280
const ARTERIAL = { EXMJTH: 'major thoroughfare', EXMJTHC3C: 'major thoroughfare', PROPMJTH: 'major thoroughfare', EXMINTH: 'minor thoroughfare', PROPMINTH: 'minor thoroughfare', EXCOLLMJ: 'major collector', C2EX: 'collector' }

/**
 * Factors staff and Council weigh for a rezoning to `code`, around this parcel:
 *  - precedents: rezonings requesting the same district within 5 miles since the UDO (nearest first)
 *  - citywide: how all requests for that district have been decided since the UDO
 *  - pending: petitions for the same district in process nearby
 *  - frontage: the most significant street class touching the parcel
 *  - neighbors: zoning districts on adjoining land
 */
export async function approvalContext(parcel, code) {
  const c = centerOf(parcel)
  const like = `RequestedZoning LIKE '${code}%'`
  const since = `Received >= DATE '${UDO_START}'`
  const [w, s, e, n] = turf.bbox(parcel)
  const pad = (feet) => { const dLat = feet / 364000, dLng = dLat / Math.cos((((s + n) / 2) * Math.PI) / 180); return [w - dLng, s - dLat, e + dLng, n + dLat].join(',') }

  const [near, city, pend, streets, zones] = await Promise.allSettled([
    getJSON(`${HISTORY}/query`, {
      geometry: `${c[0]},${c[1]}`, geometryType: 'esriGeometryPoint', inSR: 4326, distance: 5, units: 'esriSRUnit_StatuteMile',
      spatialRel: 'esriSpatialRelIntersects', where: `${since} AND ${like}`,
      outFields: 'Petition,Status,RequestedZoning,ExistingZoning,Received,Approved,PetAcres', returnGeometry: true, outSR: 4326,
      maxAllowableOffset: 0.0002, f: 'json',
    }),
    getJSON(`${HISTORY}/query`, {
      where: `${since} AND ${like}`, outFields: 'Status', groupByFieldsForStatistics: 'Status',
      outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'Petition', outStatisticFieldName: 'n' }]), f: 'json',
    }),
    getJSON(`${ACTIVE}/query`, {
      geometry: `${c[0]},${c[1]}`, geometryType: 'esriGeometryPoint', inSR: 4326, distance: 5, units: 'esriSRUnit_StatuteMile',
      spatialRel: 'esriSpatialRelIntersects', where: `ReqZone LIKE '${code}%'`, outFields: 'Petition,ReqZone,PetAcres,Received', returnGeometry: true, outSR: 4326,
      maxAllowableOffset: 0.0002, f: 'json',
    }),
    getJSON('/gis/clt/CountyData/Streets/MapServer/0/query', {
      geometry: pad(60), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects',
      outFields: 'WHOLESTNAME,THOROUGHFARETYPE', returnGeometry: true, outSR: 4326, f: 'json',
    }),
    getJSON(`${ZONING}/query`, {
      geometry: polygonGeom(turf.buffer(parcel, 0.03, { units: 'kilometers' })), geometryType: 'esriGeometryPolygon', inSR: 4326,
      spatialRel: 'esriSpatialRelIntersects', outFields: 'ZoneDes', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.0001, f: 'json',
    }),
  ])
  const ok = (r) => (r.status === 'fulfilled' && !r.value?.error ? r.value : null)

  // precedents, nearest first, one row per petition
  const seen = new Set()
  const toFeature = (g, props) => {
    const rings = g?.rings
    return rings?.length ? turf.polygon(rings, props) : null
  }
  const precedents = []
  for (const f of ok(near)?.features || []) {
    const a = f.attributes
    if (seen.has(a.Petition)) continue
    seen.add(a.Petition)
    const shape = toFeature(f.geometry, { petition: a.Petition })
    const miles = shape ? turf.distance(c, turf.pointOnFeature(shape), { units: 'miles' }) : null
    precedents.push({
      petition: a.Petition, status: STATUS[a.Status] || a.Status || 'Unknown', requested: (a.RequestedZoning || '').trim(),
      from: (a.ExistingZoning || '').trim(), acres: a.PetAcres, received: a.Received ? new Date(a.Received) : null,
      decided: a.Approved ? new Date(a.Approved) : null, miles, shape,
    })
  }
  precedents.sort((x, y) => (x.miles ?? 99) - (y.miles ?? 99))

  const cityCounts = {}
  for (const f of ok(city)?.features || []) cityCounts[STATUS[f.attributes.Status] || 'Other'] = (cityCounts[STATUS[f.attributes.Status] || 'Other'] || 0) + f.attributes.n
  const pending = (ok(pend)?.features || []).map((f) => {
    const shape = toFeature(f.geometry, { petition: f.attributes.Petition })
    return { petition: f.attributes.Petition, requested: (f.attributes.ReqZone || '').trim(), acres: f.attributes.PetAcres, shape,
      miles: shape ? turf.distance(c, turf.pointOnFeature(shape), { units: 'miles' }) : null }
  }).sort((x, y) => (x.miles ?? 99) - (y.miles ?? 99))

  // frontage: streets whose line passes within ~60 ft of the parcel (not just their vertices:
  // a long straight street has vertices only at its ends), best class wins
  const reach = turf.buffer(parcel, 60, { units: 'feet' })
  const touching = (ok(streets)?.features || []).filter((f) => f.geometry?.paths?.length)
    .filter((f) => f.geometry.paths.some((p) => p.length >= 2 && turf.booleanIntersects(turf.lineString(p), reach)))
  const rank = (t) => (/MJTH/.test(t) ? 0 : /MINTH/.test(t) ? 1 : /COLL|C2EX/.test(t) ? 2 : 3)
  const front = touching.map((f) => ({ name: (f.attributes.WHOLESTNAME || '').trim(), type: f.attributes.THOROUGHFARETYPE || 'LOCAL' }))
    .filter((x) => !/FRY|RAMP/.test(x.type)).sort((x, y) => rank(x.type) - rank(y.type))
  const frontage = front.length ? { name: front[0].name, kind: ARTERIAL[front[0].type] || 'local street', arterial: rank(front[0].type) <= 1 } : null

  // neighbors: districts on adjoining land, excluding the parcel's own footprint
  const nbr = {}
  for (const f of ok(zones)?.features || []) {
    const d = (f.attributes.ZoneDes || '').trim()
    if (!d || !f.geometry?.rings?.length) continue
    const poly = turf.polygon(f.geometry.rings)
    const inside = turf.booleanPointInPolygon(turf.pointOnFeature(poly), parcel) && turf.area(poly) <= turf.area(parcel) * 1.05
    if (inside) continue
    nbr[d] = (nbr[d] || 0) + 1
  }
  const neighbors = Object.keys(nbr).sort()
  const intense = neighbors.filter((d) => /^(N2|NC|CG|CAC|RAC|UC|IMU|ML|MUD|OFC|CR|TOD|ML|IC|IG|B-|O-)/.test(d))

  return {
    code, precedents, cityCounts, pending, frontage, neighbors, intenseNeighbors: intense,
    failed: [near, city, pend, streets, zones].filter((r) => !ok(r)).length,
  }
}