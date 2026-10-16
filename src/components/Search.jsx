import { useEffect, useRef, useState } from 'react'
import { searchParcels } from '../lib/parcels'

export default function Search({ onPick }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const timer = useRef()

  useEffect(() => {
    clearTimeout(timer.current)
    if (q.trim().length < 3) { setResults([]); setMsg(''); return }
    timer.current = setTimeout(async () => {
      setBusy(true)
      try {
        const r = await searchParcels(q)
        setResults(r)
        setMsg(r.length ? '' : 'No parcels match. Try an owner name, a street address, or the first digits of a parcel number.')
      } catch {
        setMsg('County parcel search is not responding. Try again in a moment.')
      } finally { setBusy(false) }
    }, 400)
    return () => clearTimeout(timer.current)
  }, [q])

  return (
    <div className="search" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <input
        type="search"
        value={q}
        placeholder="Owner, address, or parcel number"
        aria-label="Search by owner, address, or parcel number"
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
      />
      {open && (busy || msg || results.length > 0) && (
        <ul className="results" role="listbox">
          {busy && <li className="muted">Searching…</li>}
          {!busy && msg && <li className="muted">{msg}</li>}
          {!busy && results.map((f) => (
            <li key={`${f.properties.county}-${f.properties.id}`}>
              <button onClick={() => { setOpen(false); onPick(f) }}>
                <span className="r-owner">{f.properties.owner || 'Owner not listed'}</span>
                <span className="r-meta">{f.properties.address ? `${f.properties.address} · ` : ''}{f.properties.acres.toFixed(2)} ac · {f.properties.county}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
