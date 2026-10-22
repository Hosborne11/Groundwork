import * as turf from '@turf/turf'
import { N1 } from '../data/charlotteUdo'

/*
 * Concept subdivision layout for a parcel.
 *
 * Works in a flat local frame measured in feet, rotated so the parcel's long side runs
 * along x. Lots are laid out in rows on both sides of interior streets ("double-loaded"),
 * then clipped to the usable land (parcel minus floodplain). Several orientations are
 * tried and the one with the most lots wins.
 *
 * This is a yield sketch, not an engineered plan: no grading, tree save, driveway rules,
 * street connectivity, or stream buffers.
 */

export const ROW_FT = 50 // local street right-of-way
const MIN_DEPTH_FT = 100
const FT_PER_DEG_LAT = 364000

/* ---------- local frame: lon/lat <-> feet, plus rotation ---------- */
function frame(parcel) {
  const [lng0, lat0] = turf.centroid(parcel).geometry.coordinates
  const kx = FT_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180)
  return {
    toFt: ([lng, lat]) => [(lng - lng0) * kx, (lat - lat0) * FT_PER_DEG_LAT],
    toLL: ([x, y]) => [x / kx + lng0, y / FT_PER_DEG_LAT + lat0],
  }
}
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
const mapCoords = (geom, fn) => {
  const ring = (r) => r.map(fn)
  if (geom.type === 'Polygon') return { type: 'Polygon', coordinates: geom.coordinates.map(ring) }
  if (geom.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: geom.coordinates.map((p) => p.map(ring)) }
  return geom
}
// turf's polygon clipping is planar, so it works directly on our feet coordinates.
const clip = (a, b) => { try { return turf.intersect(turf.featureCollection([a, b])) } catch { return null } }
const minus = (a, b) => { try { return turf.difference(turf.featureCollection([a, b])) } catch { return a } }
// planar area in square feet (shoelace), since turf.area assumes degrees
function areaFt(geom) {
  const ringArea = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(s) / 2 }
  const poly = (p) => ringArea(p[0]) - p.slice(1).reduce((t, h) => t + ringArea(h), 0)
  if (!geom) return 0
  if (geom.type === 'Polygon') return poly(geom.coordinates)
  if (geom.type === 'MultiPolygon') return geom.coordinates.reduce((t, p) => t + poly(p), 0)
  return 0
}
const rect = (x0, y0, x1, y1) => turf.polygon([[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]])

/** Candidate orientations: directions of the parcel's longest edges, and their perpendiculars. */
function candidateAngles(ftGeom) {
  const ring = ftGeom.type === 'Polygon' ? ftGeom.coordinates[0] : ftGeom.coordinates.flat()[0]
  const edges = []
  for (let i = 1; i < ring.length; i++) {
    const [x0, y0] = ring[i - 1], [x1, y1] = ring[i]
    edges.push({ len: Math.hypot(x1 - x0, y1 - y0), ang: Math.atan2(y1 - y0, x1 - x0) })
  }
  const angles = edges.sort((a, b) => b.len - a.len).slice(0, 3).flatMap((e) => [e.ang, e.ang + Math.PI / 2])
  return [...new Set(angles.map((a) => Math.round(a * 1000) / 1000))]
}

