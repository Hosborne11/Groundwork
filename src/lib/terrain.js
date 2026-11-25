// Terrain from USGS 3DEP (1 m lidar where available): elevation range and slope for a parcel.
// The ImageServer allows browser requests, so no proxy is needed.
export const TERRAIN = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer'
const FT = 3.28084

async function stats(parcel, rasterFunction) {
  const g = parcel.geometry
  const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat()
  const params = new URLSearchParams({
    f: 'json', geometryType: 'esriGeometryPolygon',
    geometry: JSON.stringify({ rings, spatialReference: { wkid: 4326 } }),
    pixelSize: JSON.stringify({ x: 3, y: 3, spatialReference: { wkid: 3857 } }),
  })
  if (rasterFunction) params.set('renderingRule', JSON.stringify({ rasterFunction }))
  const r = await fetch(`${TERRAIN}/computeStatisticsHistograms`, { method: 'POST', body: params })
  const j = await r.json()
  if (j.error || !j.statistics?.[0]) throw new Error(j.error?.message || 'No terrain data')
  return { s: j.statistics[0], h: j.histograms?.[0] }
}

/** Elevation range, average slope, and the share of the parcel steeper than 15%. */
export async function terrainFor(parcel) {
  const [elev, slope] = await Promise.all([stats(parcel, null), stats(parcel, 'Slope Degrees')])
  const pct = (deg) => Math.tan((deg * Math.PI) / 180) * 100
  // share of cells steeper than 15% grade (about 8.5 degrees), from the slope histogram
  let steepShare = null
  if (slope.h?.counts?.length) {
    const { min, max, counts } = slope.h
    const w = (max - min) / counts.length
    const cut = (Math.atan(0.15) * 180) / Math.PI
    let steep = 0, all = 0
    counts.forEach((n, i) => { all += n; if (min + (i + 0.5) * w > cut) steep += n })
    steepShare = all ? steep / all : null
  }
  return {
    minFt: elev.s.min * FT, maxFt: elev.s.max * FT, reliefFt: (elev.s.max - elev.s.min) * FT,
    slopePct: pct(slope.s.median), slopeMeanPct: pct(slope.s.mean), steepShare,
  }
}

/** Map tiles: color-coded slope and 5 ft contours. */
export const terrainTiles = (fn) => `${TERRAIN}/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image&renderingRule=${encodeURIComponent(JSON.stringify({ rasterFunction: fn }))}`
