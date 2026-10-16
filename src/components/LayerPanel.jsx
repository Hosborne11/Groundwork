const ROWS = [
  { id: 'parcels', label: 'Parcel lines', swatch: '#FFFFFF', note: 'Mecklenburg and Cabarrus' },
  { id: 'rezonings', label: 'Active rezonings', swatch: '#F2A81D', note: 'Charlotte petitions in process' },
  { id: 'sewer', label: 'Sewer mains', swatch: '#38A169', note: 'Concord; Charlotte as reported' },
  { id: 'water', label: 'Water mains', swatch: '#2F7DE1', note: 'Concord; Charlotte as reported' },
  { id: 'flood', label: 'FEMA flood zones', swatch: '#5BB5D9', note: '100-yr and floodway' },
]

export default function LayerPanel({ layers, setLayers, zoom, lineMinZoom, parcelMinZoom }) {
  return (
    <div className="layer-list">
      {ROWS.map((r) => (
        <label key={r.id} className="layer-row">
          <input type="checkbox" checked={layers[r.id]} onChange={() => setLayers((l) => ({ ...l, [r.id]: !l[r.id] }))} />
          <span className="swatch line" style={{ background: r.swatch }} aria-hidden="true" />
          <span className="layer-text">
            <span>{r.label}</span>
            <span className="layer-note">
              {((r.id === 'sewer' || r.id === 'water') && zoom < lineMinZoom) || (r.id === 'parcels' && zoom < parcelMinZoom) ? 'Zoom in to see' : r.note}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}
