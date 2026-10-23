import * as turf from '@turf/turf'
import { N1 } from '../data/charlotteUdo'

/*
 * Automatic neighborhood draft for a parcel.
 *
 * Steps (all geometry in a flat local frame measured in feet, rotated so the parcel's
 * long side runs along x):
 *   1. Usable land = parcel minus floodplain. A stormwater pond goes at the far end
 *      from the entrance.
 *   2. Streets: parallel curved streets, a connector near the entrance, an entrance
 *      road from the nearest existing street, loops joining pairs of streets at the far
 *      end, and cul-de-sacs on any street left with a dead end.
 *   3. Lots: the lot engine walks each street and places lots on both sides at the
 *      chosen sizes (a lot mix), plus pie-shaped lots around cul-de-sacs. Every lot is
 *      clipped to buildable land and must meet the minimum area.
 *   4. Leftover pieces of half an acre or more become green space.
 *
 * A concept for gauging yield and layout, not an engineered plan.
 */

export const ROW_FT = 50
const BULB_R = 45 // cul-de-sac radius at the curb line, roughly
const FT_PER_DEG_LAT = 364000
export const LOT_COLORS = ['#F2C14E', '#E8833A', '#3BB98F']

/* ---------------- planar helpers (feet) ---------------- */
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const mul = (a, k) => [a[0] * k, a[1] * k]
const len = (a) => Math.hypot(a[0], a[1])
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l] }
const perp = (a) => [-a[1], a[0]]
function segDist(p, a, b) {
  const ab = sub(b, a), l2 = ab[0] * ab[0] + ab[1] * ab[1]
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0
  return len(sub(p, add(a, mul(ab, t))))
}

const mapGeom = (geom, fn) => {
  const ring = (r) => r.map(fn)
  switch (geom.type) {
    case 'Polygon': return { type: 'Polygon', coordinates: geom.coordinates.map(ring) }
    case 'MultiPolygon': return { type: 'MultiPolygon', coordinates: geom.coordinates.map((p) => p.map(ring)) }
    case 'LineString': return { type: 'LineString', coordinates: geom.coordinates.map(fn) }
    case 'MultiLineString': return { type: 'MultiLineString', coordinates: geom.coordinates.map(ring) }
    case 'Point': return { type: 'Point', coordinates: fn(geom.coordinates) }
    default: return geom
  }
}
const poly = (ring) => turf.polygon([[...ring, ring[0]]])
const clip = (a, b) => { try { return turf.intersect(turf.featureCollection([a, b])) } catch { return null } }
const minus = (a, ...bs) => { try { return bs.length ? turf.difference(turf.featureCollection([a, ...bs])) : a } catch { return a } }
const unionAll = (fs) => { try { return fs.length > 1 ? turf.union(turf.featureCollection(fs)) : fs[0] || null } catch { return fs[0] || null } }

function areaFt(geom) {
  if (!geom) return 0
  const ringArea = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(s) / 2 }
  const p = (c) => ringArea(c[0]) - c.slice(1).reduce((t, h) => t + ringArea(h), 0)
  if (geom.type === 'Polygon') return p(geom.coordinates)
  if (geom.type === 'MultiPolygon') return geom.coordinates.reduce((t, c) => t + p(c), 0)
  return 0
}
const bboxOf = (f) => turf.bbox(f)
const boxesTouch = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3])

/** Points where a horizontal line y crosses the polygon; returns the longest inside span [xa, xb]. */
function spanAtY(f, y) {
  const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat()
  const xs = []
  for (const r of rings) {
    for (let i = 1; i < r.length; i++) {
      const [x0, y0] = r[i - 1], [x1, y1] = r[i]
      if ((y0 > y) !== (y1 > y)) xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0))
    }
  }
  xs.sort((a, b) => a - b)
  let best = null
  for (let i = 0; i + 1 < xs.length; i += 2) if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]]
  return best
}

/** Densify a polyline and give helpers to walk it by distance. */
function path(points) {
  const pts = []
  for (let i = 0; i < points.length; i++) {
    if (i === 0) { pts.push(points[0]); continue }
    const a = points[i - 1], b = points[i], n = Math.max(1, Math.ceil(len(sub(b, a)) / 20))
    for (let k = 1; k <= n; k++) pts.push(add(a, mul(sub(b, a), k / n)))
  }
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])))
  const total = cum[cum.length - 1]
  const at = (d) => {
    d = Math.max(0, Math.min(total, d))
    let i = 1
    while (i < cum.length - 1 && cum[i] < d) i++
    const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1)
    return add(pts[i - 1], mul(sub(pts[i], pts[i - 1]), t))
  }
  const dir = (d) => norm(sub(at(Math.min(total, d + 10)), at(Math.max(0, d - 10))))
  return { pts, total, at, dir }
}

/**
 * Street right-of-way as one polygon: offset the centerline both ways and join.
 * Works for the gentle curves we draw; much faster than merging many small pieces.
 */
function rowPolygon(points, width = ROW_FT) {
  if (points.length < 2) return null
  const h = width / 2, L = [], Rr = []
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)]
    const n = mul(perp(norm(sub(b, a))), h)
    L.push(add(points[i], n)); Rr.push(sub(points[i], n))
  }
  try { return poly([...L, ...Rr.reverse()]) } catch { return null }
}
const circle = (c, r, n = 32) => poly(Array.from({ length: n }, (_, i) => { const t = (2 * Math.PI * i) / n; return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)] }))

