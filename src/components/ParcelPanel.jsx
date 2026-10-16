import { useEffect, useState } from 'react'
import * as turf from '@turf/turf'
import { nearestSewer, nearestWater, floodShare, soilsFor, zoningAt } from '../lib/gis'
import { charlotteZoning, placeType } from '../lib/charlotte'
import { charlotteWaterNear } from '../lib/charlotteWater'
import BuildSection from './BuildSection'
import RezoningSection from './RezoningSection'

const money = (v) => (Number.isFinite(v) && v > 0 ? v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—')
const ft = (d) => (d === 0 ? 'Touches parcel' : d < 1000 ? `${Math.round(d)} ft` : `${(d / 5280).toFixed(2)} mi`)

// Runs an async check; resolves to { status, ...result }
function useCheck(fn, parcel, enabled = true) {
  const [state, setState] = useState({ status: enabled ? 'loading' : 'skip' })
  useEffect(() => {
    if (!enabled) return
    let live = true
    fn(parcel)
      .then((r) => live && setState({ status: 'done', ...r }))
      .catch((e) => live && setState({ status: 'error', message: e.message }))
    return () => { live = false }
  }, [fn, parcel, enabled])
  return state
}
// Loads a value; undefined while loading, null when missing
function useValue(fn, parcel, enabled = true) {
  const [v, setV] = useState(enabled ? undefined : null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    fn(parcel).then((r) => live && setV(r ?? null)).catch(() => live && setV(null))
    return () => { live = false }
  }, [fn, parcel, enabled])
  return v
}

const utilityCheck = (fetcher, label) => async (parcel) => {
  const r = await fetcher(parcel)
  if (!r.found) return { tone: 'none', value: 'None within ½ mile', detail: `Only City of Concord ${label}s are mapped in Cabarrus so far` }
  const size = r.sizeIn ? `${r.sizeIn}″ ` : ''
  const mat = r.material && r.material !== 'UNK' ? ` · ${r.material}` : ''
  const tone = r.distanceFt <= 200 ? 'good' : r.distanceFt <= 1000 ? 'watch' : 'flag'
  return { tone, value: ft(r.distanceFt), detail: `Nearest ${size}${label}${mat}` }
}
const sewerCheck = utilityCheck(nearestSewer, 'gravity sewer main')
const waterCheck = utilityCheck(nearestWater, 'water main')

// Charlotte: distance to mains Charlotte Water described in nearby rezoning staff analyses.
const charlotteUtility = (kind) => async (parcel) => {
  const r = await charlotteWaterNear(parcel, kind)
  if (!r.loaded) return { tone: 'none', value: 'Not loaded', detail: 'Run "npm run data:charlotte-water" to build the Charlotte Water records.' }
  const label = kind === 'sewer' ? 'sewer' : 'water main'
  if (r.noService && (!r.best || r.best.distanceFt > r.noService.distanceFt + 500)) {
    return {
      tone: 'flag',
      value: `No public ${kind === 'sewer' ? 'sewer' : 'water'} reported nearby`,
      detail: `Charlotte Water said ${kind} wasn't available for petition ${r.noService.petition} (${r.noService.received}), ${ft(r.noService.distanceFt)} away.`,
      link: r.noService.source,
    }
  }
  if (!r.best) return { tone: 'none', value: `No records within ${r.searchMi} mi`, detail: `No rezoning near here has a Charlotte Water ${label} statement yet.` }
  const b = r.best
  // Prefer the city's street name over the PDF text, which can split words ("Dr ive").
  const title = (x) => x.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  const where = b.precision === 'street' && b.matched ? `along ${title(b.matched.split(' / ')[0])}` : b.where
  const tone = b.distanceFt <= 200 ? 'good' : b.distanceFt <= 1000 ? 'watch' : 'flag'
  const size = b.sizeIn ? `${b.sizeIn}″ ` : ''
  const what = kind === 'sewer' ? `${size}gravity sewer` : `${size}water main`
  return {
    tone,
    value: `≈ ${ft(b.distanceFt)}`,
    detail: `${what} ${where}, per Charlotte Water on petition ${b.petition} (${b.received}).${
      b.precision === 'street' ? ' Measured to the street centerline.' : b.precision === 'site' ? ' Location approximate: placed on that rezoning site\'s edge.' : ''}`,
    link: b.source,
  }
}
const cltSewerCheck = charlotteUtility('sewer')
const cltWaterCheck = charlotteUtility('water')

