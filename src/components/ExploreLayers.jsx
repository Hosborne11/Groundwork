import { useMemo, useState } from 'react'
import { CATALOG, CATEGORIES, COLLECTIONS, LOCATIONS, FAMILIES } from '../data/layerCatalog'

const norm = (s) => String(s || '').toLowerCase()

/** Full-screen layer catalog: search, filters, featured collections, categories, and what's on the map. */
export default function ExploreLayers({ isOn, setOn, onClose, waiting = [] }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [loc, setLoc] = useState('')

  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean)
    return CATALOG.filter((l) => {
      if (cat && l.category !== cat) return false
      if (loc && !l.locations.includes(loc)) return false
      const hay = norm([l.name, l.desc, l.source, ...l.locations, CATEGORIES.find((c) => c.id === l.category)?.label].join(' '))
      return words.every((w) => hay.includes(w))
    })
  }, [q, cat, loc])
  const filtering = q || cat || loc
  const active = CATALOG.filter((l) => isOn(l.id))
  const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label
  const count = (id) => CATALOG.filter((l) => l.category === id).length
  const collectionOn = (c) => c.layers.every((id) => isOn(id))
  const toggleCollection = (c) => { const on = !collectionOn(c); for (const id of c.layers) setOn(id, on) }

  return (
    <div className="explore" role="dialog" aria-label="Explore layers">
      <aside className="ex-side">
        <div className="ex-side-head"><h2>On the map</h2>{active.length > 0 && <button className="link-btn" onClick={() => active.forEach((l) => setOn(l.id, false))}>Clear all</button>}</div>
        {active.length === 0 ? <p className="ex-empty">No layers on. Switch one on from the catalog.</p> : (
          <ul className="ex-active">
            {active.map((l) => (
              <li key={l.id}>
                <span>{l.name}{waiting.includes(l.name) && <em>Zoom in to see</em>}</span>
                <button type="button" role="switch" aria-checked="true" aria-label={`Hide ${l.name}`} className="switch on" onClick={() => setOn(l.id, false)}><i /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="ex-library">
          <h2>Your library</h2>
          <p className="ex-empty">Upload your own layers (KML, GeoJSON, zipped shapefiles, or a CSV of points). Coming in the next update.</p>
        </div>
        <div className="ex-key">
          <h3>Zoning colors</h3>
          <ul>{FAMILIES.map((f) => <li key={f.id}><i style={{ background: f.color }} />{f.label}</li>)}</ul>
        </div>
      </aside>

      <main className="ex-main">
        <div className="ex-top">
          <h1>Explore layers</h1>
          <button className="close" onClick={onClose} aria-label="Close explore">×</button>
        </div>
        <div className="ex-search">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input type="search" placeholder="Search layers: flood, Matthews zoning, sewer…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <div className="ex-filters">
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Location">
            <option value="">All locations</option>
            {LOCATIONS.map((l) => <option key={l} value={l}>{l} County</option>)}
          </select>
          {filtering && <button className="link-btn" onClick={() => { setQ(''); setCat(''); setLoc('') }}>Reset</button>}
        </div>

        {!filtering && (
          <>
            <h2 className="ex-h">Featured collections</h2>
            <div className="ex-collections">
              {COLLECTIONS.map((c) => (
                <button key={c.id} className={`ex-coll ${collectionOn(c) ? 'on' : ''}`} onClick={() => toggleCollection(c)}>
                  <span className="ex-thumb" aria-hidden="true">
                    {c.swatches.map((s, i) => <i key={i} style={{ background: s, left: `${12 + i * 16}%`, top: `${18 + (i % 2) * 26}%` }} />)}
                    <b />
                  </span>
                  <strong>{c.name}</strong>
                  <span className="ex-sub">{c.blurb}</span>
                  <span className="ex-meta">{c.layers.length} layers · {collectionOn(c) ? 'On the map' : 'Add to map'}</span>
                </button>
              ))}
            </div>
            <h2 className="ex-h">By category</h2>
            <div className="ex-cats">
              {CATEGORIES.map((c) => (
                <button key={c.id} className="ex-cat" style={{ '--hue': c.hue }} onClick={() => setCat(c.id)}>
                  <strong>{c.label}</strong><span>{count(c.id)} {count(c.id) === 1 ? 'layer' : 'layers'}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <h2 className="ex-h">{filtering ? `${results.length} ${results.length === 1 ? 'layer' : 'layers'}` : 'All layers'}</h2>
        <ul className="ex-list">
          {(filtering ? results : CATALOG).map((l) => (
            <li key={l.id} className={isOn(l.id) ? 'on' : ''}>
              <div>
                <strong>{l.name}</strong>
                <p>{l.desc}</p>
                <span className="ex-tags"><em>{catLabel(l.category)}</em>{l.source}{l.minzoom >= 13 ? ' · visible from neighborhood zoom' : ''}</span>
              </div>
              <button type="button" role="switch" aria-checked={isOn(l.id)} aria-label={`Show ${l.name}`} className={`switch ${isOn(l.id) ? 'on' : ''}`} onClick={() => setOn(l.id, !isOn(l.id))}><i /></button>
            </li>
          ))}
          {filtering && results.length === 0 && <li className="ex-none">No layers match. Try a town name, “zoning”, “flood”, or “sewer”.</li>}
        </ul>
      </main>
    </div>
  )
}
