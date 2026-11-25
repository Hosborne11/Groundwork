// Draws Explore-catalog vector layers: features for the current view are fetched from each layer's
// ArcGIS service (GeoJSON), colored by family, and kept beneath the site plan so drafts stay on top.
import { useEffect, useRef } from 'react'
import { CATALOG, familyOf } from '../data/layerCatalog'

const BY_ID = Object.fromEntries(CATALOG.map((l) => [l.id, l]))
const abs = (u) => (u.startsWith('/') ? `${location.origin}${u}` : u)

async function fetchView(layer, b, zoom) {
  const urls = layer.urls || [layer.url]
  const env = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(',')
  const offset = zoom >= 15 ? 0.00002 : zoom >= 13 ? 0.0001 : 0.0005 // simplify for the zoom level (degrees)
  const parts = await Promise.all(urls.map(async (u) => {
    const q = new URLSearchParams({
      f: 'geojson', where: '1=1', geometry: env, geometryType: 'esriGeometryEnvelope', inSR: 4326, outSR: 4326,
      spatialRel: 'esriSpatialRelIntersects', outFields: layer.field || '*', returnGeometry: true,
      maxAllowableOffset: offset, resultRecordCount: 2000,
    })
    const r = await fetch(`${abs(u)}/query?${q}`)
    const j = await r.json()
    return j.features || []
  }))
  return parts.flat().filter((f) => f.geometry).map((f) => {
    const code = String(f.properties?.[layer.field] ?? '').trim()
    const fam = familyOf(code)
    return { type: 'Feature', geometry: f.geometry, properties: { code, color: fam.color } }
  })
}

/** Keeps the map's catalog layers in step with `active` (a list of catalog ids). */
export function useCatalogLayers(mapRef, ready, active, onStatus) {
  const timer = useRef(null)
  const ids = active.filter((id) => BY_ID[id]?.kind === 'vector')
  const key = ids.join('|')

  useEffect(() => {
    const m = mapRef.current
    if (!m || !ready) return
    const before = m.getLayer('siteplan-fill') ? 'siteplan-fill' : undefined
    // add or remove sources and layers
    for (const l of CATALOG.filter((x) => x.kind === 'vector')) {
      const src = `cat-${l.id}`, on = ids.includes(l.id)
      if (on && !m.getSource(src)) {
        m.addSource(src, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        if (l.style === 'boundary') {
          m.addLayer({ id: `${src}-line`, type: 'line', source: src, paint: { 'line-color': '#E4E8EB', 'line-width': 1.4, 'line-opacity': 0.7, 'line-dasharray': [4, 2] } }, before)
        } else {
          m.addLayer({ id: `${src}-fill`, type: 'fill', source: src, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 } }, before)
          m.addLayer({ id: `${src}-line`, type: 'line', source: src, paint: { 'line-color': ['get', 'color'], 'line-width': 0.9, 'line-opacity': 0.9 } }, before)
        }
        m.addLayer({ id: `${src}-label`, type: 'symbol', source: src, minzoom: l.style === 'boundary' ? 10 : 15,
          layout: { 'text-field': ['get', 'code'], 'text-size': l.style === 'boundary' ? 12 : 11, 'text-font': ['Open Sans Semibold'], 'symbol-placement': 'point', 'text-allow-overlap': false },
          paint: { 'text-color': '#F2F4F5', 'text-halo-color': 'rgba(20,25,30,0.85)', 'text-halo-width': 1.2 } }, before)
      }
      if (!on && m.getSource(src)) {
        for (const suffix of ['-label', '-line', '-fill']) if (m.getLayer(src + suffix)) m.removeLayer(src + suffix)
        m.removeSource(src)
      }
    }
    // load features for the view; refresh after the map settles
    const load = async () => {
      const b = m.getBounds(), z = m.getZoom()
      const waiting = []
      await Promise.all(ids.map(async (id) => {
        const l = BY_ID[id]
        const src = m.getSource(`cat-${id}`)
        if (!src) return
        if (z < l.minzoom) { src.setData({ type: 'FeatureCollection', features: [] }); waiting.push(l); return }
        try { src.setData({ type: 'FeatureCollection', features: await fetchView(l, b, z) }) } catch { /* keep the last view */ }
      }))
      onStatus?.(waiting.map((l) => l.name))
    }
    const onMove = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 350) }
    load()
    m.on('moveend', onMove)
    return () => { m.off('moveend', onMove); clearTimeout(timer.current) }
  }, [mapRef, ready, key]) // eslint-disable-line react-hooks/exhaustive-deps
}