/** Walk a street placing lots on one side; a lot just under the minimum is retried a bit wider. */
function fillAlong(p, sgn, type, accept, startAt = 0) {
  const h = ROW_FT / 2
  const quad = (t, w) => {
    const t1 = Math.min(p.total, t + w)
    const a0 = p.at(t), a1 = p.at(t1)
    const n0 = mul(perp(p.dir(t)), sgn), n1 = mul(perp(p.dir(t1)), sgn)
    return [add(a0, mul(n0, h)), add(a1, mul(n1, h)), add(a1, mul(n1, h + type.depth)), add(a0, mul(n0, h + type.depth))]
  }
  let t = startAt
  while (t + type.width * 0.6 <= p.total) {
    const res = accept(quad(t, type.width), type)
    if (typeof res === 'number') {
      const w2 = Math.ceil(type.width * Math.min(1.25, (accept.minLot / res) * 1.03)) // just wide enough to clear the minimum
      if (t + w2 * 0.6 <= p.total && accept(quad(t, w2), type) === true) { t += w2; continue }
    }
    t += type.width
  }
}

/* ---------------- the draft ---------------- */

/**
 * @param parcel   GeoJSON polygon (lon/lat)
 * @param opts {
 *   code: N1 district, mode: 'standard'|'conservation'|'bonus',
 *   mix: [{ width, depth, share }] up to 3 lot types (share in %),
 *   reservePct: stormwater pond size as % of usable land,
 *   floodPolys: floodplain polygons (lon/lat), streets: nearby street lines (lon/lat),
 *   variant: which orientation to use (0 = best found, 1+ = alternates)
 * }
 */
