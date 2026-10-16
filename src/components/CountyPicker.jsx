import { useEffect, useRef, useState } from 'react'
import { COUNTIES } from '../lib/counties'

/** Button + menu for jumping to a county. `current` is a GEOID, 'all', or null. */
export default function CountyPicker({ current, onPick }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const label = COUNTIES.find((c) => c.id === current)?.name || (current === 'all' ? 'Both counties' : 'Choose county')
  const pick = (id) => { setOpen(false); onPick(id) }

  return (
    <div className="county" ref={ref}>
      <button className="county-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="county-label">{label}</span>
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      </button>
      {open && (
        <ul className="county-menu" role="listbox" aria-label="Counties">
          {COUNTIES.map((c) => (
            <li key={c.id}>
              <button role="option" aria-selected={current === c.id} className={current === c.id ? 'on' : ''} onClick={() => pick(c.id)}>
                <strong>{c.name} County</strong>
                <span>{c.note}</span>
              </button>
            </li>
          ))}
          <li className="county-sep">
            <button role="option" aria-selected={current === 'all'} className={current === 'all' ? 'on' : ''} onClick={() => pick('all')}>
              <strong>Both counties</strong>
              <span>Everything Groundwork covers</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
