import { useCallback, useEffect, useRef, useState } from 'react'
import * as turf from '@turf/turf'
import { neighborhoodKml, LOT_COLORS } from '../lib/neighborhood'
import { nearbyStreets } from '../lib/charlotte'
import { N1, CONSERVATION_DISTRICTS, CONSERVATION_MIN_ACRES, MIXED_INCOME_MIN_ACRES } from '../data/charlotteUdo'

const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })

/** Gentle curves for hand-drawn streets (Chaikin smoothing, endpoints kept). */
function smooth(pts, passes = 2) {
  let p = pts
  for (let k = 0; k < passes && p.length > 2; k++) {
    const out = [p[0]]
    for (let i = 0; i < p.length - 1; i++) {
      const [a, b] = [p[i], p[i + 1]]
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]])
    }
    out.push(p[p.length - 1])
    p = out
  }
  return p
}

/** Default lot mix: the district's minimum frontage plus two wider options. */
const defaultMix = (w) => [{ width: w, share: 50 }, { width: w + 20, share: 30 }, { width: w + 40, share: 20 }]

/**
 * Automatic neighborhood draft for a Charlotte N1 parcel. Draws on the map through onPlan.
 * floodPolys: floodplain shapes (null while the flood check runs).
 */
export default function NeighborhoodCard({ parcel, code, acres, floodPolys, floodFailed, onPlan, editor }) {
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
  const watchdog = useRef(null)
  const [stalled, setStalled] = useState(false)
  const [retry, setRetry] = useState(0)

  // ---- editor state ----
  const [edit, setEdit] = useState(null) // { streets: [{ id, kind, pts }], pond, depth } once the user edits
  const [removed, setRemoved] = useState([]) // centers of lots the user removed
  const [history, setHistory] = useState([])
  const [editing, setEditing] = useState(false)
  const [tool, setTool] = useState('select')
  const [selected, setSelected] = useState(null) // { street: id } | { lot: n }
  const [drawPts, setDrawPts] = useState([])
  const live = useRef({}) // latest values for map handlers
  live.current = { edit, removed, tool, drawPts, selected, plan }
  const nextId = useRef(1)

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
      clearTimeout(watchdog.current)
      const res = e.data.result
      if (res.network) {
        setEdit((cur) => {
          if (!cur) return cur
          let changed = false
          const streets = cur.streets.map((st, i) => {
            const got = res.network.streets[i]?.sideTypes
            if (!got || (st.sideTypes && st.sideTypes[-1] != null && st.sideTypes[1] != null)) return st
            changed = true
            return { ...st, sideTypes: got }
          })
          return changed ? { ...cur, streets } : cur
        })
      }
      setPlan(e.data.result)
      onPlan(e.data.result.geojson || null)
      setBusy(false)
    }
    return () => { clearTimeout(watchdog.current); worker.current?.terminate(); onPlan(null) }
  }, [onPlan, retry])

  // (re)draft when anything changes
  useEffect(() => {
    if (!open || floodPolys === null || streets === null) return
    setBusy(true)
    const t = setTimeout(() => {
      const id = ++lastId.current
      const cleanMix = mix.filter((m) => m.share > 0).map((m) => ({ width: Math.max(minWidth, Number(m.width) || minWidth), share: Number(m.share) }))
      const total = cleanMix.reduce((a, m) => a + m.share, 0) || 1
      const network = edit ? { streets: edit.streets.map(({ kind, pts, sideTypes }) => ({ kind, pts, sideTypes })), pond: edit.pond, depth: edit.depth } : null
      setStalled(false)
      clearTimeout(watchdog.current)
      // if the draft never comes back, stop waiting and offer a retry
      watchdog.current = setTimeout(() => { if (id === lastId.current) { setBusy(false); setStalled(true) } }, 45000)
      worker.current.postMessage({
        id, parcel,
        opts: { code, mode, mix: cleanMix.map((m) => ({ ...m, share: (m.share / total) * 100 })), reservePct: reserve, floodPolys, streets, variant, network, removed },
      })
    }, edit ? 150 : 300)
    return () => clearTimeout(t)
  }, [open, mode, mix, reserve, variant, floodPolys, streets, parcel, code, minWidth, edit, removed, retry])

  // ---- editor actions ----
  const commit = useCallback((nextEdit, nextRemoved) => {
    setHistory((h) => [...h.slice(-30), { edit: live.current.edit, removed: live.current.removed }])
    if (nextEdit !== undefined) setEdit(nextEdit)
    if (nextRemoved !== undefined) setRemoved(nextRemoved)
    setSelected(null)
  }, [])
  // when lot sizes are added or removed, the remembered per-street sizes no longer line up
  const clearSizes = () => setEdit((cur) => (cur ? { ...cur, streets: cur.streets.map(({ sideTypes, ...st }) => st) } : cur))
  const startEditing = () => {
    if (!edit && plan?.network) {
      setEdit({ ...plan.network, streets: plan.network.streets.map((st) => ({ ...st, id: nextId.current++ })) })
    }
    setEditing(true)
    setTool('select')
  }
  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h
      const last = h[h.length - 1]
      setEdit(last.edit); setRemoved(last.removed); setSelected(null)
      return h.slice(0, -1)
    })
  }
  const deleteSelected = useCallback(() => {
    const { selected: sel, edit: e, removed: rem, plan: pl } = live.current
    if (!sel || !e) return
    if (sel.street != null) commit({ ...e, streets: e.streets.filter((st) => st.id !== sel.street) })
    else if (sel.lot != null) {
      const lot = pl?.geojson.features.find((f) => f.properties.kind === 'lot' && f.properties.n === sel.lot)
      if (lot) commit(undefined, [...rem, turf.pointOnFeature(lot).geometry.coordinates])
    }
  }, [commit])
  const snap = (ll) => {
    // start or end near an existing street: join it
    let best = null
    for (const st of live.current.edit?.streets || []) {
      const np = turf.nearestPointOnLine(turf.lineString(st.pts), ll, { units: 'feet' })
      if (np.properties.dist < 40 && (!best || np.properties.dist < best.d)) best = { d: np.properties.dist, p: np.geometry.coordinates }
    }
    return best ? best.p : ll
  }
  const finishDrawing = useCallback(() => {
    const pts = live.current.drawPts.filter((p, i, a) => i === 0 || turf.distance(p, a[i - 1], { units: 'feet' }) > 5)
    setDrawPts([])
    if (pts.length < 2) return
    pts[pts.length - 1] = snap(pts[pts.length - 1])
    const e = live.current.edit
    commit({ ...e, streets: [...e.streets, { id: nextId.current++, kind: 'user', pts: smooth(pts) }] })
  }, [commit])

  // map handlers while editing
  useEffect(() => {
    if (!editing || !editor) return
    editor.register({
      click: (ev) => {
        const ll = [ev.lngLat.lng, ev.lngLat.lat]
        if (live.current.tool === 'draw') {
          setDrawPts((d) => [...d, d.length === 0 ? snap(ll) : ll])
        } else {
          const hit = editor.pick(ev.point)
          setSelected(hit)
        }
      },
      dblclick: () => { if (live.current.tool === 'draw') finishDrawing() },
      move: (ev) => { if (live.current.tool === 'draw' && live.current.drawPts.length) setCursor([ev.lngLat.lng, ev.lngLat.lat]) },
    })
    const onKey = (ev) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return
      if (ev.key === 'Enter') finishDrawing()
      else if (ev.key === 'Escape') { setDrawPts([]); setSelected(null) }
      else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); deleteSelected() }
      else if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z') { ev.preventDefault(); undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); editor.register(null) }
  }, [editing, editor, finishDrawing, deleteSelected])

  // draw the editable overlay: street centerlines, selection, drawing preview
  const [cursor, setCursor] = useState(null)
  useEffect(() => {
    if (!editing || !editor) return
    const streetsFc = turf.featureCollection((edit?.streets || []).map((st) => turf.lineString(st.pts, { id: st.id, selected: selected?.street === st.id })))
    const draw = []
    const line = cursor && tool === 'draw' && drawPts.length ? [...drawPts, cursor] : drawPts
    if (line.length >= 2) draw.push(turf.lineString(line, { kind: 'draw' }))
    for (const p of drawPts) draw.push(turf.point(p, { kind: 'vertex' }))
    if (selected?.lot != null) {
      const lot = plan?.geojson?.features.find((f) => f.properties.kind === 'lot' && f.properties.n === selected.lot)
      if (lot) draw.push(turf.feature(turf.polygonToLine(lot).geometry, { kind: 'lot-sel' }))
    }
    editor.setOverlay({ streets: streetsFc, draw: turf.featureCollection(draw) })
  }, [editing, editor, edit, selected, drawPts, cursor, tool, plan])

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
        <button className="link-btn" onClick={() => { setEditing(false); setOpen(false); setPlan(null); onPlan(null) }}>Hide draft</button>
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
            {mix.length > 1 && <button className="mix-x" onClick={() => { setMix((r) => r.filter((_, j) => j !== i)); clearSizes() }} aria-label={`Remove lot type ${i + 1}`}>×</button>}
          </div>
        ))}
        {mix.length < 3 && <button className="link-btn" onClick={() => { setMix((r) => [...r, { width: (r[r.length - 1]?.width || minWidth) + 20, share: 20 }]); clearSizes() }}>+ Add lot size</button>}
        <p className="muted-small">Minimum frontage here is {minWidth} ft. Lot depth is fitted to the site, and lots widen where needed to meet the {fmt(mode === 'conservation' ? std.minLotSf / 2 : active.minLotSf)} sq ft minimum.</p>
      </div>

      <label className="slider">
        <span>Stormwater pond <strong>{reserve}%</strong> of buildable land{edit ? ' (fixed while editing)' : ''}</span>
        <input type="range" min={0} max={20} step={1} value={reserve} disabled={!!edit} onChange={(e) => setReserve(Number(e.target.value))} />
      </label>

      {editing && (
        <div className="editor-box">
          <div className="seg" role="group" aria-label="Editing tool">
            <button className={tool === 'select' ? 'on' : ''} onClick={() => { setTool('select'); setDrawPts([]) }} aria-pressed={tool === 'select'}>Select</button>
            <button className={tool === 'draw' ? 'on' : ''} onClick={() => { setTool('draw'); setSelected(null) }} aria-pressed={tool === 'draw'}>Draw street</button>
          </div>
          <p className="muted-small">
            {tool === 'draw'
              ? drawPts.length ? 'Click to add points. Double-click or press Enter to finish, Esc to cancel. Ending near a street connects to it.' : 'Click on the map to start a street. Starting near an existing street connects to it.'
              : selected ? `${selected.street != null ? 'Street' : `Lot ${selected.lot}`} selected. Press Delete or use the button to remove it.` : 'Click a street or lot to select it.'}
          </p>
          <div className="nb-actions">
            {tool === 'draw' && drawPts.length >= 2 && <button className="btn btn-primary" onClick={finishDrawing}>Finish street</button>}
            <button className="btn" onClick={deleteSelected} disabled={!selected}>Remove {selected?.street != null ? 'street' : selected?.lot != null ? 'lot' : 'selected'}</button>
            <button className="btn" onClick={undo} disabled={!history.length}>Undo</button>
            <button className="btn" onClick={() => { setEditing(false); setDrawPts([]); setSelected(null) }}>Done editing</button>
          </div>
        </div>
      )}

      {floodPolys === null && <p className="pending">Waiting for the floodplain check…</p>}
      {floodFailed && <p className="note warn">FEMA's floodplain service didn't respond, so this draft doesn't remove floodplain.</p>}
      {busy && <p className="pending">{edit ? 'Refilling lots…' : 'Drafting the neighborhood…'}</p>}
      {stalled && !busy && (
        <p className="note warn">
          The draft is taking unusually long. <button className="link-btn" onClick={() => { setStalled(false); setRetry((n) => n + 1) }}>Try again</button>
        </p>
      )}
      {!busy && plan?.error && <p className="note warn">{plan.error}</p>}

      {(!busy || edit) && ok && (
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
            {!editing && <button className="btn btn-primary" onClick={startEditing}>{edit ? 'Keep editing' : 'Edit layout'}</button>}
            {!edit && plan.variants > 1 && <button className="btn" onClick={() => setVariant((v) => (v + 1) % plan.variants)}>Try another layout ({variant + 1} of {plan.variants})</button>}
            {edit && <button className="btn" onClick={() => { setEditing(false); setEdit(null); setRemoved([]); setHistory([]); setSelected(null) }}>Back to automatic draft</button>}
            <button className="btn" onClick={download}>Export KML</button>
          </div>
          <p className="cite">Automatic draft for gauging yield and layout, not an engineered plan. The pond is placed by layout, not by terrain, and grading, tree save, stream buffers, and driveway rules aren't modeled.</p>
        </>
      )}
    </div>
  )
}
