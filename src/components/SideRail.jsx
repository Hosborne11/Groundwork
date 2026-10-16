import { useEffect, useState } from 'react'
import LayerPanel from './LayerPanel'
import SavedList from './SavedList'
import ZoningKey from './ZoningKey'
import ZoneCode from './ZoneCode'
import { loadCharlotteWater } from '../lib/charlotteWater'

// Simple stroke icons, drawn to match the type weight in the rail.
const ICONS = {
  basemaps: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></>,
  layers: <><path d="M12 3 2.5 8 12 13l9.5-5L12 3z" /><path d="m2.5 12.5 9.5 5 9.5-5" /><path d="m2.5 16.5 9.5 5 9.5-5" /></>,
  saved: <path d="M6 3.5h12v17l-6-4.2-6 4.2v-17z" />,
  rezonings: <><path d="M5 21V4" /><path d="M5 4h11l-2 3.5L16 11H5" /></>,
  sources: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></>,
  key: <><circle cx="8" cy="15" r="4.5" /><path d="m11.3 11.7 8.2-8.2M16.5 6.5l2.5 2.5M14 9l2 2" /></>,
  account: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.3-3.6 4.1-5.4 7.5-5.4s6.2 1.8 7.5 5.4" /></>,
}
const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[name]}
  </svg>
)

const ITEMS = [
  { id: 'basemaps', label: 'Base Maps' },
  { id: 'layers', label: 'Layers' },
  { id: 'saved', label: 'Saved' },
  { id: 'rezonings', label: 'Rezonings' },
  { id: 'key', label: 'Zoning Key' },
  { id: 'sources', label: 'Sources' },
]

export default function SideRail({
  open, setOpen, basemap, setBasemap, layers, setLayers, zoom, lineMinZoom, parcelMinZoom,
  saved, onPickSaved, onRemoveSaved, petitions, onPickPetition,
}) {
  const toggle = (id) => setOpen((cur) => (cur === id ? null : id))

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  return (
    <>
      <nav className="rail" aria-label="Main">
        <div className="rail-mark" aria-hidden="true"><span /></div>
        {ITEMS.map((it) => (
          <button
            key={it.id}
            className={`rail-btn ${open === it.id ? 'on' : ''}`}
            onClick={() => toggle(it.id)}
            aria-expanded={open === it.id}
            aria-controls="flyout"
          >
            <Icon name={it.id} />
            <span>{it.label}</span>
            {it.id === 'saved' && saved.length > 0 && <span className="rail-badge">{saved.length}</span>}
          </button>
        ))}
        <button className={`rail-btn rail-account ${open === 'account' ? 'on' : ''}`} onClick={() => toggle('account')} aria-label="Account" aria-expanded={open === 'account'}>
          <span className="avatar"><Icon name="account" /></span>
        </button>
      </nav>

      {open && (
        <section id="flyout" className="flyout" aria-label={open}>
          <div className="flyout-head">
            <h2>{ITEMS.find((i) => i.id === open)?.label || 'Account'}</h2>
            <button className="close" onClick={() => setOpen(null)} aria-label="Close menu">×</button>
          </div>
          <div className="flyout-body">
            {open === 'basemaps' && <Basemaps basemap={basemap} setBasemap={setBasemap} />}
            {open === 'layers' && <LayerPanel layers={layers} setLayers={setLayers} zoom={zoom} lineMinZoom={lineMinZoom} parcelMinZoom={parcelMinZoom} />}
            {open === 'saved' && <SavedList saved={saved} onPick={onPickSaved} onRemove={onRemoveSaved} />}
            {open === 'rezonings' && <Rezonings petitions={petitions} onPick={onPickPetition} />}
            {open === 'key' && <ZoningKey />}
            {open === 'sources' && <Sources />}
            {open === 'account' && <Account />}
          </div>
        </section>
      )}
    </>
  )
}

