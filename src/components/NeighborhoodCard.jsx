import { useCallback, useEffect, useRef, useState } from 'react'
import * as turf from '@turf/turf'
import { neighborhoodKml, LOT_COLORS } from '../lib/neighborhood'
import { nearbyStreets } from '../lib/charlotte'
import { tigerStreets } from '../lib/indianTrail'
import { RULES as N1, jurisdictionOf, CONSERVATION_DISTRICTS, CONSERVATION_MIN_ACRES, MIXED_INCOME_MIN_ACRES, HOUSING, LOT_HOUSING, unitsFor, housingAllowed, FRONT_SETBACK_ASSUMED, MIN_HOUSE_DEPTH, upzoneOptions, TOWNHOME, APARTMENT } from '../data/charlotteUdo'
import { usePlans, savePlan, getPlan, renamePlan, duplicatePlan, deletePlan } from '../lib/planStore'
import { handlesFor, softDrag, pxToSegment, feetAlong, ringOf, polygonOf } from '../lib/editHandles'
import ApprovalContext from './ApprovalContext'
import { districtLabel as dl } from '../data/towns'

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

/** Rounded outline for hand-drawn ponds (Chaikin smoothing on a closed ring). */
function smoothRing(pts, passes = 3) {
  let p = pts
  for (let k = 0; k < passes; k++) {
    const out = []
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length]
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]])
    }
    p = out
  }
  return p
}
// move every coordinate of a shape by a lon/lat offset
const shiftGeom = (geom, dx, dy) => JSON.parse(JSON.stringify(geom), (k, v) => (Array.isArray(v) && typeof v[0] === 'number' ? [v[0] + dx, v[1] + dy] : v))
const SQFT_PER_M2 = 10.7639

/** Default lot mix: the district's minimum frontage plus two wider options. */
const defaultMix = (w) => [{ width: w, share: 50 }, { width: w + 20, share: 30 }, { width: w + 40, share: 20 }]

/**
 * Automatic neighborhood draft for a Charlotte N1 parcel. Draws on the map through onPlan.
 * floodPolys: floodplain shapes (null while the flood check runs).
 */