export function neighborhoodDraft(parcel, opts) {
  const base = N1[opts.code]
  if (!base) return { error: 'Site plans are available for Charlotte Neighborhood 1 districts for now.' }
  const std = opts.mode === 'bonus' && base.bonusTo ? N1[base.bonusTo] : base
  const conservation = opts.mode === 'conservation'
  const minLotSf = conservation ? base.minLotSf * 0.5 : std.minLotSf

  // local frame
  const [lng0, lat0] = turf.centroid(parcel).geometry.coordinates
  const kx = FT_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180)
  const toFt = ([lng, lat]) => [(lng - lng0) * kx, (lat - lat0) * FT_PER_DEG_LAT]
  const toLL = ([x, y]) => [x / kx + lng0, y / FT_PER_DEG_LAT + lat0]

  const parcelFt = turf.feature(mapGeom(parcel.geometry, toFt))
  const grossSf = areaFt(parcelFt.geometry)
  if (grossSf > 250 * 43560) return { error: 'This parcel is over 250 acres; drafts are limited to smaller sites for now.' }
  if (grossSf < 2 * 43560) return { error: 'Neighborhood drafts need at least 2 acres. Use the lot split estimate above for smaller parcels.' }

  const floodFt = (opts.floodPolys || []).map((f) => turf.feature(mapGeom(f.geometry, toFt)))
  const floodIn = floodFt.map((f) => clip(f, parcelFt)).filter(Boolean)
  const floodSf = floodIn.reduce((t, f) => t + areaFt(f.geometry), 0)
  let usable = floodFt.length ? minus(parcelFt, ...floodFt) : parcelFt
  if (!usable || areaFt(usable.geometry) < 1.5 * 43560) {
    return { error: `About ${Math.round((floodSf / grossSf) * 100)}% of this parcel is floodplain, which leaves too little buildable land for a neighborhood.` }
  }
  // keep the largest buildable piece for streets (small islands can't be reached)
  if (usable.geometry.type === 'MultiPolygon') {
    const pieces = usable.geometry.coordinates.map((c) => turf.polygon(c)).sort((a, b) => areaFt(b.geometry) - areaFt(a.geometry))
    usable = pieces[0]
  }
  const usableSf = areaFt(usable.geometry)

  // lot mix = frontage widths with shares; depth is fitted to the site later
  const minWidth = conservation ? 40 : std.minWidthFt
  const mix = (opts.mix?.length ? opts.mix : [{ width: std.minWidthFt, share: 100 }])
    .map((t, i) => ({ i, share: t.share, width: Math.max(t.width, minWidth) }))
  const maxLots = conservation ? Math.floor(grossSf / base.minLotSf) : Infinity
  const D_MIN = 100, D_MAX = 220

  // existing streets for the entrance
  const streetsFt = (opts.streets || []).flatMap((s) => (s.geometry.type === 'LineString' ? [s.geometry.coordinates] : s.geometry.coordinates)).map((l) => l.map(toFt))

  // candidate orientations: the parcel's long edges
  const ring = usable.geometry.coordinates[0]
  const edges = []
  for (let i = 1; i < ring.length; i++) edges.push({ l: len(sub(ring[i], ring[i - 1])), a: Math.atan2(ring[i][1] - ring[i - 1][1], ring[i][0] - ring[i - 1][0]) })
  const angles = [...new Set(edges.sort((a, b) => b.l - a.l).slice(0, 3).flatMap((e) => [e.a, e.a + Math.PI / 2]).map((a) => Math.round(a * 100) / 100))].slice(0, 4)

  let results = [] // alternate layouts (none in editor mode)
  // Editor mode: fill lots along a street network the user has shaped.
  if (opts.network) {
    const r = layoutFromNetwork(opts.network, opts.removed || [])
    return r ? finish(r) : { error: 'No lots fit along these streets. Try adding a street through the open land.' }
  }

  results = angles.map((ang) => layoutAt(ang)).filter((r) => r && !r.error).sort((a, b) => b.lotCount - a.lotCount)
  if (!results.length) return { error: 'No layout fit. The parcel may be too narrow for a street with lots on both sides; try smaller lots.' }
  let pick
  if (opts.infill === false) pick = results[Math.min(opts.variant || 0, results.length - 1)]
  else if (!opts.variant) {
    // a layout that's weaker alone can win once leftover pieces are filled, so compare the top two
    const finals = results.slice(0, 2).map((r) => r.redo?.() || r)
    pick = finals.sort((a, b) => b.lotCount - a.lotCount)[0]
  } else {
    const chosen = results[Math.min(opts.variant, results.length - 1)]
    pick = chosen.redo?.() || chosen
  }
  return finish(pick)

  /* ---------- one orientation: try 1 or 2 street counts, keep the better ---------- */
  function layoutAt(ang) {
    const R = (f) => turf.feature(mapGeom(f.geometry, (p) => rot(p, -ang)))
    const U = R(usable)
    const [minX, minY, maxX, maxY] = bboxOf(U)
    const H = maxY - minY
    // street counts whose fitted lot depth lands in a sensible range
    const ns = []
    for (let n = 1; n <= 12; n++) {
      const d = (H - n * ROW_FT) / (2 * n)
      if (d < D_MIN) break
      if (d <= D_MAX * 1.6) ns.push({ n, d: Math.min(d, D_MAX) })
    }
    if (!ns.length) ns.push({ n: 1, d: Math.max(D_MIN, Math.min(D_MAX, (H - ROW_FT) / 2)) })
    let best = null
    for (const c of ns.slice(-2)) {
      const r = layoutN(ang, U, minX, minY, maxX, maxY, c.n, c.d, false)
      if (r && (!best || r.lotCount > best.lotCount)) best = { ...r, redo: () => layoutN(ang, U, minX, minY, maxX, maxY, c.n, c.d, true) }
    }
    return best
  }

  function layoutN(ang, U, minX, minY, maxX, maxY, nTarget, depth, infill) {
    const H = maxY - minY, W = maxX - minX
    // lots widen when needed so width x depth still meets the minimum area
    const types = mix.map((t) => ({ ...t, width: Math.max(t.width, Math.ceil(minLotSf / depth)), depth }))

    // entrance: edge point nearest an existing street, preferring the middle of that side
    const ur = U.geometry.coordinates[0]
    const edgePts = []
    for (let i = 1; i < ur.length; i++) for (let k = 0; k < 12; k++) edgePts.push(add(ur[i - 1], mul(sub(ur[i], ur[i - 1]), k / 12)))
    let entry = null, bestScore = Infinity
    for (const line of streetsFt) {
      const Lr = line.map((p) => rot(p, -ang))
      for (const e of edgePts) {
        let d = Infinity
        for (let j = 1; j < Lr.length; j++) d = Math.min(d, segDist(e, Lr[j - 1], Lr[j]))
        if (d > 400) continue
        const score = d + 0.25 * Math.abs(e[1] - (minY + maxY) / 2) + 0.25 * Math.min(Math.abs(e[0] - minX), Math.abs(e[0] - maxX)) * 0
        if (score < bestScore) { bestScore = score; entry = e }
      }
    }
    if (!entry) entry = [minX, (minY + maxY) / 2]
    const entryWest = entry[0] < (minX + maxX) / 2

    // stormwater pond at the far end from the entrance, sized by the set-aside
    let pond = null
    const pondSf = (opts.reservePct / 100) * usableSf
    if (pondSf > 2000) {
      const r = Math.sqrt(pondSf / Math.PI)
      const cy = (minY + maxY) / 2
      const span = spanAtY(U, cy)
      if (span) {
        const cx = entryWest ? span[1] - r * 1.45 : span[0] + r * 1.45
        pond = clip(poly(Array.from({ length: 40 }, (_, i) => { const t = (2 * Math.PI * i) / 40; return [cx + r * 1.35 * Math.cos(t), cy + (r / 1.35) * Math.sin(t)] })), U)
      }
    }
    const B = pond ? minus(U, pond) : U
    if (!B) return null

    // parallel streets, all following the same gentle curve so spacing holds
    const block = 2 * depth + ROW_FT
    const y0 = minY + (H - nTarget * block) / 2
    const amp = Math.min(depth * 0.25, W * 0.04)
    const curve = (x) => amp * Math.sin(((x - minX) / Math.max(W, 1)) * Math.PI * 1.5)
    const mains = []
    for (let i = 0; i < nTarget; i++) {
      const yc = y0 + depth + ROW_FT / 2 + i * block
      const span = spanAtY(B, yc)
      if (!span) continue
      const xa = span[0] + ROW_FT / 2, xb = span[1] - ROW_FT / 2
      if (xb - xa < 3 * types[0].width) continue
      mains.push({ yc, xa, xb })
    }
    if (!mains.length) return null
    const line = (yc, xa, xb) => { const pts = []; for (let x = xa; x < xb; x += 50) pts.push([x, yc + curve(x)]); pts.push([xb, yc + curve(xb)]); return pts }

    const streets = []
    // connector on the entrance side ties the streets together
    let connX = null
    if (mains.length > 1) {
      connX = entryWest ? Math.max(...mains.map((m) => m.xa)) : Math.min(...mains.map((m) => m.xb))
      for (const m of mains) { if (entryWest) m.xa = connX; else m.xb = connX }
    }
    // far ends: join pairs into loops; an unpaired street ends in a cul-de-sac
    const bulbs = []
    for (let i = 0; i < mains.length; i += 2) {
      const a = mains[i], b = mains[i + 1]
      const fxLoop = b ? (entryWest ? Math.min(a.xb, b.xb) : Math.max(a.xa, b.xa)) : null
      const loopPts = b ? [[fxLoop, a.yc + curve(fxLoop)], [fxLoop, b.yc + curve(fxLoop)]] : null
      // a loop that would cross the pond becomes two cul-de-sacs instead
      const loopHitsPond = b && pond && (() => { const o = clip(rowPolygon(loopPts), pond); return o && areaFt(o.geometry) > 50 })()
      if (b && !loopHitsPond) {
        for (const m of [a, b]) { if (entryWest) m.xb = fxLoop; else m.xa = fxLoop }
        streets.push({ kind: 'loop', pts: loopPts })
      } else if (b) {
        for (const m of [a, b]) {
          const endX = entryWest ? m.xb - BULB_R : m.xa + BULB_R
          if (entryWest) m.xb = endX; else m.xa = endX
          bulbs.push({ c: [endX, m.yc + curve(endX)], dir: entryWest ? [1, 0] : [-1, 0] })
        }
      } else {
        const endX = entryWest ? a.xb : a.xa
        bulbs.push({ c: [endX, a.yc + curve(endX)], dir: entryWest ? [1, 0] : [-1, 0] })
      }
    }
    for (const m of mains) streets.push({ kind: 'main', pts: line(m.yc, m.xa, m.xb) })
    if (connX != null) streets.push({ kind: 'connector', pts: mains.map((m) => [connX, m.yc + curve(connX)]) })
    // entrance road to the nearest point on the network
    const entryTargets = streets.flatMap((s) => s.pts)
    const tgt = entryTargets.reduce((b, p) => (len(sub(p, entry)) < len(sub(b, entry)) ? p : b), entryTargets[0])
    if (len(sub(tgt, entry)) > 15) streets.push({ kind: 'entrance', pts: [entry, tgt] })

    // right-of-way pieces (kept separate for fast clipping)
    const rows = streets.map((s) => rowPolygon(s.pts)).filter(Boolean)
    for (const b of bulbs) rows.push(pond ? (minus(circle(b.c, BULB_R + 5, 24), pond) || circle(b.c, BULB_R + 5, 24)) : circle(b.c, BULB_R + 5, 24))
    const rowBoxes = rows.map(bboxOf)

    // ---- lot engine ----
    const lots = []
    const accept = (ring, type) => {
      if (lots.length >= maxLots) return
      // the strip behind the lot (up to 60% of its depth), for absorbing edge slivers later
      const [f0, f1, b1, b0] = ring
      const ext = (() => {
        const d0 = norm(sub(b0, f0)), d1 = norm(sub(b1, f1)), e = 0.6 * len(sub(b0, f0))
        try { return poly([b0, b1, add(b1, mul(d1, e)), add(b0, mul(d0, e))]) } catch { return null }
      })()
      let piece = clip(poly(ring), B)
      if (!piece) return
      let bb = bboxOf(piece)
      for (let k = 0; k < rows.length; k++) {
        if (!boxesTouch(bb, rowBoxes[k])) continue
        const o = clip(piece, rows[k])
        if (o && areaFt(o.geometry) > 1) { piece = minus(piece, rows[k]); if (!piece) return; bb = bboxOf(piece) }
      }
      // keep the largest piece if a street cut the lot in two
      if (piece.geometry.type === 'MultiPolygon') piece = piece.geometry.coordinates.map((c) => turf.polygon(c)).sort((x, y) => areaFt(y.geometry) - areaFt(x.geometry))[0]
      const a = areaFt(piece.geometry)
      if (a < minLotSf || a < 0.6 * type.width * type.depth) return a >= 0.8 * minLotSf ? a : false
      bb = bboxOf(piece)
      for (const l of lots) {
        if (!boxesTouch(bb, l.bb)) continue
        const o = clip(piece, l.f)
        if (o && areaFt(o.geometry) > 0.03 * a) return
      }
      lots.push({ f: piece, bb, type: type.i, sf: a, ext })
      return true
    }

    // which lot type goes on each street side: larger lots on the outer sides
    const sides = []
    streets.forEach((st, si) => {
      if (st.kind === 'entrance') return
      for (const sgn of [-1, 1]) sides.push({ st, sgn, outer: st.kind === 'main' && ((si === 0 && sgn === -1) || sgn === 1), L: path(st.pts).total })
    })
    sides.sort((x, y) => (y.outer - x.outer) || (y.L - x.L))
    const order = [...types].sort((x, y) => y.width - x.width)
    const totalL = sides.reduce((t, x) => t + x.L, 0) || 1
    let acc = 0
    for (const sd of sides) {
      const mid = ((acc + sd.L / 2) / totalL) * 100
      let c = 0
      sd.type = order[order.length - 1]
      for (const t of order) { c += t.share; if (mid <= c) { sd.type = t; break } }
      acc += sd.L
    }
    // mains first so their lots claim space before the connector and loops
    sides.sort((x, y) => (x.st.kind === 'main' ? 0 : 1) - (y.st.kind === 'main' ? 0 : 1))
    accept.minLot = minLotSf
    for (const sd of sides) fillAlong(path(sd.st.pts), sd.sgn, sd.type, accept)
    // pie-shaped lots around each cul-de-sac (the half facing away from the street)
    for (const bl of bulbs) {
      const type = order[0]
      const r0 = BULB_R + 5, r1 = r0 + type.depth
      const baseAng = Math.atan2(bl.dir[1], bl.dir[0])
      const k = Math.max(3, Math.round((Math.PI * (r0 + type.depth * 0.5)) / type.width))
      const pt = (r, t) => [bl.c[0] + r * Math.cos(t), bl.c[1] + r * Math.sin(t)]
      for (let j = 0; j < k; j++) {
        const t0 = baseAng - Math.PI / 2 + (Math.PI * j) / k, t1 = baseAng - Math.PI / 2 + (Math.PI * (j + 1)) / k
        accept([pt(r0, t0), pt(r0, t1), pt(r1, t1), pt(r1, t0)], type)
      }
    }
    if (!lots.length) return null

    const smallest = [...types].sort((x, y) => x.width - y.width)[0] // smallest lots fill odd pieces best
    const netPts = streets.flatMap((st) => path(st.pts).pts)
    // ---- infill helpers ----
    const spurTypeFor = (base, halfWidth) => {
      const d = Math.max(D_MIN, Math.min(base.depth, halfWidth - ROW_FT / 2))
      return { ...base, depth: d, width: Math.max(base.width, Math.ceil(minLotSf / d)) }
    }
    const nearestNet = (q, pts) => pts.reduce((b, p) => (len(sub(p, q)) < len(sub(b, q)) ? p : b), pts[0])
    // spur down the piece's long axis, linked to the nearest street
    function axisSpec(pc) {
      const ring = pc.geometry.coordinates[0]
      const c = ring.reduce((acc, q) => add(acc, q), [0, 0]).map((v) => v / ring.length)
      let sxx = 0, syy = 0, sxy = 0
      for (const q of ring) { const d = sub(q, c); sxx += d[0] * d[0]; syy += d[1] * d[1]; sxy += d[0] * d[1] }
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy)
      const axis = [Math.cos(th), Math.sin(th)], across = perp(axis)
      const proj = ring.map((q) => [(q[0] - c[0]) * axis[0] + (q[1] - c[1]) * axis[1], (q[0] - c[0]) * across[0] + (q[1] - c[1]) * across[1]])
      const tMin = Math.min(...proj.map((q) => q[0])), tMax = Math.max(...proj.map((q) => q[0]))
      const half = (Math.max(...proj.map((q) => q[1])) - Math.min(...proj.map((q) => q[1]))) / 2
      let pA = add(c, mul(axis, tMin)), pB = add(c, mul(axis, tMax))
      const dNet = (q) => len(sub(nearestNet(q, netPts), q))
      if (dNet(pB) < dNet(pA)) [pA, pB] = [pB, pA]
      const dir = norm(sub(pB, pA))
      const end = sub(pB, mul(dir, BULB_R + 25)), startIn = add(pA, mul(dir, ROW_FT))
      const T = spurTypeFor(smallest, half)
      if (len(sub(end, startIn)) < 2 * T.width) return null
      const link = nearestNet(startIn, netPts)
      return { pts: len(sub(link, startIn)) > 10 ? [link, startIn, end] : [startIn, end], lotFrom: startIn, end, dir, T }
    }
    // straight spur from the nearest street toward the piece's center
    function raySpec(pc) {
      const center = turf.pointOnFeature(pc).geometry.coordinates
      const start = nearestNet(center, netPts)
      const dir = norm(sub(center, start))
      let lastInside = null
      for (let t = 0; t < 3000; t += 20) {
        const q = add(start, mul(dir, t))
        if (turf.booleanPointInPolygon(q, pc)) lastInside = q
        else if (lastInside) break
      }
      if (!lastInside) return null
      const end = sub(lastInside, mul(dir, BULB_R + 15))
      const T = smallest
      if (len(sub(end, start)) < 2 * T.width + BULB_R) return null
      return { pts: [start, end], lotFrom: add(start, mul(dir, ROW_FT)), end, dir, T }
    }
    // Place a spur. With dryRun it reports the lot gain and undoes everything.
    function trySpur(sp, dryRun) {
      const spurRow = rowPolygon(sp.pts), bulbRow = circle(sp.end, BULB_R + 5, 24)
      if (!spurRow) return 0
      const snapshot = lots.slice()
      // lots the new street crosses: drop them, or trim them if only nicked and still big enough
      const keep = []
      for (const l of lots) {
        let f = l.f, cut = false
        for (const r of [spurRow, bulbRow]) {
          const o = clip(f, r)
          if (o && areaFt(o.geometry) > 1) { f = minus(f, r); cut = true; if (!f) break }
        }
        if (!cut) { keep.push(l); continue }
        if (!f || f.geometry.type !== 'Polygon') continue
        const a = areaFt(f.geometry)
        if (a >= minLotSf) keep.push({ ...l, f, sf: a, bb: bboxOf(f) })
      }
      lots.length = 0; lots.push(...keep)
      rows.push(spurRow, bulbRow); rowBoxes.push(bboxOf(spurRow), bboxOf(bulbRow))
      const T = sp.T, p = path([sp.lotFrom, sp.end])
      for (const sgn of [-1, 1]) {
        for (let t = 0; t + T.width * 0.6 <= p.total; t += T.width) {
          const t1 = Math.min(p.total, t + T.width)
          const a0 = p.at(t), a1 = p.at(t1)
          const n0 = mul(perp(p.dir(t)), sgn), n1 = mul(perp(p.dir(t1)), sgn), h = ROW_FT / 2
          accept([add(a0, mul(n0, h)), add(a1, mul(n1, h)), add(a1, mul(n1, h + T.depth)), add(a0, mul(n0, h + T.depth))], T)
        }
      }
      const r0 = BULB_R + 5, r1 = r0 + T.depth, baseAng = Math.atan2(sp.dir[1], sp.dir[0])
      const k = Math.max(3, Math.round((Math.PI * (r0 + T.depth * 0.5)) / T.width))
      const pt = (r, t) => [sp.end[0] + r * Math.cos(t), sp.end[1] + r * Math.sin(t)]
      for (let j = 0; j < k; j++) {
        const t0 = baseAng - Math.PI / 2 + (Math.PI * j) / k, t1 = baseAng - Math.PI / 2 + (Math.PI * (j + 1)) / k
        accept([pt(r0, t0), pt(r0, t1), pt(r1, t1), pt(r1, t0)], T)
      }
      const gain = lots.length - snapshot.length
      if (dryRun || gain <= 0) {
        lots.length = 0; lots.push(...snapshot)
        rows.splice(rows.length - 2, 2); rowBoxes.splice(rowBoxes.length - 2, 2)
      } else {
        streets.push({ kind: 'spur', pts: sp.pts })
        bulbs.push({ c: sp.end, dir: sp.dir })
        netPts.push(...path(sp.pts).pts)
      }
      return gain
    }

    // ---- infill pass: short cul-de-sac streets into leftover pieces ----
    let spurs = 0
    if (infill) {
      const MIN_PIECE = 1.5 * 43560
      for (let pass = 0; pass < 6; pass++) {
        const left = minus(B, ...rows, ...lots.map((l) => l.f))
        if (!left) break
        const pieces = (left.geometry.type === 'Polygon' ? [left.geometry.coordinates] : left.geometry.coordinates)
          .map((c) => turf.polygon(c)).filter((pc) => areaFt(pc.geometry) >= MIN_PIECE)
          .sort((x, y) => areaFt(y.geometry) - areaFt(x.geometry))
        let added = false
        for (const pc of pieces.slice(0, 3)) {
          // Two ways to reach into a piece; try both and keep whichever adds more lots.
          const specs = [axisSpec(pc), raySpec(pc)].filter(Boolean)
          let bestSpec = null, bestGain = 0
          for (const sp of specs) {
            const g = trySpur(sp, true)
            if (g > bestGain) { bestGain = g; bestSpec = sp }
          }
          if (bestSpec) {
            trySpur(bestSpec, false)
            spurs++
            added = true
            break // recompute leftover pieces with the new street in place
          }
        }
        if (!added) break
      }
    }
    return { ang, U, B, pond, rows, lots, streets, bulbs, types, depth, spurs, lotCount: lots.length }
  }

  /* ---------- editor: lots along a given street network (no rotation) ---------- */
  function layoutFromNetwork(network, removedLL) {
    const ang = 0
    const U = usable
    const pond = network.pond ? clip(turf.feature(mapGeom(network.pond, toFt)), U) : null
    const B = pond ? minus(U, pond) : U
    if (!B) return null
    const depth = Math.max(D_MIN, Math.min(D_MAX, network.depth || 140))
    const types = mix.map((t) => ({ ...t, width: Math.max(t.width, Math.ceil(minLotSf / depth)), depth }))
    const removed = removedLL.map(toFt)
    const streets = network.streets.filter((st) => st.pts.length >= 2).map((st) => ({ kind: st.kind, pts: st.pts.map(toFt) }))
    if (!streets.length) return null

    // dead ends get cul-de-sacs, unless they connect to another street or exit at the parcel edge
    const boundary = turf.polygonToLine(U)
    const edgeLines = (boundary.type === 'FeatureCollection' ? boundary.features : [boundary]).flatMap((f) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates))
    const distToLine = (q, line) => { let d = Infinity; for (let j = 1; j < line.length; j++) d = Math.min(d, segDist(q, line[j - 1], line[j])); return d }
    const bulbs = []
    streets.forEach((st, i) => {
      for (const atEnd of [false, true]) {
        const e = atEnd ? st.pts[st.pts.length - 1] : st.pts[0]
        const prev = atEnd ? st.pts[st.pts.length - 2] : st.pts[1]
        const joins = streets.some((o, j) => j !== i && distToLine(e, path(o.pts).pts) < 30)
        const atEdge = edgeLines.some((l) => distToLine(e, l) < 30) // a street that actually exits the parcel
        if (!joins && !atEdge) bulbs.push({ c: e, dir: norm(sub(e, prev)) })
      }
    })

    const rows = streets.map((st) => rowPolygon(st.pts)).filter(Boolean) // same street edges as the draft
    for (const b of bulbs) rows.push(pond ? (minus(circle(b.c, BULB_R + 5, 24), pond) || circle(b.c, BULB_R + 5, 24)) : circle(b.c, BULB_R + 5, 24))
    const rowBoxes = rows.map(bboxOf)

    const lots = []
    const accept = (ring, type) => {
      if (lots.length >= maxLots) return
      const [f0, f1, b1, b0] = ring
      const ext = (() => { const d0 = norm(sub(b0, f0)), d1 = norm(sub(b1, f1)), e = 0.6 * len(sub(b0, f0)); try { return poly([b0, b1, add(b1, mul(d1, e)), add(b0, mul(d0, e))]) } catch { return null } })()
      let piece = clip(poly(ring), B)
      if (!piece) return
      let bb = bboxOf(piece)
      for (let k = 0; k < rows.length; k++) {
        if (!boxesTouch(bb, rowBoxes[k])) continue
        const o = clip(piece, rows[k])
        if (o && areaFt(o.geometry) > 1) { piece = minus(piece, rows[k]); if (!piece) return; bb = bboxOf(piece) }
      }
      if (piece.geometry.type === 'MultiPolygon') piece = piece.geometry.coordinates.map((c) => turf.polygon(c)).sort((x, y) => areaFt(y.geometry) - areaFt(x.geometry))[0]
      const a = areaFt(piece.geometry)
      if (a < minLotSf || a < 0.6 * type.width * type.depth) return a >= 0.8 * minLotSf ? a : false
      // lots the user removed stay removed
      if (removed.some((q) => turf.booleanPointInPolygon(q, piece))) return
      bb = bboxOf(piece)
      for (const l of lots) {
        if (!boxesTouch(bb, l.bb)) continue
        const o = clip(piece, l.f)
        if (o && areaFt(o.geometry) > 0.03 * a) return
      }
      lots.push({ f: piece, bb, type: type.i, sf: a, ext })
      return true
    }

    // lot sizes by street side, larger lots on the longest streets
    const sides = []
    streets.forEach((st) => { if (st.kind === 'entrance') return; for (const sgn of [-1, 1]) sides.push({ st, sgn, L: path(st.pts).total }) })
    sides.sort((x, y) => y.L - x.L)
    // Through streets claim their lots first; short connectors and loops fill in after (same as the draft).
    const PRIORITY = { main: 0, user: 0, spur: 1, connector: 2, loop: 2 }
    const order = [...types].sort((x, y) => y.width - x.width)
    const totalL = sides.reduce((t, x) => t + x.L, 0) || 1
    let acc = 0
    for (const sd of sides) {
      const mid = ((acc + sd.L / 2) / totalL) * 100
      let c = 0
      sd.type = order[order.length - 1]
      for (const t of order) { c += t.share; if (mid <= c) { sd.type = t; break } }
      acc += sd.L
    }
    const fillOrder = [...sides].sort((x, y) => (PRIORITY[x.st.kind] ?? 1) - (PRIORITY[y.st.kind] ?? 1))
    accept.minLot = minLotSf
    for (const sd of fillOrder) fillAlong(path(sd.st.pts), sd.sgn, sd.type, accept)
    for (const bl of bulbs) {
      const type = order[order.length - 1]
      const r0 = BULB_R + 5, r1 = r0 + type.depth, baseAng = Math.atan2(bl.dir[1], bl.dir[0])
      const k = Math.max(3, Math.round((Math.PI * (r0 + type.depth * 0.5)) / type.width))
      const pt = (r, t) => [bl.c[0] + r * Math.cos(t), bl.c[1] + r * Math.sin(t)]
      for (let j = 0; j < k; j++) {
        const t0 = baseAng - Math.PI / 2 + (Math.PI * j) / k, t1 = baseAng - Math.PI / 2 + (Math.PI * (j + 1)) / k
        accept([pt(r0, t0), pt(r0, t1), pt(r1, t1), pt(r1, t0)], type)
      }
    }
    return { ang, U, B, pond, rows, lots, streets, bulbs, types, depth, spurs: 0, lotCount: lots.length, edited: true }
  }

  /* ---------- build the output for the chosen orientation ---------- */
  function finish(r) {
    const back = (g) => mapGeom(mapGeom(g, (p) => rot(p, r.ang)), toLL)
    // number lots in walking order (by position along x, then y)
    const lots = [...r.lots].sort((a, b) => (a.bb[0] - b.bb[0]) || (a.bb[1] - b.bb[1]))
    const features = []
    // floodplain (unbuildable)
    for (const f of floodIn) features.push(turf.feature(back(mapGeom(f.geometry, (p) => rot(p, -r.ang))), { kind: 'flood' }))
    // green space: leftover lot land not used by lots, kept when half an acre or more
    const roads = clip(unionAll(r.rows), r.U)

    // Slivers (under half an acre, or narrower than ~100 ft on average) join the lots behind them,
    // so backyards run to the property line instead of leaving odd strips.
    const perimeter = (g) => { const rg = g.coordinates[0]; let t = 0; for (let i = 1; i < rg.length; i++) t += len(sub(rg[i], rg[i - 1])); return t }
    const leftover = minus(r.B, ...(roads ? [roads] : []), ...lots.map((l) => l.f))
    let absorbedSf = 0
    if (leftover) {
      const parts = (leftover.geometry.type === 'Polygon' ? [leftover.geometry.coordinates] : leftover.geometry.coordinates).map((c) => turf.polygon(c))
      const slivers = parts.filter((pc) => { const a = areaFt(pc.geometry); return a < 0.5 * 43560 || (2 * a) / perimeter(pc.geometry) < 50 })
      let sliverLand = slivers.length ? unionAll(slivers) : null
      for (const l of lots) {
        if (!sliverLand || !l.ext) continue
        const take = clip(l.ext, sliverLand)
        if (!take) continue
        const ta = areaFt(take.geometry)
        if (ta < 300) continue
        const merged = unionAll([l.f, take])
        if (!merged || merged.geometry.type !== 'Polygon') continue // only if it joins the lot cleanly
        l.f = merged; l.sf += ta; absorbedSf += ta
        sliverLand = minus(sliverLand, take)
      }
    }

    let greenSf = 0
    const left = minus(r.B, ...(roads ? [roads] : []), ...lots.map((l) => l.f))
    if (left) {
      const pieces = left.geometry.type === 'Polygon' ? [left.geometry.coordinates] : left.geometry.coordinates
      for (const c of pieces) {
        const g = turf.polygon(c), a = areaFt(g.geometry)
        if (a >= 0.5 * 43560) { greenSf += a; features.push(turf.feature(back(g.geometry), { kind: 'green', label: `Green space ${(a / 43560).toFixed(2)} ac` })) }
      }
    }
    const pondSf = r.pond ? areaFt(r.pond.geometry) : 0
    if (r.pond) features.push(turf.feature(back(r.pond.geometry), { kind: 'pond', label: `Pond ${(pondSf / 43560).toFixed(2)} ac` }))
    if (roads) features.push(turf.feature(back(roads.geometry), { kind: 'road' }))
    lots.forEach((l, i) => features.push(turf.feature(back(l.f.geometry), { kind: 'lot', n: i + 1, type: l.type, sf: Math.round(l.sf), color: LOT_COLORS[l.type] })))
    // every shape carries its own fill color so the map style stays simple
    const FILL = { road: '#1C2A33', pond: '#3A8DDE', green: '#38A169', flood: '#5BB5D9' }
    for (const f of features) f.properties.fill = f.properties.kind === 'lot' ? f.properties.color : FILL[f.properties.kind] || '#FFFFFF'
    // labels (points)
    const labels = []
    for (const f of features) {
      if (f.properties.kind === 'lot') labels.push(turf.feature(turf.centroid(f).geometry, { label: String(f.properties.n), kind: 'lot-label' }))
      else if (f.properties.label) labels.push(turf.feature(turf.pointOnFeature(f).geometry, { label: f.properties.label, kind: 'area-label' }))
    }

    const roadSf = roads ? areaFt(roads.geometry) : 0
    const roadLenFt = r.streets.reduce((t, s) => t + path(s.pts).total, 0) + r.bulbs.length * 2 * Math.PI * BULB_R * 0.5
    const counts = r.types.map((t) => ({ ...t, depth: Math.round(r.depth), lots: lots.filter((l) => l.type === t.i).length, color: LOT_COLORS[t.i] }))
    const openSf = pondSf + greenSf + floodSf
    const minActual = Math.min(...lots.map((l) => l.sf))
    return {
      lots: lots.length,
      counts,
      totalAc: grossSf / 43560,
      netBuildableAc: (grossSf - floodSf) / 43560,
      unbuildableAc: floodSf / 43560,
      roadLenFt: Math.round(roadLenFt),
      roadAc: roadSf / 43560,
      pondAc: pondSf / 43560,
      greenAc: greenSf / 43560,
      openPct: (openSf / grossSf) * 100,
      density: lots.length / (grossSf / 43560),
      minLotSf,
      pass: minActual >= minLotSf - 1 && lots.length <= maxLots,
      capped: conservation && lots.length >= maxLots,
      district: opts.mode === 'bonus' && base.bonusTo ? base.bonusTo : opts.code,
      variants: results.length,
      spurs: r.spurs || 0,
      absorbedAc: absorbedSf / 43560,
      network: {
        streets: r.streets.map((st) => ({ kind: st.kind, pts: st.pts.map((p) => toLL(rot(p, r.ang))) })),
        pond: r.pond ? mapGeom(mapGeom(r.pond.geometry, (p) => rot(p, r.ang)), toLL) : null,
        depth: r.depth,
      },
      geojson: turf.featureCollection([...features, ...labels]),
    }
  }
}

