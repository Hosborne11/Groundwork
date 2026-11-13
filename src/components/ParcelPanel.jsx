import { useEffect, useState } from 'react'
import { openReportWindow, writeSiteReport } from '../lib/siteReport'
import { IT_RULES, IT_SOURCE } from '../data/indianTrail'
import { CONCORD_RULES, MONROE_RULES, TOWN_RULES, TOWN_SOURCES, districtLabel } from '../data/towns'
import { meckTownZoning } from '../lib/towns'
import * as turf from '@turf/turf'
import { nearestSewer, nearestWater, floodShare, soilsFor, zoningAt } from '../lib/gis'
import { charlotteZoning, placeType } from '../lib/charlotte'
import { charlotteWaterNear } from '../lib/charlotteWater'
import { deedGroup } from '../lib/parcels'
import { yorkZoning, yorkServiceProvider, yorkFutureLandUse } from '../lib/york'
import { unionZoning } from '../lib/union'
import BuildSection from './BuildSection'
import NeighborhoodCard from './NeighborhoodCard'
import { N1, parseZoning } from '../data/charlotteUdo'
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
// York County: zoning (with the county's own legend names), utility provider, 2035 land use
// Union County: zoning from the town's layer, or county zoning for unincorporated land
async function unionZoningCheck(parcel) {
  const z = await unionZoning(parcel)
  if (!z.code) return { tone: 'none', value: z.town, detail: `${z.town} zoning isn't published in the county's map; check with the town.` }
  return { tone: 'none', value: z.code, town: z.town, code: z.code, detail: [`${z.source} zoning`, z.etj && 'outside town limits (extraterritorial jurisdiction)', z.source === 'Union County' && z.town, z.petition && `rezoning petition ${z.petition}`].filter(Boolean).join(' · ') }
}

async function yorkZoningCheck(parcel) {
  const z = await yorkZoning(parcel)
  if (!z.code) {
    return { tone: 'none', value: z.incorporated ? `Town of ${z.town}` : 'Not mapped', detail: z.incorporated ? `${z.town} zoning isn't loaded yet; check with the town.` : 'No zoning found for this parcel.' }
  }
  const extra = [z.conditional && 'Conditional zoning', z.caseNumber && `Case ${z.caseNumber}`].filter(Boolean).join(' · ')
  return { tone: 'none', value: `${z.code}${z.name ? ` · ${z.name}` : ''}`, detail: [`${z.source} zoning`, z.town !== 'Rock Hill' && z.town, extra].filter(Boolean).join(' · ') }
}
async function yorkUtilityCheck(parcel) {
  const s = await yorkServiceProvider(parcel)
  if (!s) return { tone: 'watch', value: 'Outside mapped service areas', detail: 'No public water or sewer provider area covers this parcel. Expect well and septic unless service is extended.' }
  return { tone: 'good', value: s.provider, detail: "Inside this provider's water and sewer service area. Pipe locations aren't published, so distance to a main isn't shown." }
}
async function yorkLandUseCheck(parcel) {
  const code = await yorkFutureLandUse(parcel)
  return code
    ? { tone: 'none', value: code, detail: "York County 2035 Land Use Plan designation (the county publishes codes only)." }
    : { tone: 'none', value: 'Not designated', detail: 'No 2035 Land Use Plan designation found.' }
}

const cltSewerCheck = charlotteUtility('sewer')
const cltWaterCheck = charlotteUtility('water')

