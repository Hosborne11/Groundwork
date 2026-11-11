import * as turf from '@turf/turf'

/*
 * Handles for direct editing in the site plan editor.
 * Shapes are lists of [lng, lat] points (rings without the repeated closing point).
 */

const turnDeg = (a, b, c) => {
  const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]]
  const t1 = Math.atan2(v1[1], v1[0]), t2 = Math.atan2(v2[1], v2[0])
  let d = Math.abs(t2 - t1) * (180 / Math.PI)
  return d > 180 ? 360 - d : d
}

/**
 * Which points get handles, and how a drag spreads.
 *  - few points (a drawn park, a parcel corner list): every point, moving only itself
 *  - many points (a smooth pond or street): evenly spaced handles, with the drag spread over
 *    nearby points so the shape stays smooth
 */
export function handlesFor(pts, { ring = false, corners = false, max = 10 } = {}) {
  const n = pts.length
  if (n < 2) return { idx: [], radius: 0 }
  if (corners) {
    // real corners only: points where the outline turns noticeably
    const idx = []
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n]
      if (turnDeg(a, pts[i], c) > 12) idx.push(i)
    }
    return { idx: idx.length > 40 ? idx.filter((_, k) => k % Math.ceil(idx.length / 40) === 0) : idx, radius: 0 }
  }
  if (n <= max + 2) return { idx: pts.map((_, i) => i), radius: 0 }
  const count = ring ? max : max - 1
  const idx = []
  for (let k = 0; k < count; k++) idx.push(Math.round((k * (ring ? n : n - 1)) / count))
  if (!ring) idx.push(n - 1)
  return { idx: [...new Set(idx)], radius: Math.max(2, Math.round(n / (ring ? max : max - 1))) }
}

/** Move point k by d, spreading the move over points within `radius` (a smooth falloff). */
export function softDrag(pts, k, d, radius, ring = false) {
  const n = pts.length
  return pts.map((p, j) => {
    let dist = Math.abs(j - k)
    if (ring) dist = Math.min(dist, n - dist)
    const w = radius === 0 ? (j === k ? 1 : 0) : dist >= radius ? 0 : 0.5 * (1 + Math.cos((Math.PI * dist) / radius))
    return w ? [p[0] + d[0] * w, p[1] + d[1] * w] : p
  })
}

/** Pixel distance from a point to a segment (screen coordinates). */
export function pxToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Distance in feet along a street line to the point nearest `ll`. */
export const feetAlong = (line, ll) => turf.nearestPointOnLine(turf.lineString(line), turf.point(ll), { units: 'feet' }).properties.location

export const ringOf = (geom) => {
  const r = (geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0])
  return r.slice(0, -1)
}
export const polygonOf = (ring) => ({ type: 'Polygon', coordinates: [[...ring, ring[0]]] })