/** Lay out one orientation. Everything here is in the rotated feet frame. */
function layout(usable, { lotWidth, lotDepth, minLotSf, maxLots }) {
  const [minX, minY, maxX, maxY] = turf.bbox(usable)
  const H = maxY - minY
  const lots = [], streets = []

  if (H < 2 * lotDepth + ROW_FT) {
    // Too shallow for an interior street: one row of lots across the full depth (a lot split).
    for (let x = minX; x + lotWidth <= maxX + 1; x += lotWidth) {
      const piece = clip(rect(x, minY, x + lotWidth, maxY), usable)
      if (piece && areaFt(piece.geometry) >= minLotSf) lots.push(piece)
    }
    return { lots: lots.slice(0, maxLots), streets, split: true, depth: H }
  }

  // Stack blocks: [lot row][street][lot row], repeated as depth allows.
  const nBlocks = Math.max(1, Math.floor((H + 1) / (2 * lotDepth + ROW_FT)))
  // With more than one street, a cross street at the west end ties them together.
  const crossX = nBlocks > 1 ? minX + ROW_FT : minX
  // Deepen lots to use leftover depth instead of leaving empty strips (up to 60% deeper).
  const leftover = H - nBlocks * (2 * lotDepth + ROW_FT)
  lotDepth += Math.max(0, Math.min(leftover / (2 * nBlocks), lotDepth * 0.6))
  const block = 2 * lotDepth + ROW_FT
  const y0 = minY + (H - nBlocks * block) / 2 // center the blocks
  for (let b = 0; b < nBlocks; b++) {
    const by = y0 + b * block
    const street = clip(rect(minX, by + lotDepth, maxX, by + lotDepth + ROW_FT), usable)
    if (street) streets.push(street)
    for (const rowY of [by, by + lotDepth + ROW_FT]) {
      for (let x = crossX; x + lotWidth <= maxX + 1; x += lotWidth) {
        const piece = clip(rect(x, rowY, x + lotWidth, rowY + lotDepth), usable)
        // keep lots that meet the minimum area and aren't slivers along a curved edge
        if (piece && areaFt(piece.geometry) >= Math.max(minLotSf, 0.6 * lotWidth * lotDepth)) lots.push(piece)
      }
    }
  }
  if (nBlocks > 1) {
    const firstStreetY = y0 + lotDepth, lastStreetY = y0 + (nBlocks - 1) * block + lotDepth + ROW_FT
    const cross = clip(rect(minX, firstStreetY, crossX, lastStreetY), usable)
    if (cross) streets.push(cross)
  }
  return { lots: lots.slice(0, maxLots), streets, split: false, depth: lotDepth }
}

/**
 * Build a concept plan.
 * @param parcel GeoJSON polygon feature (lon/lat)
 * @param opts { code, mode: 'standard'|'conservation'|'bonus', lotWidth, reservePct, floodPolys }
 */
