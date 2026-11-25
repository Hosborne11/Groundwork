import { useId, useState } from 'react'

/** A collapsible panel section: a header row that opens and closes its body. */
export default function Section({ title, defaultOpen = true, aside = null, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className={`section sec ${open ? 'open' : ''}`}>
      <h3 className="sec-h">
        <button type="button" className="sec-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          <span className="sec-title">{title}</span>
          {aside && <span className="sec-aside">{aside}</span>}
          <svg className="sec-chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </h3>
      <div id={id} className="sec-body" hidden={!open}>{children}</div>
    </section>
  )
}
