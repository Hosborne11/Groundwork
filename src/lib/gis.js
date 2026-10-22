import * as turf from '@turf/turf'

// All requests go through /gis/* (Vite proxy locally, vercel.json rewrites in prod).
export const SOURCES = {
  zoning: '/gis/cabarrus/OpenData/Zoning_By_Municipalities/MapServer',
  sewer: '/gis/concord/SGravityMain/FeatureServer/0',
  water: '/gis/concord/WaterSystem/FeatureServer/7',
  floodMap: '/gis/fema/public/NFHL/MapServer',
  flood: '/gis/fema/public/NFHL/MapServer/28',
  soils: '/gis/sda',
}

const ZONING_LAYERS = [
  { id: 0, town: 'Concord' },
  { id: 2, town: 'Harrisburg' },
  { id: 3, town: 'Kannapolis' },
  { id: 4, town: 'Locust' },
  { id: 5, town: 'Midland' },
  { id: 6, town: 'Mount Pleasant' },
]

const HALF_MILE_FT = 2640

export async function getJSON(url, params) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${url}?${qs}`)
  if (!res.ok) throw new Error(`${res.status} from ${url}`)
  const text = await res.text()
  if (!text) throw new Error(`Empty response from ${url}`)
  const data = JSON.parse(text)
  if (data.error) throw new Error(data.error.message || 'GIS server error')
  return data
}

// Esri JSON polygon/polyline -> GeoJSON geometry
function esriToGeo(g) {
  if (!g) return null
  if (g.paths) return { type: 'MultiLineString', coordinates: g.paths }
  if (g.rings) return { type: 'Polygon', coordinates: g.rings }
  if (g.x != null) return { type: 'Point', coordinates: [g.x, g.y] }
  return null
}

function geoToEsriPolygon(geom) {
  const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat()
  return JSON.stringify({ rings, spatialReference: { wkid: 4326 } })
}

/* ---------- Zoning ---------- */

export async function zoningAt([lng, lat]) {
  const results = await Promise.allSettled(
    ZONING_LAYERS.map(({ id, town }) =>
      getJSON(`${SOURCES.zoning}/${id}/query`, {
        geometry: `${lng},${lat}`,
        geometryType: 'esriGeometryPoint',
        inSR: 4326,
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'ZONINGCODE',
        returnGeometry: false,
        f: 'json',
      }).then((d) => d.features?.map((f) => ({ town, code: f.attributes.ZONINGCODE })) || [])
    )
  )
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

/* ---------- Utilities (distance from parcel edge to nearest line) ---------- */

async function nearestLine(url, parcel, sizeFields) {
  const simple = turf.simplify(parcel, { tolerance: 0.00002, highQuality: false })
  const data = await getJSON(`${url}/query`, {
    geometry: geoToEsriPolygon(simple.geometry),
    geometryType: 'esriGeometryPolygon',
    inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects',
    distance: HALF_MILE_FT,
    units: 'esriSRUnit_Foot',
    outFields: '*',
    returnGeometry: true,
    outSR: 4326,
    f: 'json',
  })
  const feats = data.features || []
  if (!feats.length) return { found: false }

  const vertices = turf.explode(simple).features
  const edges = turf.flatten(turf.polygonToLine(simple)).features
  let best = null
  for (const f of feats) {
    const geom = esriToGeo(f.geometry)
    if (!geom) continue
    const lines = turf.flatten(turf.feature(geom)).features // MultiLineString -> LineStrings
    let d = Infinity
    for (const line of lines) {
      if (line.geometry.coordinates.length < 2) continue
      if (turf.booleanIntersects(line, simple)) { d = 0; break }
      for (const v of vertices) d = Math.min(d, turf.pointToLineDistance(v, line, { units: 'feet' }))
      // line vertices vs parcel edges catches pipes running past a long straight property line
      for (const lv of turf.explode(line).features) {
        for (const e of edges) d = Math.min(d, turf.pointToLineDistance(lv, e, { units: 'feet' }))
      }
    }
    if (!Number.isFinite(d)) continue
    if (!best || d < best.distanceFt) {
      const a = f.attributes
      const sizeKey = sizeFields.find((k) => a[k] != null && a[k] !== 0)
      best = {
        distanceFt: d,
        sizeIn: sizeKey ? a[sizeKey] : null,
        material: (a.MATERIAL || '').trim() || null,
      }
    }
  }
  if (!best) return { found: false }
  return { found: true, count: feats.length, ...best }
}

export const nearestSewer = (parcel) => nearestLine(SOURCES.sewer, parcel, ['NOMINALSIZ', 'DIAMETER', 'SIZE_'])
export const nearestWater = (parcel) => nearestLine(SOURCES.water, parcel, ['DIAMETER', 'NOMINALSIZ', 'SIZE_', 'PIPESIZE'])

/* ---------- Flood (share of parcel area in each FEMA zone) ---------- */

export async function floodShare(parcel) {
  const simple = turf.simplify(parcel, { tolerance: 0.00002 })
  const data = await getJSON(`${SOURCES.flood}/query`, {
    geometry: geoToEsriPolygon(simple.geometry),
    geometryType: 'esriGeometryPolygon',
    inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects',
    where: "SFHA_TF = 'T'",
    outFields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF',
    returnGeometry: true,
    outSR: 4326,
    maxAllowableOffset: 0.00002,
    geometryPrecision: 6,
    f: 'json',
  })
  const total = turf.area(simple)
  const byZone = {}
  const polys = [] // floodplain shapes, kept for the site plan sketch
  for (const f of data.features || []) {
    const geom = esriToGeo(f.geometry)
    if (!geom) continue
    if (f.attributes.SFHA_TF === 'T') polys.push(turf.feature(geom))
    const a = f.attributes
    if (a.SFHA_TF !== 'T') continue // only Special Flood Hazard Areas (A, AE, floodway...)
    let overlap = 0
    try {
      const inter = turf.intersect(turf.featureCollection([simple, turf.feature(geom)]))
      overlap = inter ? turf.area(inter) : 0
    } catch { /* bad geometry from source; skip */ }
    if (!overlap) continue
    const label = a.ZONE_SUBTY?.includes('FLOODWAY') ? `${a.FLD_ZONE} floodway` : a.FLD_ZONE
    byZone[label] = (byZone[label] || 0) + overlap
  }
  const zones = Object.entries(byZone).map(([zone, m2]) => ({ zone, pct: Math.min(100, (m2 / total) * 100) }))
  const pct = Math.min(100, zones.reduce((s, z) => s + z.pct, 0))
  return { pct, zones, polys }
}

/* ---------- Soils (USDA Soil Data Access) ---------- */

export async function soilsFor(parcel) {
  const simple = turf.simplify(parcel, { tolerance: 0.0001 })
  const ring = (simple.geometry.type === 'Polygon' ? simple.geometry.coordinates[0] : simple.geometry.coordinates[0][0])
  const wkt = `POLYGON((${ring.map(([x, y]) => `${x.toFixed(6)} ${y.toFixed(6)}`).join(',')}))`
  const query = `
    SELECT mu.musym, mu.muname, c.drainagecl, c.hydgrp, c.comppct_r
    FROM mapunit mu
    INNER JOIN component c ON c.mukey = mu.mukey AND c.majcompflag = 'Yes'
    WHERE mu.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${wkt}'))
    ORDER BY c.comppct_r DESC`
  const res = await fetch(SOURCES.soils, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, format: 'JSON+COLUMNNAME' }),
  })
  if (!res.ok) throw new Error('Soils service unavailable')
  const data = await res.json()
  const [cols, ...rows] = data.Table || []
  if (!cols) return []
  const seen = new Set()
  return rows
    .map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])))
    .filter((r) => (seen.has(r.musym) ? false : seen.add(r.musym)))
    .slice(0, 4)
}

/* ---------- Map overlays ---------- */

const origin = () => window.location.origin
const exportUrl = (base, extra) =>
  `${origin()}${base}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image&${extra}`

export const floodTiles = () => exportUrl(SOURCES.floodMap, 'layers=show:28')

export async function linesInView(which, [w, s, e, n]) {
  const url = which === 'sewer' ? SOURCES.sewer : SOURCES.water
  const data = await getJSON(`${url}/query`, {
    geometry: `${w},${s},${e},${n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects',
    outFields: which === 'sewer' ? 'NOMINALSIZ' : '*',
    returnGeometry: true,
    outSR: 4326,
    resultRecordCount: 2000,
    f: 'json',
  })
  return {
    type: 'FeatureCollection',
    features: (data.features || []).map((f) => ({ type: 'Feature', properties: {}, geometry: esriToGeo(f.geometry) })),
  }
}