export default function NeighborhoodCard({ parcel, parts, code: zonedCode, placeType, acres, floodPolys, floodFailed, onPlan, editor, openPlanId, onPlanOpened, onSummary }) {
  // A rezoning scenario drafts under another district's rules; everything below uses the effective district.
  const [scenario, setScenario] = useState(null)
  const [scenarioCode, scenarioForm] = (scenario || '').split('|')
  const code = scenarioCode || zonedCode
  const scenarioLabel = scenario ? `${dl(scenarioCode)}${scenarioForm === 'apt' ? ' (apartments)' : ''}` : null
  const zonedLabel = dl(zonedCode) // what people see (Mint Hill's keys carry a town prefix)
  const std = N1[code]
  const town = jurisdictionOf(zonedCode) // 'Charlotte' or 'Indian Trail'
  const townhomes = !!std?.townhome // N2-A scenarios draft townhome buildings on sublots
  const apartments = !!std?.apartment || scenarioForm === 'apt' // N2-B, MFR, or a district's apartment form
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
  live.current = { edit, removed, tool, drawPts, selected, plan, parcel }
  const nextId = useRef(1)
  const [housing, setHousing] = useState('sf')
  const [thOpts, setThOpts] = useState({ unitW: TOWNHOME.unitW, maxPerBldg: TOWNHOME.maxPerBldg, style: 'front' }) // townhome scenarios
  const [aptOpts, setAptOpts] = useState({ stories: APARTMENT.stories, unitSf: APARTMENT.unitSf, parkRatio: APARTMENT.parkRatio }) // apartment scenarios // what the lots hold: single-family, duplex, triplex, a mix, or (not by right) townhomes/apartments

  // ---- saved plans ----
  const parcelId = parcel.properties.id
  const plans = usePlans(parcelId)
  const [current, setCurrent] = useState(null) // { id, name, description, key } of the plan that's open
  const [form, setForm] = useState(null) // { as: 'new' | 'rename', id?, name, description }
  const [saveError, setSaveError] = useState(null)
  const snapshot = () => ({ settings: { mode, mix, reserve, variant, housing, scenario, th: thOpts, apt: aptOpts }, edit, removed })
  // compare plans without remembered lot sizes, which fill in on their own after a refill
  const keyOf = (snap) => JSON.stringify(snap, (k, v) => (k === 'sideTypes' ? undefined : v))
  const dirty = current && keyOf(snapshot()) !== current.key

  const applyPlan = (p) => {
    setMode(p.settings.mode); setMix(p.settings.mix); setReserve(p.settings.reserve); setVariant(p.settings.variant || 0); setHousing(p.settings.housing || 'sf'); setScenario(p.settings.scenario || null); if (p.settings.th) setThOpts(p.settings.th); if (p.settings.apt) setAptOpts(p.settings.apt)
    const e = p.edit ? { ...p.edit, streets: p.edit.streets.map((st) => ({ ...st, id: st.id ?? nextId.current++ })) } : null
    if (e) nextId.current = Math.max(nextId.current, ...e.streets.map((st) => (typeof st.id === 'number' ? st.id + 1 : 1)))
    setEdit(e); setRemoved(p.removed || []); setHistory([]); setSelected(null); setEditing(false); setOpen(true)
    setCurrent({ id: p.id, name: p.name, description: p.description, key: keyOf({ settings: p.settings, edit: e, removed: p.removed || [] }) })
  }
  const openPlan = async (id) => { const p = await getPlan(id); if (p) applyPlan(p) }
  // opened from the Saved menu
  useEffect(() => {
    if (!openPlanId) return
    openPlan(openPlanId).then(() => onPlanOpened?.())
  }, [openPlanId]) // eslint-disable-line react-hooks/exhaustive-deps

  const submitForm = async () => {
    setSaveError(null)
    const name = form.name.trim() || `Plan ${plans.length + 1}`
    try {
      if (form.as === 'rename') {
        await renamePlan(form.id, name, form.description)
        if (current?.id === form.id) setCurrent({ ...current, name, description: form.description })
      } else {
        const snap = snapshot()
        const saved = await savePlan({
          id: form.as === 'update' ? current.id : undefined,
          name, description: form.description,
          parcel: { id: parcelId, county: parcel.properties.county, address: parcel.properties.address, feature: parcel, ...(parts ? { parts } : {}) },
          ...snap,
          summary: plan && !plan.error ? { lots: plan.lots, pass: plan.pass, district: plan.district, acres: plan.totalAc } : null,
        })
        setCurrent({ id: saved.id, name: saved.name, description: saved.description, key: keyOf(snap) })
      }
      setForm(null)
    } catch (e) { setSaveError(e.message) }
  }
  const quickSave = () => setForm({ as: 'update', name: current.name, description: current.description || '' })
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  const savedList = plans.length > 0 && (
    <div className="plans">
      <div className="plans-head">Saved plans for this parcel</div>
      <ul>
        {plans.map((p) => (
          <li key={p.id} className={current?.id === p.id ? 'on' : ''}>
            <button className="plan-open" onClick={() => applyPlan(p)} title="Open this plan">
              <strong>{p.name}</strong>
              <span>{[p.summary && `${p.summary.lots} lots`, p.edit && 'edited', `saved ${fmtDate(p.updated)}`].filter(Boolean).join(' · ')}</span>
            </button>
            <span className="plan-actions">
              <button className="link-btn" onClick={() => setForm({ as: 'rename', id: p.id, name: p.name, description: p.description || '' })}>Rename</button>
              <button className="link-btn" onClick={() => duplicatePlan(p.id)}>Duplicate</button>
              <button className="link-btn danger" onClick={() => { if (window.confirm(`Delete "${p.name}"? This can't be undone.`)) { deletePlan(p.id); if (current?.id === p.id) setCurrent(null) } }}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )

  const saveForm = form && (
    <div className="plan-form">
      <label>
        <span>{form.as === 'rename' ? 'Rename plan' : form.as === 'update' ? 'Save changes to' : 'Plan name'}</span>
        <input autoFocus value={form.name} placeholder={`Plan ${plans.length + 1}`} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && submitForm()} />
      </label>
      <label>
        <span>Description (optional)</span>
        <textarea rows={2} value={form.description} placeholder="e.g. 90 ft lots with a central park" onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>
      {saveError && <p className="note warn">{saveError}</p>}
      <div className="nb-actions">
        <button className="btn btn-primary" onClick={submitForm}>{form.as === 'rename' ? 'Rename' : 'Save'}</button>
        <button className="btn" onClick={() => { setForm(null); setSaveError(null) }}>Cancel</button>
      </div>
      <p className="muted-small">Plans are saved in this browser on this computer.</p>
    </div>
  )
  const dragRef = useRef(null)
  const [dragGeom, setDragGeom] = useState(null) // outline preview while dragging
  const [dragShape, setDragShape] = useState(null) // { kind, pts, ring } while a handle is dragged
  const dragEndedAt = useRef(-1e9) // when the last drag ended, so its mouse-up isn't taken as a click
  const [lotDrag, setLotDrag] = useState(null) // { coords, a, b, wa, wb, minW } while a lot line is dragged

  const modes = [
    { id: 'standard', label: 'Standard' },
    CONSERVATION_DISTRICTS.includes(code) && acres >= CONSERVATION_MIN_ACRES && { id: 'conservation', label: 'Conservation' },
    std?.bonusTo && acres >= MIXED_INCOME_MIN_ACRES && { id: 'bonus', label: `Mixed-income (${std.bonusTo})` },
  ].filter(Boolean)
  const active = mode === 'bonus' ? N1[std.bonusTo] : std
  const minWidth = mode === 'conservation' ? 40 : active.minWidthFt
  live.current.minWidth = minWidth // the map handlers need it for lot-line limits

  // existing streets around the parcel, for the entrance
  useEffect(() => {
    if (!open || streets) return
    ;(town === 'Charlotte' ? nearbyStreets : tigerStreets)(parcel).then(setStreets).catch(() => setStreets([]))
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
      const network = edit ? { streets: edit.streets.map(({ id, kind, pts, sideTypes, sideCuts, lotFrom }) => ({ id, kind, pts, sideTypes, sideCuts, lotFrom })), ponds: edit.ponds, parks: edit.parks, depth: edit.depth } : null
      const site = edit?.boundary ? turf.feature(edit.boundary, parcel.properties) : parcel // a dragged boundary replaces the parcel shape
      setStalled(false)
      clearTimeout(watchdog.current)
      // if the draft never comes back, stop waiting and offer a retry
      watchdog.current = setTimeout(() => { if (id === lastId.current) { setBusy(false); setStalled(true) } }, 45000)
      worker.current.postMessage({
        id, parcel: site,
        opts: {
          code, mode, reservePct: reserve, floodPolys, streets, variant, network, removed,
          mix: townhomes ? [{ width: thOpts.unitW, share: 100 }] : cleanMix.map((m) => ({ ...m, share: (m.share / total) * 100 })),
          ...(townhomes ? { product: 'townhomes', th: { unitW: thOpts.unitW, maxPerBldg: thOpts.maxPerBldg, style: thOpts.style } } : {}),
          ...(apartments ? { product: 'apartments', apt: aptOpts } : {}),
        },
      })
    }, edit ? 150 : 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, mix, reserve, variant, floodPolys, streets, parcel, code, minWidth, edit, removed, retry, thOpts, aptOpts])

  // ---- by-right baseline while a rezoning scenario is shown ----
  const [baseline, setBaseline] = useState(null) // { lots } for the parcel as zoned
  const [approval, setApproval] = useState(null) // approval-context factors, for the site report
  const baseWorker = useRef(null)
  useEffect(() => {
    if (!scenario || !open || floodPolys === null || streets === null) { setBaseline(null); return }
    if (!baseWorker.current) {
      baseWorker.current = new Worker(new URL('../lib/draftWorker.js', import.meta.url), { type: 'module' })
    }
    const id = Date.now()
    baseWorker.current.onmessage = (e) => { if (e.data.id === id) setBaseline(e.data.result?.error ? { error: true } : { lots: e.data.result.lots }) }
    setBaseline(null)
    const bm = defaultMix(N1[zonedCode].minWidthFt), tot = bm.reduce((a, m) => a + m.share, 0)
    baseWorker.current.postMessage({ id, parcel, opts: { code: zonedCode, mode: 'standard', mix: bm.map((m) => ({ ...m, share: (m.share / tot) * 100 })), reservePct: reserve, floodPolys, streets, variant: 0, network: null, removed: [] } })
  }, [scenario, open, floodPolys, streets, parcel, zonedCode, reserve])
  useEffect(() => () => baseWorker.current?.terminate(), [])

  // switching the district resets lot sizes to the new district's defaults
  const changeScenario = (next) => {
    const [nc, form] = (next || '').split('|')
    const nextCode = nc || zonedCode
    setScenario(next || null)
    if (N1[nextCode].townhome) { setHousing('townhomes'); setMix([{ width: TOWNHOME.unitW, share: 100 }]) }
    else if (N1[nextCode].apartment || form === 'apt') { setHousing('apartments'); setMix([{ width: TOWNHOME.unitW, share: 100 }]) }
    else { if (housing === 'townhomes' || housing === 'apartments') setHousing('sf'); setMix(defaultMix(N1[nextCode].minWidthFt)) }
    setEdit((cur) => (cur ? { ...cur, streets: cur.streets.map(({ sideTypes, sideCuts, ...st }) => st) } : cur))
    if (mode === 'conservation' && !CONSERVATION_DISTRICTS.includes(nextCode)) setMode('standard')
    if (mode === 'bonus' && !N1[nextCode].bonusTo) setMode('standard')
    setVariant(0)
  }

  // ---- editor actions ----
  const commit = useCallback((nextEdit, nextRemoved) => {
    setHistory((h) => [...h.slice(-30), { edit: live.current.edit, removed: live.current.removed }])
    if (nextEdit !== undefined) setEdit(nextEdit)
    if (nextRemoved !== undefined) setRemoved(nextRemoved)
    setSelected(null)
  }, [])
  // when lot sizes are added or removed, the remembered per-street sizes no longer line up
  const clearSizes = () => setEdit((cur) => (cur ? { ...cur, streets: cur.streets.map(({ sideTypes, sideCuts, ...st }) => st) } : cur))
  // In the editor the slider resizes the selected pond (or the first one) around its center.
  const resizePond = (pct) => {
    setReserve(pct)
    const e = live.current.edit, pl = live.current.plan
    if (!e || !e.ponds?.length || !pl?.netBuildableAc) return
    const id = live.current.selected?.pond ?? e.ponds[0].id
    const target = (pct / 100) * pl.netBuildableAc * 43560
    setEdit({
      ...e,
      ponds: e.ponds.map((x) => {
        if (x.id !== id) return x
        const cur = turf.area(turf.feature(x.geom)) * SQFT_PER_M2
        if (!cur) return x
        return { ...x, geom: turf.transformScale(turf.feature(x.geom), Math.sqrt(target / cur)).geometry }
      }),
    })
  }
  const startEditing = () => {
    if (!edit && plan?.network) {
      setEdit({ ...plan.network, streets: plan.network.streets.map((st) => ({ ...st, id: nextId.current++ })), ponds: plan.network.ponds || [], parks: plan.network.parks || [] })
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
    else if (sel.pond != null) commit({ ...e, ponds: e.ponds.filter((x) => x.id !== sel.pond) })
    else if (sel.park != null) commit({ ...e, parks: e.parks.filter((x) => x.id !== sel.park) })
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
    const e = live.current.edit
    const t = live.current.tool
    if (t === 'pond' || t === 'park') {
      if (pts.length < 3) return
      const ring = t === 'pond' ? smoothRing(pts) : pts
      const geom = { type: 'Polygon', coordinates: [[...ring, ring[0]]] }
      const key = t === 'pond' ? 'ponds' : 'parks'
      commit({ ...e, [key]: [...(e[key] || []), { id: `${t[0]}${nextId.current++}`, geom }] })
      return
    }
    if (pts.length < 2) return
    pts[pts.length - 1] = snap(pts[pts.length - 1])
    commit({ ...e, streets: [...e.streets, { id: nextId.current++, kind: 'user', pts: smooth(pts) }] })
  }, [commit])

  // what has handles right now: the site boundary (Boundary tool), or the selected street, pond, or park
  const handleTarget = () => {
    const { selected: sel, edit: e, tool: t, parcel: pc } = live.current
    if (!e) return null
    if (t === 'boundary') {
      const pts = ringOf(e.boundary || pc.geometry)
      return { kind: 'boundary', pts, ring: true, ...handlesFor(pts, { ring: true, corners: true }) }
    }
    if (t !== 'select' || !sel) return null
    if (sel.street != null) {
      const st = e.streets.find((x) => x.id === sel.street)
      return st ? { kind: 'street', id: st.id, pts: st.pts, ring: false, ...handlesFor(st.pts, { max: 8 }) } : null
    }
    const key = sel.pond != null ? 'ponds' : sel.park != null ? 'parks' : null
    const item = key && e[key]?.find((x) => x.id === (sel.pond ?? sel.park))
    if (!item) return null
    const pts = ringOf(item.geom)
    return { kind: key, id: item.id, pts, ring: true, ...handlesFor(pts, { ring: true, max: key === 'parks' ? 24 : 10 }) }
  }

  // map handlers while editing
  useEffect(() => {
    if (!editing || !editor) return
    editor.register({
      click: (ev) => {
        // the end of a drag isn't a click; the map usually skips the click after a drag, so this only
        // ignores clicks within a moment of a drag ending (a stale flag would swallow the next real click)
        if (performance.now() - dragEndedAt.current < 250) return
        dragRef.current = null
        const ll = [ev.lngLat.lng, ev.lngLat.lat]
        const t = live.current.tool
        if (t === 'draw') setDrawPts((d) => [...d, d.length === 0 ? snap(ll) : ll])
        else if (t === 'pond' || t === 'park') setDrawPts((d) => [...d, ll])
        else setSelected(editor.pick(ev.point))
      },
      dblclick: () => { if (live.current.tool !== 'select') finishDrawing() },
      move: (ev) => {
        const ll = [ev.lngLat.lng, ev.lngLat.lat]
        const dr = dragRef.current
        if (dr?.type === 'handle') {
          dr.moved = true
          dr.pts = softDrag(dr.ht.pts, dr.k, [ll[0] - dr.start[0], ll[1] - dr.start[1]], dr.ht.radius, dr.ht.ring)
          setDragShape({ kind: dr.ht.kind, pts: dr.pts, ring: dr.ht.ring })
          return
        }
        if (dr?.type === 'lotline') {
          dr.moved = true
          const t = dr.lo >= dr.hi ? dr.L.t : Math.min(dr.hi, Math.max(dr.lo, feetAlong(dr.line, ll) * dr.scale))
          dr.t = t
          // slide the line along the street to the new spot
          const at = (x) => turf.along(turf.lineString(dr.line), x / dr.scale, { units: 'feet' }).geometry.coordinates
          const p0 = at(dr.L.t), p1 = at(t), shift = [p1[0] - p0[0], p1[1] - p0[1]]
          const [A0] = dr.cuts[dr.ia], [, B1] = dr.cuts[dr.ia + 1]
          setLotDrag({ coords: dr.f.geometry.coordinates.map((c) => [c[0] + shift[0], c[1] + shift[1]]), a: dr.L.a, b: dr.L.b, wa: Math.round(t - A0), wb: Math.round(B1 - t), minW: dr.minW })
          return
        }
        if (dr) { dr.moved = true; setDragGeom(shiftGeom(dr.geom, ll[0] - dr.start[0], ll[1] - dr.start[1])); return }
        if (live.current.tool !== 'select' && live.current.drawPts.length) setCursor(ll)
      },
      // press a handle to reshape, a lot line to resize two lots, or the selected pond or park to move it
      mousedown: (ev) => {
        const sel = live.current.selected, e = live.current.edit
        const ll0 = [ev.lngLat.lng, ev.lngLat.lat]
        const ht = handleTarget()
        if (ht) {
          let best = null
          for (const k of ht.idx) {
            const q = editor.project(ht.pts[k]); if (!q) continue
            const d = Math.hypot(q.x - ev.point.x, q.y - ev.point.y)
            if (d < 11 && (!best || d < best.d)) best = { k, d }
          }
          if (best) { dragRef.current = { type: 'handle', ht, k: best.k, start: ll0, moved: false }; return true }
        }
        const pl = live.current.plan
        if (live.current.tool === 'select' && e && pl?.geojson && !sel?.pond && !sel?.park) {
          for (const f of pl.geojson.features) {
            if (f.properties.kind !== 'lot-line') continue
            const [c0, c1] = f.geometry.coordinates
            if (pxToSegment(ev.point, editor.project(c0), editor.project(c1)) > 6) continue
            const L = f.properties
            const st = e.streets.find((x) => x.id === L.sid)
            const side = pl.geojson.features.filter((x) => x.properties.kind === 'lot' && x.properties.sid === L.sid && x.properties.sgn === L.sgn).sort((x, y) => x.properties.t0 - y.properties.t0)
            const ia = side.findIndex((x) => Math.abs(x.properties.t1 - L.t) < 1)
            if (!st || ia < 0 || !side[ia + 1]) continue
            // The narrowest each lot can get: the district's minimum width, and enough frontage to keep the
            // minimum area. Real lots are clipped by curves and the boundary, so use each lot's own area per foot.
            const A = side[ia].properties, Bp = side[ia + 1].properties
            const minFor = (q) => Math.max(live.current.minWidth, Math.ceil((pl.minLotSf * 1.02) / (q.sf / Math.max(1, q.t1 - q.t0))))
            const minA = minFor(A), minB = minFor(Bp)
            // positions along the street are in the engine's units; scale map distances to match exactly
            const engineLen = pl.network?.streets?.find((x) => x.id === L.sid)?.len
            const mapLen = turf.length(turf.lineString(st.pts), { units: 'feet' })
            dragRef.current = {
              type: 'lotline', L, f, line: st.pts, cuts: side.map((x) => [x.properties.t0, x.properties.t1]), ia,
              lo: A.t0 + minA, hi: Bp.t1 - minB, t: L.t, minW: Math.max(minA, minB), moved: false,
              scale: engineLen && mapLen ? engineLen / mapLen : 1,
            }
            return true
          }
        }
        if (live.current.tool !== 'select' || !sel || !e) return false
        const key = sel.pond != null ? 'ponds' : sel.park != null ? 'parks' : null
        if (!key) return false
        const item = e[key].find((x) => x.id === (sel.pond ?? sel.park))
        const ll = [ev.lngLat.lng, ev.lngLat.lat]
        if (!item || !turf.booleanPointInPolygon(ll, item.geom)) return false
        dragRef.current = { key, id: item.id, geom: item.geom, start: ll, moved: false }
        return true
      },
      mouseup: (ev) => {
        const dr = dragRef.current
        dragRef.current = null
        setDragGeom(null); setDragShape(null); setLotDrag(null)
        if (!dr || !dr.moved) return
        dragEndedAt.current = performance.now()
        const ed = live.current.edit
        if (dr.type === 'handle' && dr.pts) {
          const { kind, id } = dr.ht
          if (kind === 'street') {
            // a reshaped street lays its lots out fresh
            commit({ ...ed, streets: ed.streets.map((st) => (st.id === id ? { ...st, pts: dr.pts, sideCuts: undefined, lotFrom: undefined } : st)) })
            setSelected({ street: id })
          } else if (kind === 'boundary') {
            commit({ ...ed, boundary: polygonOf(dr.pts) })
          } else {
            commit({ ...ed, [kind]: ed[kind].map((x) => (x.id === id ? { ...x, geom: polygonOf(dr.pts) } : x)) })
            setSelected({ [kind === 'ponds' ? 'pond' : 'park']: id })
          }
          return
        }
        if (dr.type === 'lotline') {
          if (Math.abs(dr.t - dr.L.t) < 0.5) return // ended where it started
          const cuts = dr.cuts.map((c) => [...c])
          cuts[dr.ia][1] = dr.t; cuts[dr.ia + 1][0] = dr.t
          commit({ ...ed, streets: ed.streets.map((st) => (st.id === dr.L.sid ? { ...st, sideCuts: { ...(st.sideCuts || {}), [dr.L.sgn]: cuts } } : st)) })
          return
        }
        const ll = [ev.lngLat.lng, ev.lngLat.lat]
        const e = live.current.edit
        const moved = shiftGeom(dr.geom, ll[0] - dr.start[0], ll[1] - dr.start[1])
        commit({ ...e, [dr.key]: e[dr.key].map((x) => (x.id === dr.id ? { ...x, geom: moved } : x)) })
        setSelected({ [dr.key === 'ponds' ? 'pond' : 'park']: dr.id })
      },
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
    const line = cursor && tool !== 'select' && drawPts.length ? [...drawPts, cursor] : [...drawPts]
    if ((tool === 'pond' || tool === 'park') && line.length >= 3) line.push(line[0]) // show the closed outline
    if (line.length >= 2) draw.push(turf.lineString(line, { kind: 'draw' }))
    const selShape = selected?.pond != null ? edit?.ponds?.find((x) => x.id === selected.pond) : selected?.park != null ? edit?.parks?.find((x) => x.id === selected.park) : null
    if (selShape) draw.push(turf.feature(turf.polygonToLine(turf.feature(dragGeom || selShape.geom)).geometry, { kind: 'lot-sel' }))
    for (const p of drawPts) draw.push(turf.point(p, { kind: 'vertex' }))
    if (selected?.lot != null) {
      const lot = plan?.geojson?.features.find((f) => f.properties.kind === 'lot' && f.properties.n === selected.lot)
      if (lot) draw.push(turf.feature(turf.polygonToLine(lot).geometry, { kind: 'lot-sel' }))
    }
    // the site boundary when it's being edited or has been
    if (tool === 'boundary' || edit?.boundary) {
      const ring = dragShape?.kind === 'boundary' ? dragShape.pts : ringOf(edit?.boundary || parcel.geometry)
      draw.push(turf.lineString([...ring, ring[0]], { kind: 'boundary' }))
    }
    // lot lines you can drag (shown faintly while selecting)
    if (tool === 'select' && !selected?.pond && !selected?.park) {
      for (const f of plan?.geojson?.features || []) if (f.properties.kind === 'lot-line') draw.push(turf.feature(f.geometry, { kind: 'lotline' }))
    }
    if (lotDrag) draw.push(turf.lineString(lotDrag.coords, { kind: 'lotline-active' }))
    // handles, and the reshaped outline while dragging one
    const ht = handleTarget()
    if (ht) {
      const pts = dragShape && dragShape.kind === ht.kind ? dragShape.pts : ht.pts
      if (dragShape && ht.kind !== 'boundary') draw.push(turf.lineString(ht.ring ? [...pts, pts[0]] : pts, { kind: 'lot-sel' }))
      for (const k of ht.idx) draw.push(turf.point(pts[k], { kind: 'handle', soft: ht.radius > 0 }))
    }
    editor.setOverlay({ streets: streetsFc, draw: turf.featureCollection(draw) })
  }, [editing, editor, edit, selected, drawPts, cursor, tool, plan, dragGeom, dragShape, lotDrag, parcel]) // eslint-disable-line react-hooks/exhaustive-deps

  const setMixRow = (i, k, v) => setMix((m) => m.map((row, j) => (j === i ? { ...row, [k]: v } : row)))

  // live measurement while drawing: street length, or a pond/park's outline area
  const measure = (() => {
    if (lotDrag) return `Lot ${lotDrag.a}: ${lotDrag.wa} ft · Lot ${lotDrag.b}: ${lotDrag.wb} ft (lots can’t go below ${lotDrag.minW} ft here)`
    if (dragShape?.kind === 'boundary') return `Site: ${fmt(turf.area(turf.polygon([[...dragShape.pts, dragShape.pts[0]]])) / 4046.86, 2)} ac`
    if (!editing || !drawPts.length || tool === 'select') return null
    const pts = cursor ? [...drawPts, cursor] : drawPts
    if (tool === 'draw') {
      if (pts.length < 2) return null
      const ft = turf.length(turf.lineString(pts), { units: 'feet' })
      const last = pts.length >= 2 ? turf.distance(pts[pts.length - 2], pts[pts.length - 1], { units: 'feet' }) : 0
      return `Street so far: ${fmt(ft)} ft · this segment ${fmt(last)} ft`
    }
    if (pts.length < 3) return pts.length === 2 ? `Side: ${fmt(turf.distance(pts[0], pts[1], { units: 'feet' }))} ft` : null
    const ac = turf.area(turf.polygon([[...pts, pts[0]]])) / 4046.86
    return `${tool === 'pond' ? 'Pond' : 'Park'} so far: ${fmt(ac, 2)} ac`
  })()

  // ---- housing and UDO checks ----
  const ruleCode = plan && !plan.error ? plan.district : code
  const rules = N1[ruleCode] || std
  const allowed = housingAllowed(housing, ruleCode)
  const unitsOf = (c) => (housing === 'mix' ? unitsFor(mix[c.i]?.home || 'sf') : LOT_HOUSING.some((h) => h.key === housing) ? unitsFor(housing) : 1)
  const homes = plan && !plan.error ? (plan.counts.length ? plan.counts.reduce((t, c) => t + c.lots * unitsOf(c), 0) : plan.lots) : 0
  const frontFt = rules?.frontFt ?? FRONT_SETBACK_ASSUMED // Indian Trail states it; Charlotte's varies by street, so assume 20
  const needDepth = frontFt + (rules?.rearFt || 0) + MIN_HOUSE_DEPTH
  const ck = plan?.check || {}
  const lotWord = plan?.product === 'townhomes' ? 'sublot' : 'lot'
  const checks = plan && !plan.error ? (plan.product === 'apartments' ? [
    { label: 'Housing type', ok: allowed.ok, detail: allowed.ok === true ? `Apartments are allowed by right in ${dl(ruleCode)}` : allowed.note },
    { label: 'Building scale', ok: plan.bldgMaxFt <= APARTMENT.maxBldgFt + 1 && aptOpts.stories <= 4, detail: `${plan.buildings} buildings, up to ${plan.bldgMaxFt} ft long and ${plan.stories} stories, ${N1[ruleCode].apt ? `within the ${N1[ruleCode].apt.stories}-story limit for apartments` : `within the ${N1[ruleCode].heightFt} ft height limit`}` },
    { label: 'Parking', ok: true, detail: `${fmt(plan.spaces)} surface spaces, ${plan.spacesPerUnit.toFixed(1)} per unit${plan.parkingLimited ? '. Parking is what limits the unit count on this site' : ''} (a market assumption, not a UDO minimum)` },
    { label: 'Open space', ok: plan.openPct >= 15, detail: `${fmt(plan.openPct, 1)}% of the site stays open (green space and the pond)` },
  ] : [
    { label: plan.product === 'townhomes' ? 'Sublot area' : 'Lot area', ok: plan.pass, detail: `Smallest ${lotWord} ${fmt(ck.minSf)} sq ft; Groundwork drafts ${dl(ruleCode)} with ${fmt(plan.minLotSf)} sq ft minimum ${lotWord}s${plan.capped === 'conservation' ? '. At the conservation maximum lot count' : ''}` },
    ...(rules?.maxDensity && !plan.product ? [{ label: 'Density', ok: plan.density <= rules.maxDensity + 0.001, detail: `${fmt(plan.density, 2)} lots per acre; ${dl(ruleCode)} allows up to ${rules.maxDensity} per acre${plan.capped === 'density' ? ', which is what limits the lot count here' : ''}` }] : []),
    ...(plan.product === 'townhomes' ? [{ label: 'Building size', ok: plan.bldgMaxFt <= TOWNHOME.maxBldgFt && Math.max(...plan.bldgUnits) <= thOpts.maxPerBldg, detail: `${plan.buildings} buildings, up to ${Math.max(...plan.bldgUnits)} units each; longest ${plan.bldgMaxFt} ft. Recent N2-A approvals typically condition buildings to about ${TOWNHOME.maxBldgFt} ft and 4-6 units.` }] : []),
    { label: 'Lot width', ok: ck.minWidth == null || ck.minWidth >= minWidth - 0.5, detail: ck.minWidth ? `Narrowest street frontage ${ck.minWidth} ft; needs ${minWidth} ft (cul-de-sac lots are measured at the setback)` : 'Measured on the lot mix' },
    { label: 'Street access', ok: true, detail: plan.noFrontage ? `Every ${lotWord} fronts a street (${plan.noFrontage} without frontage were left out)` : `Every ${lotWord} fronts a street with room for a driveway` },
    { label: plan?.product === 'townhomes' ? 'Room for a unit' : 'Room for a house', ok: ck.minDepth == null || ck.minDepth >= needDepth, detail: `Shallowest ${lotWord} ${ck.minDepth ?? '—'} ft deep; a ${plan?.product === 'townhomes' ? 'unit' : 'house'} needs ${needDepth} ft for a ${frontFt} ft front setback${rules?.frontFt ? '' : ' (assumed)'}, the ${rules?.rearFt} ft rear setback, and a ${MIN_HOUSE_DEPTH} ft deep home` },
    { label: 'Housing type', ok: allowed.ok, detail: allowed.ok === true ? `${HOUSING.find((h) => h.key === housing).label} ${housing === 'mix' ? 'types are' : /s$/.test(HOUSING.find((h) => h.key === housing).label) ? 'are' : 'is'} allowed by right in ${dl(ruleCode)}` : allowed.ok === 'limited' ? `Allowed in ${dl(ruleCode)} only on a small scale` : `Not allowed by right in ${dl(ruleCode)}` },
  ]) : []
  const passAll = !!plan && !plan.error && checks.every((c) => c.ok === true) && !plan.conflicts?.length

  // ---- summary of the current draft, for the site report ----
  const summary = open && plan && !plan.error ? {
    planName: current?.name || null,
    zoned: zonedLabel, scenario: scenarioLabel, district: dl(ruleCode),
    product: plan.product || 'lots',
    count: plan.lots, homes, density: plan.density,
    unitWord: plan.product === 'townhomes' ? 'townhomes' : plan.product === 'apartments' ? 'apartments' : 'lots',
    baseline: scenario ? baseline?.lots ?? null : null,
    housing: plan.product ? null : HOUSING.find((h) => h.key === housing)?.label,
    pass: passAll,
    checks: checks.map((c) => ({ label: c.label, ok: c.ok, detail: c.detail })),
    facts: {
      totalAc: plan.totalAc, roadLenFt: plan.roadLenFt, roadAc: plan.roadAc, openPct: plan.openPct, pondAc: plan.pondAc, greenAc: plan.greenAc,
      buildings: plan.buildings, bldgMaxFt: plan.bldgMaxFt, spaces: plan.spaces, stories: plan.stories,
      mix: plan.counts?.filter((c) => c.lots).map((c) => `${c.width} × ${c.depth} ft: ${c.lots}`),
    },
    approval: scenario ? approval : null,
  } : null
  const summaryKey = JSON.stringify(summary)
  useEffect(() => { onSummary?.(summary) }, [summaryKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // early returns only after every hook, so the hook count never changes between renders
  if (!open) {
    return (
      <>
        {savedList}
        {form?.as === 'rename' && saveForm}
        <button className="btn btn-primary sketch-btn" onClick={() => { setCurrent(null); setOpen(true) }}>Draft a neighborhood</button>
      </>
    )
  }

  if (!std) return null // all hooks above run on every render
  const download = () => {
    const blob = new Blob([neighborhoodKml(plan, `Groundwork draft · ${parcel.properties.address || parcel.properties.id}`)], { type: 'application/vnd.google-earth.kml+xml' })
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: `groundwork-neighborhood-${parcel.properties.id}.kml` }).click()
    URL.revokeObjectURL(url)
  }
  const ok = plan && !plan.error

  const pondSlider = (
    <label className="slider">
      <span>Stormwater pond <strong>{reserve}%</strong> of buildable land{edit && !edit.ponds?.length ? ' (draw a pond to size it)' : ''}</span>
      <input type="range" min={edit ? 1 : 0} max={20} step={1} value={reserve} disabled={!!edit && !edit.ponds?.length} onChange={(e) => resizePond(Number(e.target.value))} />
    </label>
  )

  return (
    <div className="siteplan">
      <div className="siteplan-head">
        <strong>
          {current ? current.name : 'Neighborhood draft'}
          {current && <span className={`plan-status ${dirty ? 'dirty' : ''}`}>{dirty ? 'Unsaved changes' : 'Saved'}</span>}
        </strong>
        <button className="link-btn" onClick={() => { setEditing(false); setOpen(false); setPlan(null); onPlan(null); setForm(null) }}>Hide draft</button>
      </div>
      {current?.description && <p className="plan-desc">{current.description}</p>}
      {N1[zonedCode] && !N1[zonedCode].townhome && (
        <label className="zoning-pick">
          <span>Zoning</span>
          <select value={scenario || ''} onChange={(e) => changeScenario(e.target.value)} disabled={editing}>
            <option value="">As zoned ({zonedLabel})</option>
            {upzoneOptions(zonedCode).filter((c) => !N1[c].townhome).map((c) => <option key={c} value={c}>If rezoned to {dl(c)} ({N1[c].minLotSf.toLocaleString()} sq ft lots{N1[c].typical ? ', typical conditions' : ''})</option>)}
            {town === 'Charlotte' && <>
              <option value="N2-A">If rezoned to N2-A (townhomes)</option>
              <option value="N2-B">If rezoned to N2-B (apartments)</option>
            </>}
            {town === 'Indian Trail' && <option value="MFR">If rezoned to MFR (apartments)</option>}
            {/* districts that allow both lots and apartments (Concord RC, Monroe RHD) */}
            {upzoneOptions(zonedCode).filter((c) => N1[c].apt).map((c) => <option key={`${c}|apt`} value={`${c}|apt`}>If rezoned to {c} (apartments, {N1[c].apt.density} units/ac)</option>)}
          </select>
        </label>
      )}
      {scenario && (
        <div className="scenario-banner">
          <strong>Rezoning scenario: {zonedLabel} → {scenarioLabel}</strong>
          <span>Drafted under {dl(scenarioCode)} rules. {town === 'Charlotte' ? 'Building this way needs a rezoning approved by City Council.' : `Building this way needs a conditional rezoning approved by the ${{ 'Indian Trail': 'Indian Trail Town Council', Concord: 'Concord City Council', Monroe: 'Monroe City Council', Matthews: 'Matthews Board of Commissioners', 'Mint Hill': 'Mint Hill Board of Commissioners' }[town] || `${town} governing board`}.`}{N1[scenarioCode]?.typical ? ` Lot standards shown are ${N1[scenarioCode].typical.charAt(0).toLowerCase()}${N1[scenarioCode].typical.slice(1)}, not ordinance minimums.` : ''}</span>
        </div>
      )}
      {scenario && !parts && <ApprovalContext parcel={parcel} code={scenarioCode} apartments={apartments} placeType={placeType} editor={editor} onFactors={setApproval} />}
      {form && saveForm}
      {!editing && !form && savedList}

      {/* editing toolbar sits on top while editing */}
      {editing && (
        <div className="editor-box">
          <div className="seg" role="group" aria-label="Editing tool">
            {[['select', 'Select'], ['draw', 'Street'], ['pond', 'Pond'], ['park', 'Park'], ['boundary', 'Boundary']].map(([id, label]) => (
              <button key={id} className={tool === id ? 'on' : ''} onClick={() => { setTool(id); setDrawPts([]); if (id !== 'select') setSelected(null) }} aria-pressed={tool === id}>{label}</button>
            ))}
          </div>
          <p className="muted-small">
            {tool === 'draw'
              ? drawPts.length ? 'Click to add points. Double-click or press Enter to finish, Esc to cancel. Ending near a street connects to it.' : 'Click on the map to start a street. Starting near an existing street connects to it.'
              : tool === 'pond' || tool === 'park'
                ? drawPts.length ? `Click around the ${tool}'s outline. Double-click or press Enter to finish (at least 3 points).` : `Click on the map to start outlining a ${tool}. Lots will move out of its way.`
                : tool === 'boundary'
                  ? 'Drag a corner of the site to reshape it, for example to leave out a piece. Lots refill inside the new boundary.'
                  : selected
                    ? selected.pond != null || selected.park != null
                      ? `${selected.pond != null ? 'Pond' : 'Park'} selected. Drag it to move it, drag a white handle to reshape it, or press Delete.`
                      : selected.street != null
                        ? 'Street selected. Drag a white handle to reshape it, or press Delete to remove it.'
                        : `Lot ${selected.lot} selected. Press Delete or use the button to remove it.`
                    : 'Click a street, lot, pond, or park to select it. Drag a white line between two lots to resize them.'}
          </p>
          {measure && <p className="measure" aria-live="polite">{measure}</p>}
          {selected?.pond != null && pondSlider}
          <div className="nb-actions">
            {tool === 'draw' && drawPts.length >= 2 && <button className="btn btn-primary" onClick={finishDrawing}>Finish street</button>}
            {(tool === 'pond' || tool === 'park') && drawPts.length >= 3 && <button className="btn btn-primary" onClick={finishDrawing}>Finish {tool}</button>}
            <button className="btn" onClick={deleteSelected} disabled={!selected}>Remove {selected?.street != null ? 'street' : selected?.lot != null ? 'lot' : selected?.pond != null ? 'pond' : selected?.park != null ? 'park' : 'selected'}</button>
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
          {/* results first */}
          <div className="nb-total">
            <span className="nb-lots">{plan.product === 'apartments' ? '≈' : ''}{plan.lots}</span><span className="nb-unit">{plan.product === 'townhomes' ? 'townhomes' : plan.product === 'apartments' ? 'apartments' : 'lots'}</span>
            {homes !== plan.lots && <span className="nb-homes">· {homes} homes</span>}
            <span className={`pass ${passAll ? 'yes' : 'no'}`}>{passAll ? 'PASS' : 'CHECK'}</span>
          </div>
          {scenario && (
            <p className="scenario-compare">
              {baseline?.lots != null
                ? <>By right as {zonedLabel}: <strong>{baseline.lots} lots</strong> · as {scenarioLabel}: <strong>{plan.product === 'apartments' ? '≈' : ''}{plan.lots} {plan.product === 'townhomes' ? 'townhomes' : plan.product === 'apartments' ? 'apartments' : 'lots'}</strong> <span className={plan.lots - baseline.lots >= 0 ? 'up' : 'down'}>({plan.lots - baseline.lots >= 0 ? '+' : ''}{plan.lots - baseline.lots})</span></>
                : baseline?.error ? 'The by-right comparison couldn’t be drafted.' : `Drafting the by-right ${zonedLabel} comparison…`}
            </p>
          )}
          {plan.product === 'townhomes' && <p className="nb-density">{plan.buildings} buildings of up to {Math.max(...plan.bldgUnits)} units · longest {plan.bldgMaxFt} ft · {plan.thStyle === 'alley' ? 'rear alley-loaded' : 'front-loaded garages'}</p>}
          {plan.product === 'apartments' && <p className="nb-density">{plan.buildings} buildings · {plan.stories} stories · {fmt(plan.spaces)} surface spaces ({plan.spacesPerUnit.toFixed(1)} per unit){plan.parkingLimited ? ' · yield is parking-limited' : ''}{plan.densityLimited ? ` · yield is set by ${dl(ruleCode)}’s density limit` : ''}</p>}
          <p className="nb-density">{fmt(plan.density, plan.product === 'apartments' ? 1 : 2)} {plan.product ? 'homes' : 'lots'} per acre{homes !== plan.lots ? ` · ${fmt(homes / plan.totalAc, 1)} homes per acre` : ''}{plan.capped === 'conservation' ? ' · at the conservation maximum' : plan.capped === 'density' ? ` · at ${dl(ruleCode)}’s ${rules.maxDensity} units/acre limit` : ''}</p>
          {allowed.ok !== true && (
            <div className={`note ${allowed.ok === false ? 'warn' : ''}`}>
              {allowed.note}
              {allowed.ok === false && <> <button className="link-btn" onClick={() => setHousing('sf')}>Draft single-family lots instead</button></>}
            </div>
          )}

          {plan.conflicts?.length > 0 && (
            <p className="note warn">
              {plan.conflicts.length === 1 ? `A ${plan.conflicts[0]} overlaps a street.` : `${plan.conflicts.length} ponds or parks overlap streets.`} Move it or reroute the street so the plan is buildable.
            </p>
          )}
          {plan.outside && <p className="note warn">Part of a pond or park is outside the parcel, so only the part inside is counted.</p>}
          {edit?.boundary && <p className="note">Site boundary edited: drafting {fmt(plan.totalAc, 2)} ac of the {fmt(acres, 2)} ac {parts ? 'site' : 'parcel'}.{turf.area(turf.difference(turf.featureCollection([turf.feature(edit.boundary), parcel])) || turf.point([0, 0])) > 50 ? ' Part of the boundary now extends past the property line.' : ''}</p>}
          {plan.noFrontage > 0 && <p className="note warn">{plan.noFrontage} lot{plan.noFrontage > 1 ? 's were' : ' was'} left out because {plan.noFrontage > 1 ? 'they' : 'it'} had no street frontage for a driveway.</p>}

          <div className="mix-bar" aria-hidden="true">
            {plan.counts.filter((c) => c.lots).map((c) => <span key={c.i} style={{ background: c.color, flex: c.lots }} />)}
          </div>
          <ul className="mix-list">
            {plan.counts.filter((c) => c.lots).map((c) => (
              <li key={c.i}><i className="dot" style={{ background: c.color }} />{c.width} × {c.depth} ft{housing === 'mix' ? ` · ${HOUSING.find((h) => h.key === (mix[c.i]?.home || 'sf')).label.toLowerCase()}` : ''}<span>{Math.round((c.lots / plan.lots) * 100)}%</span><strong>{c.lots} lots</strong></li>
            ))}
          </ul>

          <ul className="udo-checks" aria-label={`UDO checks for ${plan.district}`}>
            {checks.map((c) => (
              <li key={c.label} className={c.ok === true ? 'ok' : c.ok === 'limited' ? 'limited' : 'bad'}>
                <span className="mark" aria-hidden="true">{c.ok === true ? '✓' : c.ok === 'limited' ? '!' : '✗'}</span>
                <div><strong>{c.label}</strong><span>{c.detail}</span></div>
              </li>
            ))}
            <li className="unchecked"><span className="mark" aria-hidden="true">–</span><div><strong>Not checked</strong><span>Tree save and open space requirements, street design standards, stormwater, building coverage and height (no buildings are drawn), and parking.</span></div></li>
          </ul>

          <div className="nb-grid">
            {[
              ['Total area', `${fmt(plan.totalAc, 2)} ac`],
              ['Net buildable', `${fmt(plan.netBuildableAc, 2)} ac`],
              [plan.product === 'apartments' ? 'Drives & parking' : 'Roads', plan.product === 'apartments' ? `${fmt(plan.roadAc, 1)} ac · ${fmt(plan.spaces)} spaces` : `${fmt(plan.roadLenFt)} ft · ${fmt(plan.roadAc, 1)} ac`],
              ['Open space', `${fmt(plan.openPct, 1)}%`],
              [`Pond${edit?.ponds?.length > 1 ? 's' : ''}`, `${fmt(plan.pondAc, 2)} ac`],
              ['Green space', `${fmt(plan.greenAc, 2)} ac`],
              ...(plan.parkAc > 0 ? [['Parks', `${fmt(plan.parkAc, 2)} ac`]] : []),
              ...(plan.unbuildableAc > 0.01 ? [['Floodplain', `${fmt(plan.unbuildableAc, 2)} ac`]] : []),
            ].map(([k, v]) => <div key={k}><span>{k}</span><strong>{v}</strong></div>)}
          </div>

          <div className="nb-legend" aria-label="Map key">
            <span><i className="sw road" />Street</span>
            <span><i className="sw drive" />Driveway</span>
            <span><i className="sw pond" />Pond</span>
            {plan.parkAc > 0 && <span><i className="sw park" />Park</span>}
            <span><i className="sw green" />Green space</span>
            {plan.unbuildableAc > 0.01 && <span><i className="sw flood" />Floodplain</span>}
          </div>

          {(plan.spurs > 0 || plan.absorbedAc >= 0.1) && (
            <p className="muted-small">
              {[plan.spurs > 0 && `${plan.spurs} cul-de-sac${plan.spurs > 1 ? 's' : ''} added to reach leftover land`, plan.absorbedAc >= 0.1 && `${fmt(plan.absorbedAc, 1)} ac of edge strips added to neighboring lots`].filter(Boolean).join(' · ')}.
            </p>
          )}

          <div className="nb-actions">
            {!current && <button className="btn btn-primary" onClick={() => setForm({ as: 'new', name: '', description: '' })}>Save plan</button>}
            {current && dirty && <button className="btn btn-primary" onClick={quickSave}>Save</button>}
            {current && <button className="btn" onClick={() => setForm({ as: 'new', name: `${current.name} (copy)`, description: current.description || '' })}>Save as new</button>}
            {!editing && plan.product !== 'apartments' && <button className="btn" onClick={startEditing}>{edit ? 'Keep editing' : 'Edit layout'}</button>}
            {!edit && plan.variants > 1 && <button className="btn" onClick={() => setVariant((v) => (v + 1) % plan.variants)}>Try another layout ({variant + 1} of {plan.variants})</button>}
            {edit && <button className="btn" onClick={() => { setEditing(false); setEdit(null); setRemoved([]); setHistory([]); setSelected(null) }}>Back to automatic draft</button>}
            <button className="btn" onClick={download}>Export KML</button>
          </div>
        </>
      )}

      {/* settings tucked away until needed */}
      <details className="nb-settings">
        <summary>Adjust layout</summary>
        {modes.length > 1 && (
          <div className="seg" role="group" aria-label="Layout type">
            {modes.map((m) => <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)} aria-pressed={mode === m.id}>{m.label}</button>)}
          </div>
        )}
        {!townhomes && !apartments && town === 'Charlotte' && <label className="housing-pick">
          <span>Housing type</span>
          <select value={housing} onChange={(e) => setHousing(e.target.value)}>
            {HOUSING.map((h) => <option key={h.key} value={h.key}>{h.label}{housingAllowed(h.key, code).ok === false ? ' (needs rezoning)' : ''}</option>)}
          </select>
        </label>}
        {apartments && (
          <div className="th-controls">
            <label><span>Stories</span>
              <input type="number" min={2} max={4} step={1} value={aptOpts.stories} onChange={(e) => setAptOpts((o) => ({ ...o, stories: Math.max(2, Math.min(4, Number(e.target.value) || APARTMENT.stories)) }))} />
              <span className="unit">fl</span>
            </label>
            <label><span>Average unit</span>
              <input type="number" min={600} max={1500} step={50} value={aptOpts.unitSf} onChange={(e) => setAptOpts((o) => ({ ...o, unitSf: Math.max(600, Math.min(1500, Number(e.target.value) || APARTMENT.unitSf)) }))} />
              <span className="unit">sq ft</span>
            </label>
            <label><span>Parking per unit</span>
              <input type="number" min={1} max={2} step={0.1} value={aptOpts.parkRatio} onChange={(e) => setAptOpts((o) => ({ ...o, parkRatio: Math.max(1, Math.min(2, Number(e.target.value) || APARTMENT.parkRatio)) }))} />
              <span className="unit">sp</span>
            </label>
          </div>
        )}
        {townhomes && (
          <div className="th-controls">
            <label><span>Garages</span>
              <select value={thOpts.style} onChange={(e) => setThOpts((o) => ({ ...o, style: e.target.value }))}>
                {TOWNHOME.styles.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
              </select>
            </label>
            <label><span>Unit width</span>
              <input type="number" min={18} max={32} step={1} value={thOpts.unitW} onChange={(e) => setThOpts((o) => ({ ...o, unitW: Math.max(18, Math.min(32, Number(e.target.value) || TOWNHOME.unitW)) }))} />
              <span className="unit">ft</span>
            </label>
            <label><span>Units per building</span>
              <input type="number" min={3} max={8} step={1} value={thOpts.maxPerBldg} onChange={(e) => setThOpts((o) => ({ ...o, maxPerBldg: Math.max(3, Math.min(8, Number(e.target.value) || TOWNHOME.maxPerBldg)) }))} />
              <span className="unit">max</span>
            </label>
          </div>
        )}
        {!townhomes && !apartments && <div className="mix-editor">
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
              {housing === 'mix' && (
                <select className="mix-home" value={m.home || 'sf'} onChange={(e) => setMixRow(i, 'home', e.target.value)} aria-label={`Lot type ${i + 1} housing`}>
                  {LOT_HOUSING.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
                </select>
              )}
              {mix.length > 1 && <button className="mix-x" onClick={() => { setMix((r) => r.filter((_, j) => j !== i)); clearSizes() }} aria-label={`Remove lot type ${i + 1}`}>×</button>}
            </div>
          ))}
          {mix.length < 3 && <button className="link-btn" onClick={() => { setMix((r) => [...r, { width: (r[r.length - 1]?.width || minWidth) + 20, share: 20 }]); clearSizes() }}>+ Add lot size</button>}
          <p className="muted-small">Minimum frontage here is {minWidth} ft. Lot depth is fitted to the site, and lots widen where needed to meet the {fmt(mode === 'conservation' ? std.minLotSf / 2 : active.minLotSf)} sq ft minimum.</p>
        </div>}
        {pondSlider}
      </details>

      <p className="cite">Automatic draft for gauging yield and layout, not an engineered plan. The pond is placed by layout, not by terrain, and grading, tree save, stream buffers, and driveway rules aren't modeled.</p>
    </div>
  )
}