async function floodCheck(parcel) {
  const r = await floodShare(parcel)
  if (r.pct < 0.5) return { pct: 0, tone: 'good', value: 'Outside 100-yr floodplain', detail: 'No FEMA special flood hazard area on the parcel' }
  const zones = r.zones.map((z) => `${z.zone} ${z.pct.toFixed(0)}%`).join(', ')
  return { pct: r.pct, tone: r.pct > 20 ? 'flag' : 'watch', value: `${r.pct.toFixed(0)}% in floodplain`, detail: zones }
}

async function soilsCheck(parcel) {
  const rows = await soilsFor(parcel)
  if (!rows.length) return { tone: 'none', value: 'No soil data', detail: '' }
  const main = rows[0]
  const poor = /poorly/i.test(main.drainagecl || '') || /D/.test(main.hydgrp || '')
  return {
    tone: poor ? 'watch' : 'good',
    value: main.muname,
    detail: [main.drainagecl, main.hydgrp && `Hydrologic group ${main.hydgrp}`].filter(Boolean).join(' · ') + (rows.length > 1 ? ` · +${rows.length - 1} more` : ''),
  }
}

async function cabarrusZoningCheck(parcel) {
  const z = await zoningAt(turf.pointOnFeature(parcel).geometry.coordinates)
  if (!z.length) return { tone: 'none', value: 'Unincorporated or not mapped', detail: 'Check Cabarrus County zoning' }
  return { tone: 'none', value: z.map((x) => x.code).join(' / '), detail: z.map((x) => x.town).join(', ') }
}

