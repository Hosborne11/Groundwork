import { useEffect, useState } from 'react'
import * as turf from '@turf/turf'
import { approvalContext } from '../lib/charlotte'
import { itApprovalContext } from '../lib/indianTrail'
import { concordApprovalContext, monroeApprovalContext, matthewsApprovalContext, mintHillApprovalContext, huntersvilleApprovalContext, pinevilleApprovalContext, kannapolisApprovalContext, harrisburgApprovalContext, waxhawApprovalContext } from '../lib/towns'
import { districtLabel } from '../data/towns'

// each town's own lookup; Charlotte uses its petition history
const LOOKUP = { 'Indian Trail': itApprovalContext, Concord: concordApprovalContext, Monroe: monroeApprovalContext, Matthews: matthewsApprovalContext, 'Mint Hill': mintHillApprovalContext, Huntersville: huntersvilleApprovalContext, Pineville: pinevilleApprovalContext, Kannapolis: kannapolisApprovalContext, Harrisburg: harrisburgApprovalContext, Waxhaw: waxhawApprovalContext }
import { policyFit, jurisdictionOf } from '../data/charlotteUdo'

const monthYear = (d) => d?.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const poss = (t) => (/s$/i.test(t) ? `${t}’` : `${t}’s`) // Matthews’ map, Concord’s map
const titleCase = (t) => t.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())

/**
 * Factors staff and City Council weigh on a rezoning, shown for the scenario district.
 * Deliberately a list of factors, not a prediction.
 */
