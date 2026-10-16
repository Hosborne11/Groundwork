import { useId, useRef, useState } from 'react'
import { explainZoning } from '../data/zoningKey'

const TIP_W = 280

/** A zoning code that explains itself on hover, focus, or tap. */
export default function ZoneCode({ code, className = '' }) {
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const id = useId()
  const parts = explainZoning(code)
  if (!code) return <span className={className}>?</span>
  if (!parts.some((p) => p.name)) return <span className={className}>{code}</span>

  // Positioned against the window so scrolling panels can't clip it; kept on screen.
  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.max(8, Math.min(r.left, window.innerWidth - TIP_W - 8))
    const below = window.innerHeight - r.bottom > 200
    setPos(below ? { left, top: r.bottom + 6 } : { left, bottom: window.innerHeight - r.top + 6 })
  }
  const hide = () => setPos(null)

  return (
    <span
      ref={ref}
      className={`zc ${className}`}
      tabIndex={0}
      role="button"
      aria-describedby={pos ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={(e) => { e.stopPropagation(); pos ? hide() : show() }}
      onKeyDown={(e) => { if (e.key === 'Escape') hide(); if (e.key === 'Enter') e.stopPropagation() }}
    >
      {code}
      {pos && (
        <span className="zc-tip" role="tooltip" id={id} style={{ ...pos, width: TIP_W }}>
          {parts.map((p, i) => (
            <span key={i} className="zc-part">
              <span className="zc-token">{p.token}</span>
              <span>
                <strong>{p.name || 'Not in the key yet'}</strong>
                {p.desc && <span className="zc-desc">{p.desc}</span>}
              </span>
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
