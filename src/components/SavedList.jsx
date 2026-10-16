function toCSV(saved) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['County', 'Parcel', 'Owner', 'Address', 'Acres', 'Value', 'Mailing address', 'Saved']
  const rows = saved.map((s) => {
    const p = s.feature.properties
    return [p.county, s.pin, s.owner, p.address, Number(s.acres || 0).toFixed(2), p.assessed ?? '', p.mail, new Date(s.savedAt).toLocaleDateString()]
  })
  return [head, ...rows].map((r) => r.map(esc).join(',')).join('\n')
}

export default function SavedList({ saved, onPick, onRemove }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([toCSV(saved)], { type: 'text/csv' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'groundwork-saved-parcels.csv' })
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="saved">
      <div className="saved-head">
        <h3>Saved parcels</h3>
        {saved.length > 0 && <button className="btn" onClick={download}>Export CSV</button>}
      </div>
      {saved.length === 0 && <p className="muted">Click a parcel, then choose Save parcel to build a list here.</p>}
      <ul>
        {saved.map((s) => (
          <li key={s.pin}>
            <button className="saved-item" onClick={() => onPick(s)}>
              <span className="r-owner">{s.owner}</span>
              <span className="r-meta">{Number(s.acres || 0).toFixed(2)} ac · {s.feature.properties.county} {s.pin}</span>
            </button>
            <button className="remove" onClick={() => onRemove(s.pin)} aria-label={`Remove ${s.owner}`}>×</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