function Basemaps({ basemap, setBasemap }) {
  const options = [
    { id: 'imagery', name: 'Satellite', note: 'Aerial imagery with road labels' },
    { id: 'streets', name: 'Streets', note: 'Street map, easier to read addresses' },
  ]
  return (
    <div className="basemaps">
      {options.map((o) => (
        <button key={o.id} className={`basemap ${basemap === o.id ? 'on' : ''}`} onClick={() => setBasemap(o.id)} aria-pressed={basemap === o.id}>
          <span className={`basemap-thumb thumb-${o.id}`} aria-hidden="true" />
          <span className="basemap-text"><strong>{o.name}</strong><span>{o.note}</span></span>
        </button>
      ))}
    </div>
  )
}

function Rezonings({ petitions, onPick }) {
  const [q, setQ] = useState('')
  const list = (petitions?.features || [])
    .map((f) => ({ f, p: f.properties }))
    .filter(({ p }) => !q || `${p.Petition} ${p.Petitioner || ''} ${p.ReqZone || ''} ${p.ExistZone || ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.p.Received || 0) - (a.p.Received || 0))

  if (!petitions) return <p className="muted">Loading active petitions…</p>
  return (
    <>
      <p className="flyout-note">Charlotte rezoning petitions currently in process. Select one to go to it.</p>
      <input className="flyout-filter" type="search" placeholder="Filter by petition, petitioner, or zoning" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter petitions" />
      <ul className="petition-list">
        {list.map(({ f, p }) => (
          <li key={p.Petition}>
            <div className="pl-row" role="button" tabIndex={0} onClick={() => onPick(f)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(f))}>
              <span className="pl-top"><strong>{p.Petition}</strong>{p.PetAcres ? <span>{Number(p.PetAcres).toFixed(1)} ac</span> : null}</span>
              <span className="pl-change"><ZoneCode code={(p.ExistZone || '').trim()} /> → <ZoneCode code={(p.ReqZone || '').trim()} /></span>
              {p.Petitioner && <span className="pl-who">{p.Petitioner}</span>}
            </div>
          </li>
        ))}
        {!list.length && <li className="muted">No petitions match.</li>}
      </ul>
    </>
  )
}

function Sources() {
  const [water, setWater] = useState(null)
  useEffect(() => { loadCharlotteWater().then(setWater) }, [])
  const rows = [
    ['Parcels, owners, values, sales', 'Mecklenburg County (via City of Charlotte GIS), Cabarrus County GIS, York County SC GIS', 'Live'],
    ['Zoning', 'City of Charlotte; Cabarrus County for its six towns; York County and City of Rock Hill', 'Live'],
    ['York water and sewer providers', 'York County service area boundaries', 'Live'],
    ['Zoning rules', 'Charlotte UDO Article 4 (Neighborhood 1 districts)', 'Checked October 2026'],
    ['2040 place types', 'Charlotte Future 2040 Policy Map', 'Live'],
    ['Rezoning petitions and history', 'City of Charlotte Planning', 'Live'],
    ['Charlotte water and sewer', 'Charlotte Water statements in rezoning staff analyses, 2022 onward', water?.generated ? `Built ${new Date(water.generated).toLocaleDateString()}` : 'Not loaded'],
    ['Concord water and sewer', 'City of Concord Utilities', 'Live'],
    ['Flood zones', 'FEMA National Flood Hazard Layer', 'Live'],
    ['Soils', 'USDA NRCS Soil Data Access', 'Live'],
    ['Basemaps', 'Esri World Imagery and Street Map', 'Live'],
  ]
  return (
    <>
      <dl className="sources-list">
        {rows.map(([what, who, when]) => (
          <div key={what}>
            <dt>{what}</dt>
            <dd>{who}<span className="src-when">{when}</span></dd>
          </div>
        ))}
      </dl>
      <p className="flyout-note">Groundwork is a planning tool. Distances, lot counts, and rezoning outlooks are estimates, not survey, engineering, or legal advice.</p>
    </>
  )
}

function Account() {
  return (
    <>
      <p className="flyout-note">Sign-in is coming soon. For now, saved parcels are kept in this browser only, so they won't appear on another computer.</p>
    </>
  )
}
