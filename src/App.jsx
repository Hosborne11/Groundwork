import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as turf from '@turf/turf'
import { floodTiles, linesInView } from './lib/gis'
import { parcelAtPoint, parcelLinesInView } from './lib/parcels'
import { activePetitionShapes } from './lib/charlotte'
import { charlotteWaterLines } from './lib/charlotteWater'
import ParcelPanel from './components/ParcelPanel'
import Search from './components/Search'
import LayerPanel from './components/LayerPanel'
import SavedList from './components/SavedList'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const BASEMAPS = {
  imagery: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
  streets: [`${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`],
}
const LINE_MIN_ZOOM = 14.5
const PARCEL_MIN_ZOOM = 15.3

function loadSaved() {
  // 'sli:saved' is the key from before the rename; carry those parcels over.
  try { return JSON.parse(localStorage.getItem('groundwork:saved') || localStorage.getItem('sli:saved') || '[]') } catch { return [] }
}

export default function App() {
  const mapEl = useRef(null)
  const map = useRef(null)
  const [selected, setSelected] = useState(null)
  const [loadingParcel, setLoadingParcel] = useState(false)
  const [error, setError] = useState(null)
  const [basemap, setBasemap] = useState('imagery')
  const [layers, setLayers] = useState({ parcels: true, rezonings: true, sewer: true, water: true, flood: false })
  const [zoom, setZoom] = useState(11)
  const [saved, setSaved] = useState(loadSaved)
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('groundwork:saved', JSON.stringify(saved)) } catch { /* storage off */ }
  }, [saved])

  const selectParcel = useCallback(async (lngLat, knownFeature) => {
    setError(null)
    if (knownFeature?.properties?.id) {
      setSelected(knownFeature)
      map.current?.getSource('selected')?.setData(knownFeature)
      return
    }
    setLoadingParcel(true)
    try {
      const feature = await parcelAtPoint(lngLat)
      if (!feature) {
        setSelected(null)
        setError('No parcel here. Coverage is Mecklenburg and Cabarrus counties for now.')
        return
      }
      setSelected(feature)
      map.current?.getSource('selected')?.setData(feature)
    } catch (e) {
      setError(`Couldn't load that parcel: ${e.message}`)
    } finally {
      setLoadingParcel(false)
    }
  }, [])

  const flyToParcel = useCallback((feature) => {
    const [w, s, e, n] = turf.bbox(feature)
    map.current?.fitBounds([[w, s], [e, n]], { padding: { top: 90, bottom: 80, left: 80, right: 460 }, maxZoom: 17 })
    selectParcel(null, feature)
  }, [selectParcel])

  // init map
  useEffect(() => {
    const m = new maplibregl.Map({
      container: mapEl.current,
      center: [-80.84, 35.23],
      zoom: 11,
      maxBounds: [[-81.4, 34.9], [-79.8, 35.9]],
      style: {
        version: 8,
        sources: {
          base: { type: 'raster', tiles: BASEMAPS.imagery, tileSize: 256, attribution: 'Esri, Maxar, Earthstar Geographics' },
          labels: { type: 'raster', tiles: [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`], tileSize: 256 },
          parcels: { type: 'geojson', data: turf.featureCollection([]), attribution: 'Cabarrus County GIS' },
          flood: { type: 'raster', tiles: [floodTiles()], tileSize: 512, attribution: 'FEMA NFHL' },
          sewer: { type: 'geojson', data: turf.featureCollection([]), attribution: 'City of Concord' },
          water: { type: 'geojson', data: turf.featureCollection([]) },
          selected: { type: 'geojson', data: turf.featureCollection([]) },
          rezonings: { type: 'geojson', data: turf.featureCollection([]), attribution: 'City of Charlotte' },
          cltWater: { type: 'geojson', data: turf.featureCollection([]) },
          cltSewer: { type: 'geojson', data: turf.featureCollection([]), attribution: 'Charlotte Water (via rezoning reviews)' },
        },
        layers: [
          { id: 'base', type: 'raster', source: 'base' },
          { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } },
          { id: 'flood', type: 'raster', source: 'flood', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.6 } },
          { id: 'parcels', type: 'line', source: 'parcels', minzoom: PARCEL_MIN_ZOOM, paint: { 'line-color': '#FFFFFF', 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 18, 1.6] } },
          { id: 'water', type: 'line', source: 'water', minzoom: LINE_MIN_ZOOM, paint: { 'line-color': '#2F7DE1', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.5, 18, 4] } },
          { id: 'cltWater', type: 'line', source: 'cltWater', minzoom: 13, paint: { 'line-color': '#2F7DE1', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 18, 5], 'line-opacity': 0.75, 'line-dasharray': [1.5, 1] } },
          { id: 'cltSewer', type: 'line', source: 'cltSewer', minzoom: 13, paint: { 'line-color': '#38A169', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 18, 5], 'line-opacity': 0.75, 'line-dasharray': [1.5, 1], 'line-offset': 3 } },
          { id: 'sewer', type: 'line', source: 'sewer', minzoom: LINE_MIN_ZOOM, paint: { 'line-color': '#38A169', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.5, 18, 4] } },
          { id: 'rezonings-fill', type: 'fill', source: 'rezonings', minzoom: 11, paint: { 'fill-color': '#F2A81D', 'fill-opacity': 0.18 } },
          { id: 'rezonings-line', type: 'line', source: 'rezonings', minzoom: 11, paint: { 'line-color': '#F2A81D', 'line-width': 2, 'line-dasharray': [2, 1.5] } },
          { id: 'selected-fill', type: 'fill', source: 'selected', paint: { 'fill-color': '#D6157A', 'fill-opacity': 0.14 } },
          { id: 'selected-line', type: 'line', source: 'selected', paint: { 'line-color': '#D6157A', 'line-width': 3 } },
        ],
      },
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    m.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-right')
    m.on('zoomend', () => setZoom(m.getZoom()))
    m.on('load', () => {
      activePetitionShapes().then((d) => m.getSource('rezonings')?.setData(d)).catch(() => {})
      charlotteWaterLines().then(({ water, sewer }) => {
        m.getSource('cltWater')?.setData(water)
        m.getSource('cltSewer')?.setData(sewer)
      }).catch(() => {})
    })
    m.on('click', (e) => {
      selectParcel([e.lngLat.lng, e.lngLat.lat])
    })
    map.current = m
    return () => m.remove()
  }, [selectParcel])

  // basemap swap
  useEffect(() => {
    const m = map.current
    if (!m) return
    const apply = () => {
      m.getSource('base')?.setTiles(BASEMAPS[basemap])
      m.setLayoutProperty('labels', 'visibility', basemap === 'imagery' ? 'visible' : 'none')
    }
    m.isStyleLoaded() ? apply() : m.once('load', apply)
  }, [basemap])

  // layer visibility
  useEffect(() => {
    const m = map.current
    if (!m) return
    const apply = () => {
      for (const id of ['parcels', 'sewer', 'water', 'flood']) {
        m.setLayoutProperty(id, 'visibility', layers[id] ? 'visible' : 'none')
      }
      m.setLayoutProperty('cltSewer', 'visibility', layers.sewer ? 'visible' : 'none')
      m.setLayoutProperty('cltWater', 'visibility', layers.water ? 'visible' : 'none')
      for (const id of ['rezonings-fill', 'rezonings-line']) {
        m.setLayoutProperty(id, 'visibility', layers.rezonings ? 'visible' : 'none')
      }
    }
    m.isStyleLoaded() ? apply() : m.once('load', apply)
  }, [layers])

  // utility lines for the current view
  useEffect(() => {
    const m = map.current
    if (!m) return
    let timer
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        if (m.getZoom() < LINE_MIN_ZOOM) return
        const b = m.getBounds()
        const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
        if (layers.parcels && m.getZoom() >= PARCEL_MIN_ZOOM) {
          try { m.getSource('parcels')?.setData(await parcelLinesInView(bbox)) } catch { /* keep previous lines */ }
        }
        for (const which of ['sewer', 'water']) {
          if (!layers[which]) continue
          try { m.getSource(which)?.setData(await linesInView(which, bbox)) } catch { /* keep previous lines */ }
        }
      }, 350)
    }
    m.on('moveend', refresh)
    refresh()
    return () => { m.off('moveend', refresh); clearTimeout(timer) }
  }, [layers])

  const isSaved = !!selected && saved.some((s) => s.pin === selected.properties.id)
  const toggleSave = () => {
    if (!selected) return
    const p = selected.properties
    setSaved((list) => isSaved
      ? list.filter((s) => s.pin !== p.id)
      : [{ pin: p.id, owner: p.owner, acres: p.acres, feature: selected, savedAt: Date.now() }, ...list])
  }

  const closePanel = () => {
    setSelected(null)
    map.current?.getSource('selected')?.setData(turf.featureCollection([]))
  }

  return (
    <div className="app">
      <div ref={mapEl} className="map" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Groundwork</span>
          <span className="brand-scope">Charlotte &amp; Cabarrus</span>
        </div>
        <Search onPick={flyToParcel} />
        <button className={`saved-toggle ${showSaved ? 'on' : ''}`} onClick={() => setShowSaved((v) => !v)} aria-expanded={showSaved}>
          Saved parcels <span className="count">{saved.length}</span>
        </button>
      </header>

      <LayerPanel layers={layers} setLayers={setLayers} basemap={basemap} setBasemap={setBasemap} zoom={zoom} lineMinZoom={LINE_MIN_ZOOM} parcelMinZoom={PARCEL_MIN_ZOOM} />

      {showSaved && (
        <SavedList
          saved={saved}
          onPick={(s) => { setShowSaved(false); flyToParcel(s.feature) }}
          onRemove={(pin) => setSaved((l) => l.filter((s) => s.pin !== pin))}
        />
      )}

      {zoom < PARCEL_MIN_ZOOM && !selected && !loadingParcel && <div className="hint">Zoom in to see parcel lines. You can click a parcel at any zoom.</div>}
      {loadingParcel && !selected && <div className="hint">Loading parcel…</div>}
      {error && (
        <div className="toast" role="alert">
          {error}
          <button onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {selected && (
        <ParcelPanel key={selected.properties.id} parcel={selected} isSaved={isSaved} onSave={toggleSave} onClose={closePanel} />
      )}
    </div>
  )
}