async function floodCheck(parcel) {
  const r = await floodShare(parcel)
  if (r.pct < 0.5) return { pct: 0, polys: [], tone: 'good', value: 'Outside 100-yr floodplain', detail: 'No FEMA special flood hazard area on the parcel' }
  const zones = r.zones.map((z) => `${z.zone} ${z.pct.toFixed(0)}%`).join(', ')
  return { pct: r.pct, polys: r.polys, tone: r.pct > 20 ? 'flag' : 'watch', value: `${r.pct.toFixed(0)}% in floodplain`, detail: zones }
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
  return { tone: 'none', value: z.map((x) => x.code).join(' / '), detail: z.map((x) => x.town).join(', '), zones: z }
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

export default function ParcelPanel({ parcel, fromPetition, isSaved, onSave, onClose, onPlan, editor, openPlanId, onPlanOpened, inAssembly, onAssemble }) {
  const p = parcel.properties
  const isMeck = p.county === 'Mecklenburg'
  const isYork = p.county === 'York'
  const isUnion = p.county === 'Union'

  const flood = useCheck(floodCheck, parcel)
  const soils = useCheck(soilsCheck, parcel)
  // pipe distances only where pipes are published (Charlotte Water records, Concord mains)
  const sewer = useCheck(isMeck ? cltSewerCheck : sewerCheck, parcel, !isYork && !isUnion)
  const water = useCheck(isMeck ? cltWaterCheck : waterCheck, parcel, !isYork && !isUnion)
  const uZoning = useCheck(unionZoningCheck, parcel, isUnion)
  const cabZoning = useCheck(cabarrusZoningCheck, parcel, p.county === 'Cabarrus')
  const yZoning = useCheck(yorkZoningCheck, parcel, isYork)
  const yUtility = useCheck(yorkUtilityCheck, parcel, isYork)
  const yLandUse = useCheck(yorkLandUseCheck, parcel, isYork)
  const cltZoning = useValue(charlotteZoning, parcel, isMeck)
  const place = useValue(placeType, parcel, isMeck)
  // Mecklenburg parcels outside Charlotte's zoning: Matthews and Mint Hill publish their own
  const meckTown = useValue(meckTownZoning, parcel, isMeck && cltZoning === null)
  const deed = useValue(deedGroup, parcel)
  const [copied, setCopied] = useState(false)
  const [draftSummary, setDraftSummary] = useState(null) // the open neighborhood draft, for the site report
  const [reporting, setReporting] = useState(false)

  const floodPct = flood.status === 'done' ? flood.pct : null
  // null while the flood check runs; [] if it failed (sketch then ignores floodplain)
  const floodPolys = flood.status === 'done' ? flood.polys || [] : flood.status === 'error' ? [] : null
  const zoneParts = cltZoning ? parseZoning(cltZoning.code) : null
  const canSketch = isMeck && zoneParts && N1[zoneParts.base] && !zoneParts.conditional
  // Town residential districts Groundwork drafts in (conditional districts have site-specific plans)
  const concordZone = p.county === 'Cabarrus' && cabZoning.status === 'done' ? cabZoning.zones?.find((z) => z.town === 'Concord')?.code?.trim() : null
  const town = isUnion && uZoning.status === 'done'
    ? (uZoning.town === 'Indian Trail' && IT_RULES[uZoning.code] && !IT_RULES[uZoning.code].apartment ? { name: 'Indian Trail', code: uZoning.code, rule: IT_RULES[uZoning.code], source: IT_SOURCE, kind: 'single-family' }
      : uZoning.town === 'Monroe' && MONROE_RULES[uZoning.code] ? { name: 'Monroe', code: uZoning.code, rule: MONROE_RULES[uZoning.code], source: TOWN_SOURCES.Monroe, kind: 'residential' } : null)
    : concordZone && CONCORD_RULES[concordZone] ? { name: 'Concord', code: concordZone, rule: CONCORD_RULES[concordZone], source: TOWN_SOURCES.Concord, kind: 'residential' }
    : meckTown?.key && TOWN_RULES[meckTown.key] && !meckTown.conditional && !TOWN_RULES[meckTown.key].conditionalOnly
      ? { name: meckTown.town, code: meckTown.key, rule: TOWN_RULES[meckTown.key], source: TOWN_SOURCES[meckTown.town], kind: 'residential' } : null
  const itCode = town?.code || null // (kept for the site report)
  const itRule = town?.rule || null
  const saleDate = `${p.saleMonth ? `${p.saleMonth}/` : ''}${p.saleYear || ''}`
  const sale = p.salePrice ? `${money(p.salePrice)} · ${saleDate}` : p.nominalSale ? `Nominal transfer, not a market sale · ${saleDate}` : 'No recorded sale'

  const copySummary = async () => {
    const line = (lab, s) => (s.status === 'done' ? `${lab}: ${s.value}${s.detail ? ` (${s.detail})` : ''}` : null)
    const text = [
      `${p.owner} — ${p.acres.toFixed(2)} ac — ${p.county} parcel ${p.id}`,
      p.address && `Address: ${p.address}`,
      isMeck && cltZoning && `Zoning: ${cltZoning.code}`,
      isMeck && place && `2040 place type: ${place.name}`,
      line('Flood', flood), line('Soils', soils), line('Sewer', sewer), line('Water', water), !isMeck && line('Zoning', cabZoning),
      `Assessed: ${money(p.assessed)} · Last sale: ${sale}${deed ? ` (deed covers ${deed.count} parcels)` : ''}`,
      `Owner mailing: ${p.mail}`,
    ].filter(Boolean).join('\n')
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* clipboard blocked */ }
  }

  // one-page printable report of this parcel and its current draft
  const siteReport = async () => {
    const w = openReportWindow() // must open inside the click
    if (!w) { alert('Allow pop-ups for Groundwork to open the site report.'); return }
    setReporting(true)
    const item = (label, c) => (c && c.status === 'done' ? { label, value: c.value, detail: c.detail } : null)
    const zoningCheck = !isMeck && (cabZoning.status === 'done' ? cabZoning : uZoning.status === 'done' ? uZoning : yZoning.status === 'done' ? yZoning : null)
    const snapshot = await editor?.snapshot?.(parcel)
    writeSiteReport(w, {
      address: p.address, owner: p.owner, mail: p.mail, county: p.county, id: p.id, acres: p.acres, vacant: p.vacant, landUse: p.landUse,
      assessed: money(p.assessed), sale: `${sale}${deed ? ` (deed covers ${deed.count} parcels)` : ''}`,
      zoning: isMeck ? cltZoning?.code : zoningCheck?.value, place: isMeck && place ? `${place.name}${place.area ? ` · ${place.area}` : ''}` : null,
      checks: [item('Floodplain', flood), item('Soils', soils), item('Sewer', sewer), item('Water', water), item('Utilities', yUtility), item('Land use plan', yLandUse)].filter(Boolean),
      summary: isMeck || itCode ? draftSummary : null,
      snapshot,
    })
    setReporting(false)
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
          {onAssemble && <button className={`btn ${inAssembly ? 'on' : ''}`} onClick={onAssemble} title="Combine with other parcels for one site plan (or Shift-click parcels on the map)">{inAssembly ? 'Remove from site' : 'Add to site'}</button>}
          <button className="btn" onClick={copySummary}>{copied ? 'Copied' : 'Copy summary'}</button>
          <button className="btn" onClick={siteReport} disabled={reporting} title="A one-page report you can print or save as a PDF">{reporting ? 'Preparing…' : 'Site report'}</button>
        </div>
      </div>

      {isMeck && !meckTown && (
        <section className="section">
          <h3>What you can build</h3>
          {place && <p className="place">2040 Policy Map: <strong>{place.name}</strong>{place.area ? ` · ${place.area}` : ''}</p>}
          <BuildSection zoning={cltZoning} acres={p.acres} floodPct={floodPct} />
          {canSketch && <NeighborhoodCard parcel={parcel} code={zoneParts.base} placeType={place?.name} acres={p.acres} floodPolys={floodPolys} floodFailed={flood.status === 'error'} onPlan={onPlan} editor={editor} openPlanId={openPlanId} onPlanOpened={onPlanOpened} onSummary={setDraftSummary} />}
        </section>
      )}

      {meckTown && !itRule && (
        <section className="section">
          <h3>Zoning</h3>
          <div className="zone-head"><strong className="zone-code">{meckTown.raw}</strong> <span>Town of {meckTown.town}</span></div>
          <p className="muted-small">{meckTown.conditional ? 'Conditional zoning: what can be built is set by the approved site plan and its conditions, so Groundwork doesn’t draft it.' : `Groundwork drafts ${meckTown.town}’s single-family residential districts; this district isn’t one of them.`}{meckTown.petition ? ` Petition ${meckTown.petition}.` : ''}</p>
        </section>
      )}

      {itRule && (
        <section className="section">
          <h3>What you can build</h3>
          <div className="zone-head"><strong className="zone-code">{districtLabel(itCode)}</strong> <span>{town.name} {town.kind}</span></div>
          <dl className="facts">
            <dt>Min lot area</dt><dd>{itRule.minLotSf.toLocaleString()} sq ft</dd>
            <dt>Min lot width</dt><dd>{itRule.minWidthFt} ft</dd>
            {itRule.maxDensity && <><dt>Max density</dt><dd>{itRule.maxDensity} units per acre</dd></>}
            <dt>Front setback</dt><dd>{itRule.frontFt} ft{itRule.frontMajorFt ? ` (${itRule.frontMajorFt} ft on thoroughfares)` : ''}</dd>
            <dt>Side / rear setback</dt><dd>{itRule.sideFt} ft / {itRule.rearFt} ft</dd>
            <dt>Max height</dt><dd>{itRule.stories ? `${itRule.stories} stories` : `${itRule.heightFt} ft`}{itRule.coverage ? ` · coverage ${itRule.coverage}` : ''}</dd>
            {itRule.apt && <><dt>Apartments</dt><dd>Allowed, up to {itRule.apt.density} units per acre and {itRule.apt.stories} stories</dd></>}
          </dl>
          <p className="muted-small">{town.source}. Cluster and other conditional subdivisions can allow smaller lots in exchange for common open space.</p>
          <NeighborhoodCard parcel={parcel} code={itCode} acres={p.acres} floodPolys={floodPolys} floodFailed={flood.status === 'error'} onPlan={onPlan} editor={editor} openPlanId={openPlanId} onPlanOpened={onPlanOpened} onSummary={setDraftSummary} />
        </section>
      )}

      {isMeck && cltZoning && (
        <section className="section">
          <h3>Rezoning outlook</h3>
          <RezoningSection parcel={parcel} zoning={cltZoning} place={place} fromPetition={fromPetition} />
        </section>
      )}

      <section className="section">
        <h3>Site conditions</h3>
        <CheckRow label="Flood" state={flood} />
        <CheckRow label="Soils" state={soils} />
        <CheckRow label="Sewer" swatch="#38A169" state={sewer} />
        <CheckRow label="Water" swatch="#2F7DE1" state={water} />
        <CheckRow label="Zoning" state={cabZoning} />
        <CheckRow label="Zoning" state={yZoning} />
        <CheckRow label="Zoning" state={uZoning} />
        <CheckRow label="Utilities" swatch="#2F7DE1" state={yUtility} />
        <CheckRow label="2035 plan" state={yLandUse} />
        {isMeck && <p className="note">Charlotte Water doesn't publish its pipe network. These distances come from the mains it described in nearby rezoning reviews, so they confirm a main exists but may not show the closest one.</p>}
      </section>

      <section className="section">
        <h3>Ownership and value</h3>
        <dl className="facts">
          <dt>Mailing address</dt><dd>{p.mail || '—'}</dd>
          <dt>{isMeck || isUnion ? 'Market value' : isYork ? 'Appraised value' : 'Assessed value'}</dt><dd>{money(p.assessed)}</dd>
          {(!isUnion || p.land) && <><dt>Land</dt><dd>{money(p.land)}</dd></>}
          {(!isUnion || p.building) && <><dt>Buildings</dt><dd>{money(p.building)}</dd></>}
          <dt>Last sale</dt>
          <dd>
            {sale}
            {deed && <MultiParcelSale deed={deed} price={p.salePrice} />}
          </dd>
          {p.priorSales?.length > 0 && (
            <><dt>Earlier sales</dt><dd>{p.priorSales.map((x) => `${money(x.price)} · ${new Date(x.date).getMonth() + 1}/${new Date(x.date).getFullYear()}`).join('; ')}</dd></>
          )}
          <dt>Deed</dt><dd>{p.deed || '—'}</dd>
          <dt>Legal description</dt><dd>{p.legal || '—'}</dd>
          <dt>{isYork || isUnion ? 'Subdivision' : 'Neighborhood'}</dt><dd>{p.neighborhood || '—'}</dd>
          {p.yearBuilt && <><dt>Year built</dt><dd>{p.yearBuilt}</dd></>}
        </dl>
      </section>

      <p className="sources">
        {isMeck ? 'Mecklenburg County / City of Charlotte GIS, Charlotte UDO, Charlotte Water rezoning comments, FEMA NFHL, USDA NRCS.'
          : isYork ? 'York County GIS, City of Rock Hill zoning, FEMA NFHL, USDA NRCS.'
          : isUnion ? 'Union County GIS (parcels and county and town zoning), FEMA NFHL, USDA NRCS.'
          : 'Cabarrus County GIS, City of Concord Utilities, FEMA NFHL, USDA NRCS.'}
        {' '}Planning estimates, not survey or legal advice.
      </p>
    </aside>
  )
}

function MultiParcelSale({ deed, price }) {
  const perAcre = deed.totalAcres > 0 ? price / deed.totalAcres : null
  return (
    <div className="multi-sale">
      <strong>Sale may include {deed.count}{deed.capped ? '+' : ''} parcels.</strong>{' '}
      The same deed covers {deed.count - 1} other parcel{deed.count > 2 ? 's' : ''}, and the county records the full price on each.
      {' '}{money(price)} likely bought all {deed.count}: {deed.totalAcres.toFixed(2)} acres
      {deed.totalValue > 0 ? <>, {money(deed.totalValue)} combined value</> : null}
      {perAcre ? <>, about {money(perAcre)} per acre</> : null}.
      <details>
        <summary>Other parcels on this deed</summary>
        <ul>
          {deed.others.slice(0, 12).map((o) => (
            <li key={o.id}>{o.address || `Parcel ${o.id}`} <span>· {o.acres.toFixed(2)} ac</span></li>
          ))}
          {deed.others.length > 12 && <li>+{deed.others.length - 12} more</li>}
        </ul>
      </details>
    </div>
  )
}