export function sitePlan(parcel, { code, mode = 'standard', lotWidth, reservePct = 10, floodPolys = [] }) {
  const base = N1[code]
  if (!base) return { error: 'Site plans are available for Charlotte Neighborhood 1 districts for now.' }
  const std = mode === 'bonus' && base.bonusTo ? N1[base.bonusTo] : base

  const { toFt, toLL } = frame(parcel)
  const parcelFt = turf.feature(mapCoords(parcel.geometry, toFt))
  const grossSf = areaFt(parcelFt.geometry)
  if (grossSf > 300 * 43560) return { error: 'This parcel is over 300 acres; sketches are limited to smaller sites for now.' }

  // usable land = parcel minus floodplain
  let usableFt = parcelFt
  for (const f of floodPolys) {
    const fFt = turf.feature(mapCoords(f.geometry, toFt))
    const next = minus(usableFt, fFt)
    if (next) usableFt = next
  }
  const usableSf = areaFt(usableFt.geometry)

  // lot sizing by mode
  const conservation = mode === 'conservation'
  const minLotSf = conservation ? base.minLotSf * 0.5 : std.minLotSf // Sec. 4.5: lots may shrink by 50%
  const width = Math.max(lotWidth || std.minWidthFt, conservation ? Math.min(std.minWidthFt, 40) : std.minWidthFt)
  const depth = Math.max(MIN_DEPTH_FT, Math.ceil(minLotSf / width))
  const maxLots = conservation ? Math.floor(grossSf / base.minLotSf) : Infinity // Sec. 4.5 cap uses gross acreage

  // try each orientation, keep the one with the most lots
  let best = null
  for (const ang of candidateAngles(parcelFt.geometry)) {
    const usableR = turf.feature(mapCoords(usableFt.geometry, (p) => rot(p, -ang)))
    const r = layout(usableR, { lotWidth: width, lotDepth: depth, minLotSf, maxLots })
    if (!best || r.lots.length > best.lots.length) best = { ...r, ang }
  }
  if (!best || !best.lots.length) {
    const floodShare = 1 - usableSf / grossSf
    return {
      error: floodShare > 0.5
        ? `About ${Math.round(floodShare * 100)}% of this parcel is floodplain, which leaves too little buildable land for lots.`
        : 'No lots fit with these settings. The parcel may be too narrow for a street with lots on both sides. Try a narrower lot width or a smaller stormwater set-aside.',
      usableSf, grossSf,
    }
  }

  // Stormwater / open space: take whole lots from the far end until the set-aside is met.
  const needOpen = conservation ? Math.max(reservePct, 10) : reservePct
  const lots = [...best.lots].sort((a, b) => turf.bbox(b)[0] - turf.bbox(a)[0]) // far end first
  const open = []
  let openSf = 0
  while (lots.length > 1 && openSf < (needOpen / 100) * usableSf) {
    const l = lots.shift()
    openSf += areaFt(l.geometry)
    open.push(l)
  }

  // back to lon/lat
  const back = (f) => turf.feature(mapCoords(mapCoords(f.geometry, (p) => rot(p, best.ang)), toLL))
  const lotFeats = lots.sort((a, b) => turf.bbox(a)[0] - turf.bbox(b)[0]).map((l, i) => {
    const g = back(l); g.properties = { kind: 'lot', n: i + 1, sf: Math.round(areaFt(l.geometry)) }; return g
  })
  const streetFeats = best.streets.map((s) => { const g = back(s); g.properties = { kind: 'street' }; return g })
  const openFeats = open.map((o) => { const g = back(o); g.properties = { kind: 'open' }; return g })
  const floodFeats = floodPolys.map((f) => clip(f, parcel)).filter(Boolean).map((f) => { f.properties = { kind: 'flood' }; return f })

  // street length = long side of each street piece (the cross street runs along y)
  const streetLenFt = best.streets.reduce((t, s) => { const [x0, y0, x1, y1] = turf.bbox(s); return t + Math.max(x1 - x0, y1 - y0) }, 0)
  const lotSfs = lotFeats.map((l) => l.properties.sf)
  return {
    district: mode === 'bonus' && base.bonusTo ? base.bonusTo : code,
    mode,
    lots: lotFeats.length,
    avgLotSf: Math.round(lotSfs.reduce((a, b) => a + b, 0) / lotSfs.length),
    lotWidthFt: width,
    lotDepthFt: Math.round(best.depth),
    streetLenFt: Math.round(streetLenFt),
    openAc: openSf / 43560,
    usableAc: usableSf / 43560,
    grossAc: grossSf / 43560,
    split: best.split,
    capped: conservation && best.lots.length >= maxLots,
    geojson: turf.featureCollection([...floodFeats, ...openFeats, ...streetFeats, ...lotFeats]),
  }
}

/** KML for Google Earth or an engineer's CAD import. */
export function sitePlanKml(plan, title) {
  const style = { lot: 'ffffffff', street: 'ff8a8a8a', open: 'ff69a138', flood: 'ffd9b55b' }
  const placemark = (f) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    const name = f.properties.kind === 'lot' ? `Lot ${f.properties.n} (${f.properties.sf.toLocaleString()} sq ft)` : f.properties.kind === 'open' ? 'Stormwater / open space' : f.properties.kind === 'flood' ? 'Floodplain' : 'Street'
    const geom = polys.map((p) => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${p[0].map(([x, y]) => `${x.toFixed(7)},${y.toFixed(7)},0`).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`).join('')
    return `<Placemark><name>${name}</name><Style><LineStyle><color>${style[f.properties.kind]}</color><width>2</width></LineStyle><PolyStyle><color>40${style[f.properties.kind].slice(2)}</color></PolyStyle></Style>${polys.length > 1 ? `<MultiGeometry>${geom}</MultiGeometry>` : geom}</Placemark>`
  }
  const esc = (s) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(title)}</name><description>Groundwork concept site plan: ${plan.lots} lots, ${plan.district}, ${plan.mode}. Concept only, not an engineered plan.</description>
${plan.geojson.features.map(placemark).join('\n')}
</Document></kml>`
}
