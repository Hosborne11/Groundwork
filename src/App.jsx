import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as turf from '@turf/turf'
import { floodTiles, linesInView } from './lib/gis'
import { parcelAtPoint, parcelLinesInView } from './lib/parcels'
import { loadRezonings } from './lib/rezonings'
import { COUNTIES } from './lib/counties'
import { charlotteWaterLines } from './lib/charlotteWater'
import ParcelPanel from './components/ParcelPanel'
import Search from './components/Search'
import SideRail from './components/SideRail'
import CountyPicker from './components/CountyPicker'
import { loadCounties, countyAt } from './lib/counties'

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
  const [menu, setMenu] = useState(null)
  const [rezonings, setRezonings] = useState(null)
  // set when a parcel is opened from the Rezonings list, so the outlook grades the requested district
  const [fromPetition, setFromPetition] = useState(null)
  const [county, setCounty] = useState(null)
  const countiesRef = useRef(null)
  const keepCountyLabel = useRef(false)
  const editorRef = useRef(null) // set while the site plan editor is active; map clicks go to it // true right after 'Both counties', so the fly-to doesn't relabel it

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
        setError('No parcel here. Coverage is Mecklenburg, Cabarrus, and York counties for now.')
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
    setFromPetition(null)
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
      maxBounds: [[-81.8, 34.55], [-79.8, 35.9]],
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          base: { type: 'raster', tiles: BASEMAPS.imagery, tileSize: 256, attribution: 'Esri, Maxar, Earthstar Geographics' },
          labels: { type: 'raster', tiles: [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`], tileSize: 256 },
          parcels: { type: 'geojson', data: turf.featureCollection([]), attribution: 'Cabarrus County GIS' },
          flood: { type: 'raster', tiles: [floodTiles()], tileSize: 512, attribution: 'FEMA NFHL' },
          sewer: { type: 'geojson', data: turf.featureCollection([]), attribution: 'City of Concord' },
          water: { type: 'geojson', data: turf.featureCollection([]) },
          selected: { type: 'geojson', data: turf.featureCollection([]) },
          rezonings: { type: 'geojson', data: turf.featureCollection([]), attribution: 'City of Charlotte' },
          counties: { type: 'geojson', data: turf.featureCollection([]), attribution: 'U.S. Census Bureau' },
          siteplan: { type: 'geojson', data: turf.featureCollection([]) },
          // labels get their own source: if the label font server is unreachable, only labels fail, not the plan
          siteplanLabels: { type: 'geojson', data: turf.featureCollection([]) },
          editStreets: { type: 'geojson', data: turf.featureCollection([]) },
          editDraw: { type: 'geojson', data: turf.featureCollection([]) },
          cltWater: { type: 'geojson', data: turf.featureCollection([]) },
          cltSewer: { type: 'geojson', data: turf.featureCollection([]), attribution: 'Charlotte Water (via rezoning reviews)' },
        },
        layers: [
          { id: 'base', type: 'raster', source: 'base' },
          { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } },
          { id: 'county-casing', type: 'line', source: 'counties', paint: { 'line-color': '#1C2A33', 'line-width': 3, 'line-opacity': 0.35 } },
          { id: 'county-line', type: 'line', source: 'counties', paint: { 'line-color': '#FFFFFF', 'line-width': 1.4, 'line-opacity': 0.75, 'line-dasharray': [3, 2] } },
          { id: 'county-selected', type: 'line', source: 'counties', filter: ['==', ['get', 'GEOID'], ''], paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 12, 4] } },
          { id: 'flood', type: 'raster', source: 'flood', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.6 } },
          { id: 'parcels', type: 'line', source: 'parcels', minzoom: PARCEL_MIN_ZOOM, paint: { 'line-color': '#FFFFFF', 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 18, 1.6] } },
          { id: 'water', type: 'line', source: 'water', minzoom: LINE_MIN_ZOOM, paint: { 'line-color': '#2F7DE1', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.5, 18, 4] } },
          { id: 'cltWater', type: 'line', source: 'cltWater', minzoom: 13, paint: { 'line-color': '#2F7DE1', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 18, 5], 'line-opacity': 0.75, 'line-dasharray': [1.5, 1] } },
          { id: 'cltSewer', type: 'line', source: 'cltSewer', minzoom: 13, paint: { 'line-color': '#38A169', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 18, 5], 'line-opacity': 0.75, 'line-dasharray': [1.5, 1], 'line-offset': 3 } },
          { id: 'sewer', type: 'line', source: 'sewer', minzoom: LINE_MIN_ZOOM, paint: { 'line-color': '#38A169', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.5, 18, 4] } },
          { id: 'rezonings-fill', type: 'fill', source: 'rezonings', minzoom: 11, filter: ['in', ['get', 'kind'], ['literal', ['active', 'approved']]], paint: { 'fill-color': ['match', ['get', 'kind'], 'active', '#F2A81D', '#A78BFA'], 'fill-opacity': 0.18 } },
          { id: 'rezonings-line', type: 'line', source: 'rezonings', minzoom: 11, filter: ['in', ['get', 'kind'], ['literal', ['active', 'approved']]], paint: { 'line-color': ['match', ['get', 'kind'], 'active', '#F2A81D', '#A78BFA'], 'line-width': 2, 'line-dasharray': [2, 1.5] } },
          { id: 'siteplan-fill', type: 'fill', source: 'siteplan', filter: ['!=', ['geometry-type'], 'Point'], paint: {
            'fill-color': ['to-color', ['get', 'fill'], '#FFFFFF'],
            'fill-opacity': ['match', ['get', 'kind'], 'lot', 0.72, 'road', 0.92, 'pond', 0.85, 'green', 0.4, 'flood', 0.45, 0.3],
          } },
          { id: 'siteplan-line', type: 'line', source: 'siteplan', filter: ['==', ['get', 'kind'], 'lot'], paint: { 'line-color': '#FFFFFF', 'line-width': 1 } },
          { id: 'siteplan-lot-labels', type: 'symbol', source: 'siteplanLabels', minzoom: 16, filter: ['==', ['get', 'kind'], 'lot-label'],
            layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Semibold'], 'text-size': 10, 'text-allow-overlap': false },
            paint: { 'text-color': '#1C2A33', 'text-halo-color': 'rgba(255,255,255,0.6)', 'text-halo-width': 1 } },
          { id: 'siteplan-area-labels', type: 'symbol', source: 'siteplanLabels', minzoom: 14.5, filter: ['==', ['get', 'kind'], 'area-label'],
            layout: { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Semibold'], 'text-size': 11 },
            paint: { 'text-color': '#FFFFFF', 'text-halo-color': 'rgba(28,42,51,0.8)', 'text-halo-width': 1.4 } },
          // editor: street centerlines (wide invisible line for easy clicking), selection, drawing preview
          { id: 'edit-streets-hit', type: 'line', source: 'editStreets', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 22 } },
          { id: 'edit-streets', type: 'line', source: 'editStreets', paint: { 'line-color': '#FFFFFF', 'line-width': 1.5, 'line-dasharray': [3, 2] } },
          { id: 'edit-streets-sel', type: 'line', source: 'editStreets', filter: ['==', ['get', 'selected'], true], paint: { 'line-color': '#D6157A', 'line-width': 6, 'line-opacity': 0.9 } },
          { id: 'edit-lot-sel', type: 'line', source: 'editDraw', filter: ['==', ['get', 'kind'], 'lot-sel'], paint: { 'line-color': '#D6157A', 'line-width': 3 } },
          { id: 'edit-draw-line', type: 'line', source: 'editDraw', filter: ['==', ['get', 'kind'], 'draw'], paint: { 'line-color': '#D6157A', 'line-width': 3, 'line-dasharray': [2, 1] } },
          { id: 'edit-draw-pts', type: 'circle', source: 'editDraw', filter: ['==', ['get', 'kind'], 'vertex'], paint: { 'circle-radius': 4.5, 'circle-color': '#FFFFFF', 'circle-stroke-color': '#D6157A', 'circle-stroke-width': 2 } },
          { id: 'selected-fill', type: 'fill', source: 'selected', paint: { 'fill-color': '#D6157A', 'fill-opacity': 0.14 } },
          { id: 'selected-line', type: 'line', source: 'selected', paint: { 'line-color': '#D6157A', 'line-width': 3 } },
        ],
      },
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    m.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-right')
    m.on('zoomend', () => setZoom(m.getZoom()))
    const detectCounty = () => {
      if (keepCountyLabel.current) { keepCountyLabel.current = false; return }
      const c = m.getCenter()
      const id = countyAt(countiesRef.current, [c.lng, c.lat])
      setCounty(id)
      m.setFilter('county-selected', ['==', ['get', 'GEOID'], id || ''])
    }
    m.on('moveend', detectCounty)
    m.on('load', () => {
      loadCounties().then((fc) => { countiesRef.current = fc; m.getSource('counties')?.setData(fc); detectCounty() }).catch(() => {})
      loadRezonings().then((r) => { m.getSource('rezonings')?.setData(r.all); setRezonings(r) }).catch(() => {})
      charlotteWaterLines().then(({ water, sewer }) => {
        m.getSource('cltWater')?.setData(water)
        m.getSource('cltSewer')?.setData(sewer)
      }).catch(() => {})
    })
    m.on('dblclick', (e) => { if (editorRef.current) { e.preventDefault(); editorRef.current.dblclick?.(e) } })
    m.on('mousemove', (e) => editorRef.current?.move?.(e))
    m.on('click', (e) => {
      if (editorRef.current) { editorRef.current.click(e); return } // the site plan editor handles clicks
      setFromPetition(null)
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

  const flyToCounty = (id) => {
    const m = map.current
    const fc = countiesRef.current
    if (!m || !fc) return
    const feats = id === 'all' ? fc.features : fc.features.filter((f) => f.properties.GEOID === id)
    if (!feats.length) return
    const [w, s, e, n] = turf.bbox(turf.featureCollection(feats))
    const narrow = m.getContainer().clientWidth < 760
    const padding = narrow
      ? { top: 80, bottom: 90, left: 24, right: 24 }
      : { top: 80, bottom: 40, left: 76 + 40 + (menu ? 320 : 0), right: selected ? 460 : 40 } // 76 = side rail width
    if (id === 'all') {
      keepCountyLabel.current = true
      m.setFilter('county-selected', ['in', ['get', 'GEOID'], ['literal', feats.map((f) => f.properties.GEOID)]])
    } else {
      m.setFilter('county-selected', ['==', ['get', 'GEOID'], id])
    }
    setCounty(id)
    m.fitBounds([[w, s], [e, n]], { padding, duration: 1200 })
  }

  // What the site plan editor needs from the map
  const editor = useMemo(() => ({
    register: (handlers) => {
      editorRef.current = handlers
      const m = map.current
      if (!m) return
      if (handlers) { m.doubleClickZoom.disable(); m.getCanvas().style.cursor = 'crosshair' }
      else { m.doubleClickZoom.enable(); m.getCanvas().style.cursor = ''; m.getSource('editStreets')?.setData(turf.featureCollection([])); m.getSource('editDraw')?.setData(turf.featureCollection([])) }
    },
    setOverlay: ({ streets, draw }) => {
      const m = map.current
      m?.getSource('editStreets')?.setData(streets || turf.featureCollection([]))
      m?.getSource('editDraw')?.setData(draw || turf.featureCollection([]))
    },
    // what's under a click: a street (by id) first, otherwise a lot
    pick: (point) => {
      const m = map.current
      if (!m) return null
      const box = [[point.x - 5, point.y - 5], [point.x + 5, point.y + 5]]
      const st = m.queryRenderedFeatures(box, { layers: ['edit-streets-hit'] })[0]
      if (st) return { street: st.properties.id }
      const lot = m.queryRenderedFeatures(box, { layers: ['siteplan-fill'] }).find((f) => f.properties.kind === 'lot')
      return lot ? { lot: lot.properties.n } : null
    },
    setCursor: (c) => { if (map.current) map.current.getCanvas().style.cursor = c },
  }), [])

  const drawPlan = useCallback((fc) => {
    const m = map.current
    if (!m) return
    const feats = fc?.features || []
    m.getSource('siteplan')?.setData(turf.featureCollection(feats.filter((f) => f.geometry.type !== 'Point')))
    m.getSource('siteplanLabels')?.setData(turf.featureCollection(feats.filter((f) => f.geometry.type === 'Point')))
    // fade the pink selection fill while a sketch is showing so the lots read clearly
    m.setPaintProperty('selected-fill', 'fill-opacity', fc ? 0 : 0.14)
  }, [])

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
    <div className={`app ${menu ? 'menu-open' : ''}`}>
      <div ref={mapEl} className="map" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-name">Groundwork</span>
        </div>
        <CountyPicker current={county} onPick={flyToCounty} />
        <Search onPick={flyToParcel} />
      </header>

      <SideRail
        open={menu}
        setOpen={setMenu}
        basemap={basemap}
        setBasemap={setBasemap}
        layers={layers}
        setLayers={setLayers}
        zoom={zoom}
        lineMinZoom={LINE_MIN_ZOOM}
        parcelMinZoom={PARCEL_MIN_ZOOM}
        saved={saved}
        onPickSaved={(s) => { setMenu(null); flyToParcel(s.feature) }}
        onRemoveSaved={(pin) => setSaved((l) => l.filter((s) => s.pin !== pin))}
        rezonings={rezonings}
        county={COUNTIES.find((c) => c.id === county)?.name || null}
        onPickPetition={(f) => {
          const [w, s, e, n] = turf.bbox(f)
          // leave room for the menu on the left and the parcel panel on the right
          const width = map.current?.getContainer().clientWidth || 0
          const padding = width >= 1100
            ? { top: 90, bottom: 60, left: 420, right: 440 }
            : { top: 80, bottom: 80, left: 40, right: 40 }
          map.current?.fitBounds([[w, s], [e, n]], { padding, maxZoom: 17 })
          // open the parcel at a point guaranteed to be inside the petition site
          // the rezoning outlook grades Charlotte requests; other counties just open the parcel
          setFromPetition(f.properties.county === 'Mecklenburg' ? { petition: f.properties.caseNumber, to: f.properties.toZone } : null)
          selectParcel(turf.pointOnFeature(f).geometry.coordinates)
        }}
      />

      {zoom < PARCEL_MIN_ZOOM && !selected && !loadingParcel && <div className="hint">Zoom in to see parcel lines. You can click a parcel at any zoom.</div>}
      {loadingParcel && !selected && <div className="hint">Loading parcel…</div>}
      {error && (
        <div className="toast" role="alert">
          {error}
          <button onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {selected && (
        <ParcelPanel key={selected.properties.id} parcel={selected} fromPetition={fromPetition} isSaved={isSaved} onSave={toggleSave} onClose={() => { editor.register(null); closePanel() }} onPlan={drawPlan} editor={editor} />
      )}
    </div>
  )
}
