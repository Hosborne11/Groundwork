import { useEffect, useMemo, useState } from 'react'
import * as turf from '@turf/turf'
import NeighborhoodCard from './NeighborhoodCard'
import { charlotteZoning } from '../lib/charlotte'
import { floodShare } from '../lib/gis'
import { N1, parseZoning } from '../data/charlotteUdo'

const fmtAc = (n) => `${Number(n || 0).toFixed(2)} ac`

/**
 * Several parcels combined into one site. Parcel lines rarely meet perfectly, so the shapes are
 * grown by half a meter, merged, and shrunk back, which closes hairline gaps between neighbors.
 */
export function combineParcels(parcels) {
  if (!parcels.length) return null
  try {
    const grown = parcels.map((p) => turf.buffer(p, 0.5, { units: 'meters' }))
    const merged = grown.length > 1 ? turf.union(turf.featureCollection(grown)) : grown[0]
    return turf.buffer(merged, -0.5, { units: 'meters' })
  } catch {
    return parcels.length > 1 ? turf.union(turf.featureCollection(parcels)) : parcels[0]
  }
}

export const siteId = (parcels) => `site:${parcels.map((p) => p.properties.id).sort().join('+')}`

export default function AssemblyPanel({ parcels, onRemove, onClear, onClose, onPlan, editor, openPlanId, onPlanOpened }) {
  const [zoning, setZoning] = useState({}) // parcel id -> zoning (or { error })
  const [flood, setFlood] = useState({ status: 'loading' })

  const site = useMemo(() => {
    const combined = combineParcels(parcels)
    if (!combined) return null
    const acres = parcels.reduce((t, p) => t + (p.properties.acres || 0), 0)
    const pieces = combined.geometry.type === 'MultiPolygon'
      ? combined.geometry.coordinates.filter((c) => turf.area(turf.polygon(c)) > 400).length // ignore specks
      : 1
    const first = parcels[0].properties
    return {
      feature: turf.feature(combined.geometry, {
        id: siteId(parcels),
        county: first.county,
        address: `${parcels.length} parcels: ${first.address || first.id}${parcels.length > 1 ? ' and more' : ''}`,
        acres,
      }),
      acres, pieces,
    }
  }, [parcels])

  // zoning for each Mecklenburg parcel
  useEffect(() => {
    let live = true
    for (const p of parcels) {
      const id = p.properties.id
      if (zoning[id] || p.properties.county !== 'Mecklenburg') continue
      charlotteZoning(p).then((z) => live && setZoning((cur) => ({ ...cur, [id]: z || { error: 'none' } })))
        .catch(() => live && setZoning((cur) => ({ ...cur, [id]: { error: 'failed' } })))
    }
    return () => { live = false }
  }, [parcels]) // eslint-disable-line react-hooks/exhaustive-deps

  // floodplain across the whole site
  useEffect(() => {
    if (!site) return
    let live = true
    setFlood({ status: 'loading' })
    floodShare(site.feature).then((r) => live && setFlood({ status: 'done', ...r })).catch(() => live && setFlood({ status: 'error' }))
    return () => { live = false }
  }, [site])

  if (!site) return null

  // Which district governs the draft: the most restrictive (largest minimum lot) of the parcels' N1 districts
  const problems = []
  let governing = null
  const allLoaded = parcels.every((p) => p.properties.county !== 'Mecklenburg' || zoning[p.properties.id])
  for (const p of parcels) {
    const pr = p.properties
    if (pr.county !== 'Mecklenburg') { problems.push(`${pr.address || pr.id} is in ${pr.county} County; site plans work in Charlotte for now.`); continue }
    const z = zoning[pr.id]
    if (!z) continue
    const parts = z.code ? parseZoning(z.code) : null
    if (!parts || !N1[parts.base]) problems.push(`${pr.address || pr.id} is zoned ${z.code || 'unknown'}; drafts need a Neighborhood 1 district.`)
    else if (parts.conditional) problems.push(`${pr.address || pr.id} has conditional zoning (${z.code}); its approved site plan governs instead.`)
    else if (!governing || N1[parts.base].minLotSf > N1[governing].minLotSf) governing = parts.base
  }
  const districts = [...new Set(parcels.map((p) => zoning[p.properties.id]?.code).filter(Boolean))]
  const floodPolys = flood.status === 'done' ? flood.polys || [] : flood.status === 'error' ? [] : null
  const canDraft = allLoaded && !problems.length && governing && parcels.length >= 2

  return (
    <aside className="panel assembly" aria-label="Site assembly">
      <div className="panel-head">
        <button className="close" onClick={onClose} aria-label="Close site assembly">×</button>
        <div className="acres">
          <span className="acres-num">{site.acres.toFixed(site.acres < 10 ? 2 : 1)}</span>
          <span className="acres-unit">acres</span>
        </div>
        <h2 className="owner">Site assembly</h2>
        <div className="addr">{parcels.length} parcel{parcels.length === 1 ? '' : 's'} combined into one site</div>
        <div className="pin">Shift-click parcels on the map to add or remove them</div>
        <div className="actions">
          <button className="btn" onClick={onClear}>Clear all</button>
        </div>
      </div>

      <section className="section">
        <h3>Parcels</h3>
        <ul className="asm-list">
          {parcels.map((p) => {
            const pr = p.properties, z = zoning[pr.id]
            return (
              <li key={pr.id}>
                <div>
                  <strong>{pr.address || pr.id}</strong>
                  <span>{[pr.owner, fmtAc(pr.acres), pr.county !== 'Mecklenburg' ? pr.county : z ? (z.code || 'no zoning found') : 'zoning…'].filter(Boolean).join(' · ')}</span>
                </div>
                <button className="link-btn danger" onClick={() => onRemove(pr.id)} aria-label={`Remove ${pr.address || pr.id}`}>Remove</button>
              </li>
            )
          })}
        </ul>
        <div className="asm-facts">
          <div><span>Combined</span><strong>{fmtAc(site.acres)}</strong></div>
          <div><span>Floodplain</span><strong>{flood.status === 'done' ? `${Math.round(flood.pct || 0)}%` : flood.status === 'error' ? 'unavailable' : '…'}</strong></div>
          <div><span>Zoning</span><strong>{districts.join(', ') || '…'}</strong></div>
        </div>
        {site.pieces > 1 && <p className="note warn">These parcels don’t all touch, so the site is in {site.pieces} separate pieces. The draft uses the largest one.</p>}
        {problems.map((t) => <p key={t} className="note warn">{t}</p>)}
        {canDraft && districts.length > 1 && <p className="note">The parcels have different districts, so the draft uses the most restrictive: <strong>{governing}</strong> ({N1[governing].minLotSf.toLocaleString()} sq ft minimum lots).</p>}
        {parcels.length < 2 && <p className="muted-small">Add at least one more parcel to draft across a combined site.</p>}
      </section>

      {canDraft && (
        <section className="section">
          <h3>Draft across the site</h3>
          <NeighborhoodCard
            key={site.feature.properties.id}
            parcel={site.feature} parts={parcels} code={governing} acres={site.acres}
            floodPolys={floodPolys} floodFailed={flood.status === 'error'}
            onPlan={onPlan} editor={editor} openPlanId={openPlanId} onPlanOpened={onPlanOpened}
          />
        </section>
      )}
    </aside>
  )
}