/** KML for Google Earth or an engineer's CAD import. */
export function neighborhoodKml(plan, title) {
  const kml = (hex, a = 'ff') => { const h = hex.replace('#', ''); return a + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2) }
  const color = (p) => p.kind === 'lot' ? p.color : { road: '#1C2A33', pond: '#3A8DDE', green: '#38A169', flood: '#5BB5D9' }[p.kind] || '#FFFFFF'
  const name = (p) => p.kind === 'lot' ? `Lot ${p.n} (${p.sf.toLocaleString()} sq ft)` : p.label || { road: 'Streets', flood: 'Floodplain' }[p.kind] || p.kind
  const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])
  const placemark = (f) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    const g = polys.map((p) => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${p[0].map(([x, y]) => `${x.toFixed(7)},${y.toFixed(7)},0`).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`).join('')
    return `<Placemark><name>${esc(name(f.properties))}</name><Style><LineStyle><color>${kml(color(f.properties))}</color><width>1.5</width></LineStyle><PolyStyle><color>${kml(color(f.properties), '80')}</color></PolyStyle></Style>${polys.length > 1 ? `<MultiGeometry>${g}</MultiGeometry>` : g}</Placemark>`
  }
  const shapes = plan.geojson.features.filter((f) => f.geometry.type !== 'Point')
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(title)}</name><description>Groundwork neighborhood draft: ${plan.lots} lots, ${plan.district}. Concept only, not an engineered plan.</description>
${shapes.map(placemark).join('\n')}
</Document></kml>`
}
