import * as turf from '@turf/turf'

// Built by `npm run data:charlotte-water` from Charlotte Water's comments in rezoning staff analyses.
const DATA_URL = '/data/charlotte-water.json'
const SEARCH_MI = 0.75
const FT_PER_DEG_LAT = 364000 // feet per degree of latitude (close enough at this scale)

let loading = null
export function loadCharlotteWater() {
  if (!loading) {
    loading = fetch(DATA_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.records) return null
        const records = d.records
          .filter((r) => r.geometry)
          .map((r) => ({ ...r, bbox: turf.bbox(r.geometry), paths: toPaths(r.geometry) }))
        return { generated: d.generated, since: d.since, records }
      })
      .catch(() => null)
  }
  return loading
}

// Every geometry becomes a list of coordinate paths (polygons contribute their rings).
function toPaths(g) {
  switch (g.type) {
    case 'LineString': return [g.coordinates]
    case 'MultiLineString': return g.coordinates
    case 'Polygon': return g.coordinates
    case 'MultiPolygon': return g.coordinates.flat()
    default: return []
  }
}

/** Line features for the map, split by kind. */
export async function charlotteWaterLines() {
  const d = await loadCharlotteWater()
  const pick = (kind) => turf.featureCollection(
    (d?.records || []).filter((r) => r.kind === kind && r.geometry.type.includes('Line')).map((r) => turf.feature(r.geometry, { petition: r.petition, sizeIn: r.sizeIn })),
  )
  return { water: pick('water'), sewer: pick('sewer') }
}

/* ---------- fast local geometry (flat projection around the parcel, in feet) ---------- */

function projector(lat0) {
  const kx = FT_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180)
  return ([lng, lat]) => [lng * kx, lat * FT_PER_DEG_LAT]
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1]
  return Math.sqrt(x * x + y * y)
}

function segsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b)
}

function inRing(pt, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Minimum distance in feet between the parcel rings and a set of paths (0 if they touch or overlap). */
function minDistance(parcelRings, paths) {
  let best = Infinity
  for (const path of paths) {
    // a path point inside the parcel means the main runs through it
    if (path.length && parcelRings.some((r) => inRing(path[0], r))) return 0
    // a closed ring (a parcel or site outline) that contains the parcel
    const closed = path.length > 3 && path[0][0] === path[path.length - 1][0] && path[0][1] === path[path.length - 1][1]
    if (closed && inRing(parcelRings[0][0], path)) return 0
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i]
      for (const ring of parcelRings) {
        for (let j = 1; j < ring.length; j++) {
          const c = ring[j - 1], d = ring[j]
          if (segsCross(a, b, c, d)) return 0
          best = Math.min(best, segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b))
        }
      }
    }
  }
  return best
}

const overlaps = (b, box) => !(b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3])

/**
 * Nearest reported main of a kind ('water' | 'sewer') to the parcel, plus any nearby
 * "service not available" reports. Returns { loaded:false } when the data file is missing.
 */
export async function charlotteWaterNear(parcel, kind) {
  const d = await loadCharlotteWater()
  if (!d) return { loaded: false }

  const [w, s, e, n] = turf.bbox(parcel)
  const lat0 = (s + n) / 2
  const padLat = (SEARCH_MI * 5280) / FT_PER_DEG_LAT
  const padLng = padLat / Math.cos((lat0 * Math.PI) / 180)
  const box = [w - padLng, s - padLat, e + padLng, n + padLat]

  const proj = projector(lat0)
  const parcelRings = toPaths(parcel.geometry).map((r) => r.map(proj))

  let best = null
  let noService = null
  for (const r of d.records) {
    if ((r.kind !== kind && r.kind !== `no-${kind}`) || !overlaps(r.bbox, box)) continue
    const dist = minDistance(parcelRings, r.paths.map((p) => p.map(proj)))
    if (r.kind === kind) {
      if (!best || dist < best.distanceFt || (dist === best.distanceFt && (r.sizeIn || 0) > (best.sizeIn || 0))) best = { ...r, distanceFt: dist }
    } else if (dist < 1320 && (!noService || dist < noService.distanceFt)) {
      noService = { ...r, distanceFt: dist }
    }
  }
  return { loaded: true, generated: d.generated, since: d.since, best, noService, searchMi: SEARCH_MI }
}
