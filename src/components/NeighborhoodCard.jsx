import { useEffect, useRef, useState } from 'react'
import { neighborhoodKml, LOT_COLORS } from '../lib/neighborhood'
import { nearbyStreets } from '../lib/charlotte'
import { N1, CONSERVATION_DISTRICTS, CONSERVATION_MIN_ACRES, MIXED_INCOME_MIN_ACRES } from '../data/charlotteUdo'

const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })

/** Default lot mix: the district's minimum frontage plus two wider options. */
const defaultMix = (w) => [{ width: w, share: 50 }, { width: w + 20, share: 30 }, { width: w + 40, share: 20 }]

/**
 * Automatic neighborhood draft for a Charlotte N1 parcel. Draws on the map through onPlan.
 * floodPolys: floodplain shapes (null while the flood check runs).
 */
export default function NeighborhoodCard({ parcel, code, acres, floodPolys, floodFailed, onPlan }) {
  const std = N1[code]
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('standard')
  const [mix, setMix] = useState(() => defaultMix(std?.minWidthFt || 50))
  const [reserve, setReserve] = useState(8)
  const [variant, setVariant] = useState(0)
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(false)
  const [streets, setStreets] = useState(null)
  const worker = useRef(null)
  const lastId = useRef(0)

  const modes = [
    { id: 'standard', label: 'Standard' },
    CONSERVATION_DISTRICTS.includes(code) && acres >= CONSERVATION_MIN_ACRES && { id: 'conservation', label: 'Conservation' },
    std?.bonusTo && acres >= MIXED_INCOME_MIN_ACRES && { id: 'bonus', label: `Mixed-income (${std.bonusTo})` },
  ].filter(Boolean)
  const active = mode === 'bonus' ? N1[std.bonusTo] : std
  const minWidth = mode === 'conservation' ? 40 : active.minWidthFt

  // existing streets around the parcel, for the entrance
  useEffect(() => {
    if (!open || streets) return
    nearbyStreets(parcel).then(setStreets).catch(() => setStreets([]))
  }, [open, streets, parcel])

  // background worker
  useEffect(() => {
    worker.current = new Worker(new URL('../lib/draftWorker.js', import.meta.url), { type: 'module' })
    worker.current.onmessage = (e) => {
      if (e.data.id !== lastId.current) return // an older request finished late
      setPlan(e.data.result)
      onPlan(e.data.result.geojson || null)
      setBusy(false)
    }
    return () => { worker.current?.terminate(); onPlan(null) }
  }, [onPlan])

  // (re)draft when anything changes
  useEffect(() => {
    if (!open || floodPolys === null || streets === null) return
    setBusy(true)
    const t = setTimeout(() => {
      const id = ++lastId.current
      const cleanMix = mix.filter((m) => m.share > 0).map((m) => ({ width: Math.max(minWidth, Number(m.width) || minWidth), share: Number(m.share) }))
      const total = cleanMix.reduce((a, m) => a + m.share, 0) || 1
      worker.current.postMessage({
        id, parcel,
        opts: { code, mode, mix: cleanMix.map((m) => ({ ...m, share: (m.share / total) * 100 })), reservePct: reserve, floodPolys, streets, variant },
      })
    }, 300)
    return () => clearTimeout(t)
  }, [open, mode, mix, reserve, variant, floodPolys, streets, parcel, code, minWidth])

  if (!std) return null
  if (!open) return <button className="btn btn-primary sketch-btn" onClick={() => setOpen(true)}>Draft a neighborhood</button>

  const setMixRow = (i, k, v) => setMix((m) => m.map((row, j) => (j === i ? { ...row, [k]: v } : row)))
  const download = () => {
    const blob = new Blob([neighborhoodKml(plan, `Groundwork draft · ${parcel.properties.address || parcel.properties.id}`)], { type: 'application/vnd.google-earth.kml+xml' })
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: `groundwork-neighborhood-${parcel.properties.id}.kml` }).click()
    URL.revokeObjectURL(url)
  }
  const ok = plan && !plan.error

  return (
    <div className="siteplan">
      <div className="siteplan-head">
        <strong>Neighborhood draft</strong>
        <button className="link-btn" onClick={() => { setOpen(false); setPlan(null); onPlan(null) }}>Hide draft</button>
      </div>

      {modes.length > 1 && (
        <div className="seg" role="group" aria-label="Layout type">
          {modes.map((m) => <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)} aria-pressed={mode === m.id}>{m.label}</button>)}
        </div>
      )}

      <div className="mix-editor">
        <div className="mix-head"><span>Lot mix (frontage width)</span><span>Share</span></div>
        {mix.map((m, i) => (
          <div key={i} className="mix-row">
            <i className="dot" style={{ background: LOT_COLORS[i] }} aria-hidden="true" />
            <label className="sr-only" htmlFor={`w${i}`}>Lot type {i + 1} width in feet</label>
            <input id={`w${i}`} type="number" min={minWidth} step={5} value={m.width} onChange={(e) => setMixRow(i, 'width', e.target.value)} />
            <span className="unit">ft</span>
            <label className="sr-only" htmlFor={`s${i}`}>Lot type {i + 1} share in percent</label>
            <input id={`s${i}`} type="number" min={0} max={100} step={5} value={m.share} onChange={(e) => setMixRow(i, 'share', e.target.value)} />
            <span className="unit">%</span>
            {mix.length > 1 && <button className="mix-x" onClick={() => setMix((r) => r.filter((_, j) => j !== i))} aria-label={`Remove lot type ${i + 1}`}>×</button>}
          </div>
        ))}
        {mix.length < 3 && <button className="link-btn" onClick={() => setMix((r) => [...r, { width: (r[r.length - 1]?.width || minWidth) + 20, share: 20 }])}>+ Add lot size</button>}
        <p className="muted-small">Minimum frontage here is {minWidth} ft. Lot depth is fitted to the site, and lots widen where needed to meet the {fmt(mode === 'conservation' ? std.minLotSf / 2 : active.minLotSf)} sq ft minimum.</p>
      </div>

      <label className="slider">
        <span>Stormwater pond <strong>{reserve}%</strong> of buildable land</span>
        <input type="range" min={0} max={20} step={1} value={reserve} onChange={(e) => setReserve(Number(e.target.value))} />
      </label>

      {floodPolys === null && <p className="pending">Waiting for the floodplain check…</p>}
      {floodFailed && <p className="note warn">FEMA's floodplain service didn't respond, so this draft doesn't remove floodplain.</p>}
      {busy && <p className="pending">Drafting the neighborhood…</p>}
      {!busy && plan?.error && <p className="note warn">{plan.error}</p>}

      {!busy && ok && (
        <>
          <div className="nb-total">
            <span className="nb-lots">{plan.lots}</span><span className="nb-unit">lots</span>
            <span className={`pass ${plan.pass ? 'yes' : 'no'}`}>{plan.pass ? 'PASS' : 'CHECK'}</span>
          </div>
          <p className="nb-density">
            Density {fmt(plan.density, 2)} lots / acre · every lot meets the {plan.district} minimum{plan.capped ? ' · at the conservation maximum' : ''}
            {plan.spurs > 0 && <> · {plan.spurs} cul-de-sac{plan.spurs > 1 ? 's' : ''} added to reach leftover land</>}
            {plan.absorbedAc >= 0.1 && <> · {fmt(plan.absorbedAc, 1)} ac of edge strips added to neighboring lots</>}
          </p>

          <div className="mix-bar" aria-hidden="true">
            {plan.counts.filter((c) => c.lots).map((c) => <span key={c.i} style={{ background: c.color, flex: c.lots }} />)}
          </div>
          <ul className="mix-list">
            {plan.counts.filter((c) => c.lots).map((c) => (
              <li key={c.i}><i className="dot" style={{ background: c.color }} />{c.width} × {c.depth}<span>{Math.round((c.lots / plan.lots) * 100)}%</span><strong>{c.lots} lots</strong></li>
            ))}
          </ul>

          <dl className="nb-stats">
            <dt>Total area</dt><dd>{fmt(plan.totalAc, 2)} ac</dd>
            <dt>Net buildable</dt><dd>{fmt(plan.netBuildableAc, 2)} ac</dd>
            <dt className="dim">Unbuildable (floodplain)</dt><dd className="dim">{fmt(plan.unbuildableAc, 2)} ac</dd>
            <dt>Road length</dt><dd>{fmt(plan.roadLenFt)} ft</dd>
            <dt>Road area</dt><dd>{fmt(plan.roadAc, 2)} ac</dd>
            <dt>Pond</dt><dd>{fmt(plan.pondAc, 2)} ac</dd>
            <dt>Green space</dt><dd>{fmt(plan.greenAc, 2)} ac</dd>
            <dt>Open space</dt><dd>{fmt(plan.openPct, 1)}%</dd>
          </dl>

          <div className="nb-actions">
            {plan.variants > 1 && <button className="btn" onClick={() => setVariant((v) => (v + 1) % plan.variants)}>Try another layout ({variant + 1} of {plan.variants})</button>}
            <button className="btn" onClick={download}>Export KML</button>
          </div>
          <p className="cite">Automatic draft for gauging yield and layout, not an engineered plan. The pond is placed by layout, not by terrain, and grading, tree save, stream buffers, and driveway rules aren't modeled.</p>
        </>
      )}
    </div>
  )
}