export default function ApprovalContext({ parcel, code: key, placeType, editor, onFactors, apartments = false }) {
  const code = districtLabel(key) // what people see; `key` is the rules key (e.g. Mint Hill's "MH:R-CD")
  const [ctx, setCtx] = useState(null)
  const [state, setState] = useState('loading')
  const [active, setActive] = useState(null)

  useEffect(() => {
    let live = true
    setState('loading'); setCtx(null); setActive(null)
    ;(LOOKUP[jurisdictionOf(key)] || approvalContext)(parcel, key)
      .then((c) => { if (live) { setCtx(c); setState('done') } })
      .catch(() => { if (live) setState('error') })
    return () => { live = false }
  }, [parcel, key])

  // precedent outlines on the map while this section is showing
  useEffect(() => {
    if (!ctx || !editor?.showPrecedents) return
    const shapes = [...ctx.precedents, ...ctx.pending].filter((p) => p.shape)
      .map((p) => ({ ...p.shape, properties: { petition: p.petition, active: p.petition === active } }))
    editor.showPrecedents(turf.featureCollection(shapes))
  }, [ctx, active, editor])
  useEffect(() => () => editor?.showPrecedents?.(null), [editor])

  const fit = policyFit(key, placeType)
  // highlight one case and fit the view to it and the parcel
  const show = (p) => {
    setActive(p.petition)
    if (!p.shape) return
    const shapes = [...ctx.precedents, ...ctx.pending].filter((x) => x.shape).map((x) => ({ ...x.shape, properties: { petition: x.petition, active: x.petition === p.petition } }))
    editor?.showPrecedents?.(turf.featureCollection(shapes), turf.featureCollection([p.shape, parcel]))
  }

  const view = ctx && state === 'done' ? (() => {

    const within2 = ctx.precedents.filter((p) => p.miles != null && p.miles <= 2)
    const tally = (list) => {
      const t = {}
      for (const p of list) t[p.status] = (t[p.status] || 0) + 1
      return Object.entries(t).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ')
    }
    const city = ctx.cityCounts
    const cityTotal = Object.values(city).reduce((a, b) => a + b, 0)
    const isN2 = code.startsWith('N2') || code === 'MFR' || apartments // the higher-intensity scenarios expected on thoroughfares
    const factors = [
      { tone: fit.fit === 'consistent' ? 'good' : fit.fit === 'inconsistent' ? 'warn' : 'neutral', title: jurisdictionOf(key) === 'Charlotte' ? '2040 Policy Map' : jurisdictionOf(key) === 'Indian Trail' ? 'Comprehensive Plan' : 'Land use plan', text: fit.note },
      {
        tone: ctx.precedents.some((p) => p.status === 'Approved') || ctx.conditionalCounts?.within2 > 0 ? 'good' : 'neutral',
        title: 'Nearby precedents',
        text: ctx.zonedParcels
          ? `${ctx.zonedParcels.within5.toLocaleString()} parcels within 5 miles are already zoned ${code} on ${poss(ctx.town)} map, about ${Math.round(ctx.zonedParcels.acres5).toLocaleString()} acres; ${ctx.zonedParcels.within2.toLocaleString()} within 2 miles. The map doesn’t record rezoning cases, so this shows how established the district is nearby, not approval history.`
          : ctx.zonedAreas
          ? (ctx.precedents.length
            ? `${plural(ctx.precedents.length, 'area')} zoned ${code} within 5 miles on ${ctx.mapName || 'the zoning map'}, about ${Math.round(ctx.precedents.reduce((t, p) => t + (p.acres || 0), 0)).toLocaleString()} acres; ${within2.length ? `${within2.length} within 2 miles` : 'none within 2 miles'}. The map doesn’t record rezoning outcomes, so this shows where the district already exists, not approval history.`
            : `No areas zoned ${code} within 5 miles on ${ctx.mapName || 'the zoning map'}.`)
          : ctx.recordNote
          ? (ctx.precedents.length
            ? `${plural(ctx.precedents.length, 'rezoning')} to ${code} within 5 miles in ${poss(ctx.town)} records (${tally(ctx.precedents)})${(() => { const y = Math.max(...ctx.precedents.map((p) => p.year || 0)); return y ? `, the most recent from ${y}` : '' })()}; ${within2.length ? `${within2.length} within 2 miles` : 'none within 2 miles'}.`
            : `No rezonings to ${code} within 5 miles in ${poss(ctx.town)} records.`)
          : ctx.conditionalCounts
          ? `${ctx.conditionalCounts.within5.toLocaleString()} parcels within 5 miles carry conditional zoning (CD) on ${poss(ctx.town)} map, about ${Math.round(ctx.conditionalCounts.acres5).toLocaleString()} acres; ${ctx.conditionalCounts.within2.toLocaleString()} within 2 miles. ${poss(ctx.town)} map doesn’t record case numbers or which district a conditional rezoning parallels, so this shows how common conditional rezonings are nearby, not approvals to ${code} specifically.`
          : ctx.mapOnly
          ? (ctx.precedents.length
            ? `${plural(ctx.precedents.length, 'approved conditional rezoning')} to ${code} within 5 miles on ${poss(ctx.town)} zoning map, covering ${ctx.precedents.some((p) => p.lots) ? `${ctx.precedents.reduce((t, p) => t + (p.lots || 0), 0).toLocaleString()} lots` : (() => { const a = Math.round(ctx.precedents.reduce((t, p) => t + (p.acres || 0), 0)); return `about ${a.toLocaleString()} ${a === 1 ? 'acre' : 'acres'}` })()}${(() => { const y = Math.max(...ctx.precedents.map((p) => p.year || 0)); return y ? `, the most recent from ${y}` : '' })()}; ${within2.length ? `${within2.length} within 2 miles` : 'none within 2 miles'}. Only approved cases appear on a zoning map, so withdrawn or denied requests aren’t counted.`
            : `No approved conditional rezonings to ${code} within 5 miles on ${poss(ctx.town)} zoning map. This would be a first for the area.`)
          : ctx.precedents.length
            ? `${plural(ctx.precedents.length, 'rezoning')} to ${code} within 5 miles since the UDO took effect in June 2023 (${tally(ctx.precedents)}); ${within2.length ? `${within2.length} of them within 2 miles` : 'none within 2 miles'}.`
            : `No rezonings to ${code} within 5 miles since the UDO took effect in June 2023. This would be a first for the area, which cuts both ways: no precedent to point to, but no history of neighbors fighting one either.`,
      },
      ...(cityTotal ? [{
        tone: 'neutral', title: 'Citywide record',
        text: `Charlotte has decided ${plural(cityTotal, `${code} request`)} since the UDO: ${Object.entries(city).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ')}. Requests losing support are usually withdrawn before a vote rather than denied.`,
      }] : []),
      ...(ctx.recordNote ? [{ tone: 'neutral', title: 'Town record', text: ctx.recordNote }] : []),
    ...(ctx.pending.length ? [{ tone: 'neutral', title: 'In process nearby', text: `${plural(ctx.pending.length, 'petition')} for ${code} currently in process within 5 miles.` }] : []),
      {
        tone: ctx.frontage?.arterial ? 'good' : isN2 || ctx.nearestRoad ? 'warn' : 'neutral',
        title: 'Street frontage',
        text: ctx.frontage
          ? `Fronts ${ctx.frontage.name ? titleCase(ctx.frontage.name) : 'a street'} (${ctx.frontage.kind}).${isN2 ? (ctx.frontage.arterial ? ` ${code === 'MFR' || apartments ? 'Multifamily development is' : 'Neighborhood 2 districts are'} usually expected along thoroughfares like this.` : ` ${code === 'MFR' || apartments ? 'Multifamily development is' : 'Neighborhood 2 districts are'} usually expected along thoroughfares, not local streets.`) : code === 'N1-F' ? (ctx.frontage.arterial ? ' N1-F is usually applied along streets like this.' : ' N1-F is usually applied along arterial streets.') : ''}`
          : ctx.nearestRoad ? `No road touches the parcel; the nearest is ${titleCase(ctx.nearestRoad.name || 'an unnamed road')}, about ${Math.round(ctx.nearestRoad.feet / 10) * 10} ft away. Access may depend on an easement or a neighboring parcel, which a rezoning (and any development) would need to solve.` : 'No street frontage found in the street data.',
      },
      {
        tone: ctx.intenseNeighbors.length ? 'good' : isN2 ? 'warn' : 'neutral',
        title: 'Adjoining zoning',
        text: ctx.neighbors.length
          ? `${ctx.neighbors.join(', ')}.${ctx.intenseNeighbors.length ? ` Next to ${ctx.intenseNeighbors.join(', ')}, so ${code} would be a transition rather than a jump.` : isN2 ? ` Surrounded by lower-intensity zoning, so ${code} would be a step up from everything around it.` : ''}`
          : 'Adjoining zoning couldn’t be determined.',
      },
    ]
    return { within2, factors }
  })() : null
  const factors = view?.factors || []
  const within2 = view?.within2 || []

  // hand the factors up (for the site report); a stable key avoids loops
  const factorsKey = JSON.stringify(factors.map((f) => [f.tone, f.title, f.text]))
  useEffect(() => {
    if (!view) return
    onFactors?.({
      factors: factors.map(({ tone, title, text }) => ({ tone, title, text })),
      cases: [...ctx.precedents.slice(0, 5), ...ctx.pending.slice(0, 3).map((p) => ({ ...p, status: 'In process' }))].map((p) => ({
        petition: p.petition, requested: p.requested, status: p.status, decided: p.decided ? monthYear(p.decided) : p.year ? String(p.year) : null, lots: p.lots,
        miles: p.miles, acres: p.acres, from: p.from,
      })),
    })
  }, [factorsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'loading') return <section className="approval"><h4>Approval context</h4><p className="muted-small">Looking up rezonings near this parcel…</p></section>
  if (state === 'error' || !ctx) return <section className="approval"><h4>Approval context</h4><p className="muted-small">Rezoning history couldn’t be loaded right now.</p></section>

  return (
    <section className="approval">
      <h4>Approval context <span>factors staff and Council weigh, not a prediction</span></h4>
      <ul className="factors">
        {factors.map((f) => (
          <li key={f.title} className={f.tone}>
            <span className="mark" aria-hidden="true">{f.tone === 'good' ? '+' : f.tone === 'warn' ? '!' : '·'}</span>
            <div><strong>{f.title}</strong><span>{f.text}</span></div>
          </li>
        ))}
      </ul>
      {(ctx.precedents.length > 0 || ctx.pending.length > 0) && (
        <>
          <p className="muted-small">Nearest cases (outlined in purple on the map):</p>
          <ul className="precedents">
            {[...ctx.precedents.slice(0, 5), ...ctx.pending.slice(0, 3).map((p) => ({ ...p, status: 'In process' }))].map((p) => (
              <li key={p.petition}>
                <button className={`link-btn ${active === p.petition ? 'on' : ''}`} onClick={() => show(p)} disabled={!p.shape}>
                  <strong>{p.petition}</strong> · {p.requested} · {p.status}{p.decided ? ` ${monthYear(p.decided)}` : p.year ? ` (${p.year})` : ''}
                  {p.miles != null && ` · ${p.miles.toFixed(1)} mi`}{p.lots ? ` · ${p.lots} ${p.lots === 1 ? 'lot' : 'lots'}` : p.acres ? ` · ${Number(p.acres).toFixed(1)} ac` : ''}{p.from ? ` · from ${p.from}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {ctx.failed > 0 && <p className="muted-small">Some of this couldn’t be loaded right now, so the picture may be incomplete.</p>}
    </section>
  )
}
