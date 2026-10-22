import { useEffect, useState } from 'react'
import { sitePlan, sitePlanKml } from '../lib/sitePlan'
import { N1, CONSERVATION_DISTRICTS, CONSERVATION_MIN_ACRES, MIXED_INCOME_MIN_ACRES } from '../data/charlotteUdo'

const fmt = (n) => Math.round(n).toLocaleString()

/**
 * "Sketch site plan" for a Charlotte N1 parcel. Draws on the map through onPlan(geojson | null).
 * floodPolys: floodplain shapes from the flood check (null while still loading).
 */
export default function SitePlanCard({ parcel, code, acres, floodPolys, onPlan }) {
  const std = N1[code]
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('standard')
  const [width, setWidth] = useState(std?.minWidthFt || 50)
  const [reserve, setReserve] = useState(10)
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(false)

  const modes = [
    { id: 'standard', label: 'Standard' },
    CONSERVATION_DISTRICTS.includes(code) && acres >= CONSERVATION_MIN_ACRES && { id: 'conservation', label: 'Conservation' },
    std?.bonusTo && acres >= MIXED_INCOME_MIN_ACRES && { id: 'bonus', label: `Mixed-income (${std.bonusTo})` },
  ].filter(Boolean)
  const active = mode === 'bonus' ? N1[std.bonusTo] : std
  const minWidth = mode === 'conservation' ? 40 : active.minWidthFt
  const maxWidth = active.minWidthFt * 2

  // keep the width within the current mode's rules
  useEffect(() => { setWidth((w) => Math.min(Math.max(w, minWidth), maxWidth)) }, [minWidth, maxWidth])

  // (re)build the sketch, debounced, off the click so the panel stays responsive
  useEffect(() => {
    if (!open || floodPolys === null) return
    setBusy(true)
    const t = setTimeout(() => {
      const p = sitePlan(parcel, { code, mode, lotWidth: width, reservePct: mode === 'conservation' ? Math.max(reserve, 10) : reserve, floodPolys })
      setPlan(p)
      onPlan(p.geojson || null)
      setBusy(false)
    }, 250)
    return () => clearTimeout(t)
  }, [open, mode, width, reserve, parcel, code, floodPolys, onPlan])

  // clear the drawing when the card goes away
  useEffect(() => () => onPlan(null), [onPlan])

  if (!std) return null
  if (!open) {
    return (
      <button className="btn btn-primary sketch-btn" onClick={() => setOpen(true)}>
        Sketch site plan
      </button>
    )
  }

  const download = () => {
    const blob = new Blob([sitePlanKml(plan, `Groundwork sketch · ${parcel.properties.address || parcel.properties.id}`)], { type: 'application/vnd.google-earth.kml+xml' })
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: `groundwork-site-plan-${parcel.properties.id}.kml` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="siteplan">
      <div className="siteplan-head">
        <strong>Concept site plan</strong>
        <button className="link-btn" onClick={() => { setOpen(false); setPlan(null); onPlan(null) }}>Hide sketch</button>
      </div>

      {modes.length > 1 && (
        <div className="seg" role="group" aria-label="Layout type">
          {modes.map((m) => (
            <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)} aria-pressed={mode === m.id}>{m.label}</button>
          ))}
        </div>
      )}

      <label className="slider">
        <span>Lot width <strong>{width} ft</strong></span>
        <input type="range" min={minWidth} max={maxWidth} step={5} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
      </label>
      <label className="slider">
        <span>Stormwater and open space <strong>{mode === 'conservation' ? Math.max(reserve, 10) : reserve}%</strong></span>
        <input type="range" min={mode === 'conservation' ? 10 : 0} max={25} step={1} value={mode === 'conservation' ? Math.max(reserve, 10) : reserve} onChange={(e) => setReserve(Number(e.target.value))} />
      </label>

      {floodPolys === null && <p className="pending">Waiting for the floodplain check…</p>}
      {busy && floodPolys !== null && <p className="pending">Sketching…</p>}
      {!busy && plan?.error && <p className="note warn">{plan.error}</p>}
      {!busy && plan && !plan.error && (
        <>
          <div className="plan-stats">
            <div><span className="ps-num">{plan.lots}</span><span>lots</span></div>
            <div><span className="ps-num">{fmt(plan.avgLotSf)}</span><span>avg sq ft</span></div>
            <div><span className="ps-num">{plan.split ? '—' : fmt(plan.streetLenFt)}</span><span>ft of street</span></div>
            <div><span className="ps-num">{plan.openAc.toFixed(1)}</span><span>open ac</span></div>
          </div>
          <p className="plan-detail">
            {plan.split
              ? `Lot split along the frontage: lots ${plan.lotWidthFt} ft wide using the full parcel depth.`
              : `${plan.lotWidthFt} × ${plan.lotDepthFt} ft lots on both sides of ${ROW_LABEL} streets, built to ${plan.district} standards.`}
            {plan.usableAc < plan.grossAc - 0.05 && ` ${(plan.grossAc - plan.usableAc).toFixed(1)} acres of floodplain left out.`}
            {plan.capped && ' Capped at the conservation subdivision maximum (gross acres ÷ minimum lot area).'}
          </p>
          <div className="plan-legend">
            <span><i className="lg lot" />Lots</span><span><i className="lg street" />Street</span><span><i className="lg open" />Stormwater / open space</span>{floodPolys?.length > 0 && <span><i className="lg flood" />Floodplain</span>}
          </div>
          <button className="btn" onClick={download}>Export KML</button>
          <p className="cite">Concept for gauging yield, not an engineered plan. Doesn't account for grading, tree save, stream buffers, driveway or street-connection rules, or exact road frontage.</p>
        </>
      )}
    </div>
  )
}

const ROW_LABEL = '50 ft right-of-way'