function CheckRow({ label, swatch, state }) {
  if (state.status === 'skip') return null
  return (
    <div className={`check tone-${state.status === 'done' ? state.tone : state.status}`}>
      <div className="check-label">
        {swatch && <span className="swatch" style={{ background: swatch }} aria-hidden="true" />}
        {label}
      </div>
      <div className="check-body">
        {state.status === 'loading' && <span className="pending">Checking…</span>}
        {state.status === 'error' && <span className="pending">Source didn't respond. Try again shortly.</span>}
        {state.status === 'done' && (
          <>
            <div className="check-value">{state.value}</div>
            {state.detail && <div className="check-detail">{state.detail}{state.link && <> <a href={state.link} target="_blank" rel="noreferrer">Source</a></>}</div>}
          </>
        )}
      </div>
    </div>
  )
}

export default function ParcelPanel({ parcel, isSaved, onSave, onClose }) {
  const p = parcel.properties
  const isMeck = p.county === 'Mecklenburg'

  const flood = useCheck(floodCheck, parcel)
  const soils = useCheck(soilsCheck, parcel)
  const sewer = useCheck(isMeck ? cltSewerCheck : sewerCheck, parcel)
  const water = useCheck(isMeck ? cltWaterCheck : waterCheck, parcel)
  const cabZoning = useCheck(cabarrusZoningCheck, parcel, !isMeck)
  const cltZoning = useValue(charlotteZoning, parcel, isMeck)
  const place = useValue(placeType, parcel, isMeck)
  const [copied, setCopied] = useState(false)

  const floodPct = flood.status === 'done' ? flood.pct : null
  const sale = p.salePrice ? `${money(p.salePrice)} · ${p.saleMonth ? `${p.saleMonth}/` : ''}${p.saleYear || ''}` : 'No recorded sale'

  const copySummary = async () => {
    const line = (lab, s) => (s.status === 'done' ? `${lab}: ${s.value}${s.detail ? ` (${s.detail})` : ''}` : null)
    const text = [
      `${p.owner} — ${p.acres.toFixed(2)} ac — ${p.county} parcel ${p.id}`,
      p.address && `Address: ${p.address}`,
      isMeck && cltZoning && `Zoning: ${cltZoning.code}`,
      isMeck && place && `2040 place type: ${place.name}`,
      line('Flood', flood), line('Soils', soils), line('Sewer', sewer), line('Water', water), !isMeck && line('Zoning', cabZoning),
      `Assessed: ${money(p.assessed)} · Last sale: ${sale}`,
      `Owner mailing: ${p.mail}`,
    ].filter(Boolean).join('\n')
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* clipboard blocked */ }
  }

  return (
    <aside className="panel" aria-label="Parcel details">
      <div className="panel-head">
        <button className="close" onClick={onClose} aria-label="Close parcel">×</button>
        <div className="acres">
          <span className="acres-num">{p.acres.toFixed(p.acres < 10 ? 2 : 1)}</span>
          <span className="acres-unit">acres</span>
        </div>
        <h2 className="owner">{p.owner || 'Owner not listed'}</h2>
        {p.address && <div className="addr">{p.address}</div>}
        <div className="pin">{p.county} parcel {p.id}{p.vacant ? ' · Vacant' : ''}{p.landUse ? ` · ${p.landUse.toLowerCase()}` : ''}</div>
        <div className="actions">
          <button className={`btn ${isSaved ? 'btn-on' : 'btn-primary'}`} onClick={onSave}>{isSaved ? 'Saved' : 'Save parcel'}</button>
          <button className="btn" onClick={copySummary}>{copied ? 'Copied' : 'Copy summary'}</button>
        </div>
      </div>

      {isMeck && (
        <section className="section">
          <h3>What you can build</h3>
          {place && <p className="place">2040 Policy Map: <strong>{place.name}</strong>{place.area ? ` · ${place.area}` : ''}</p>}
          <BuildSection zoning={cltZoning} acres={p.acres} floodPct={floodPct} />
        </section>
      )}

      {isMeck && cltZoning && (
        <section className="section">
          <h3>Rezoning outlook</h3>
          <RezoningSection parcel={parcel} zoning={cltZoning} place={place} />
        </section>
      )}

      <section className="section">
        <h3>Site conditions</h3>
        <CheckRow label="Flood" state={flood} />
        <CheckRow label="Soils" state={soils} />
        <CheckRow label="Sewer" swatch="#38A169" state={sewer} />
        <CheckRow label="Water" swatch="#2F7DE1" state={water} />
        <CheckRow label="Zoning" state={cabZoning} />
        {isMeck && <p className="note">Charlotte Water doesn't publish its pipe network. These distances come from the mains it described in nearby rezoning reviews, so they confirm a main exists but may not show the closest one.</p>}
      </section>

      <section className="section">
        <h3>Ownership and value</h3>
        <dl className="facts">
          <dt>Mailing address</dt><dd>{p.mail || '—'}</dd>
          <dt>{isMeck ? 'Market value' : 'Assessed value'}</dt><dd>{money(p.assessed)}</dd>
          <dt>Land</dt><dd>{money(p.land)}</dd>
          <dt>Buildings</dt><dd>{money(p.building)}</dd>
          <dt>Last sale</dt><dd>{sale}</dd>
          <dt>Deed</dt><dd>{p.deed || '—'}</dd>
          <dt>Legal description</dt><dd>{p.legal || '—'}</dd>
          <dt>Neighborhood</dt><dd>{p.neighborhood || '—'}</dd>
        </dl>
      </section>

      <p className="sources">
        {isMeck ? 'Mecklenburg County / City of Charlotte GIS, Charlotte UDO, Charlotte Water rezoning comments, FEMA NFHL, USDA NRCS.' : 'Cabarrus County GIS, City of Concord Utilities, FEMA NFHL, USDA NRCS.'}
        {' '}Planning estimates, not survey or legal advice.
      </p>
    </aside>
  )
}
