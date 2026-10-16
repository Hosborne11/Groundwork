import { useEffect, useMemo, useState } from 'react'
import { DISTRICTS, districtByCode, parseZoning, PLACE_TYPE_FIT, placeTypeKey } from '../data/charlotteUdo'
import { nearbyHistory, activePetitions, cityBaseRates, placeTypesAround, placeTypeAt } from '../lib/charlotte'
import { rezoningOutlook, areaTrend, FAMILY_NAME } from '../lib/analysis'
import ZoneCode from './ZoneCode'

const fmtDate = (d) => (d ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '')

function defaultTarget(currentCode, place) {
  const cur = districtByCode[parseZoning(currentCode || '').base]
  const fit = PLACE_TYPE_FIT[placeTypeKey(place?.name)]
  const candidates = DISTRICTS.filter((d) => fit?.fits.includes(d.family))
  const up = candidates.find((d) => !cur?.rank || !d.rank || d.rank > cur.rank)
  return (up || candidates[0] || districtByCode['N2-A']).code
}

export default function RezoningSection({ parcel, zoning, place, fromPetition }) {
  const [history, setHistory] = useState(null)
  const [active, setActive] = useState([])
  const [rates, setRates] = useState(null)
  const [error, setError] = useState(null)
  const [target, setTarget] = useState(null)

  useEffect(() => {
    let live = true
    Promise.all([nearbyHistory(parcel), activePetitions(parcel).catch(() => []), placeTypesAround(parcel).catch(() => [])])
      .then(([h, a, polys]) => {
        if (!live) return
        // label each nearby petition with its own site's 2040 place type
        setHistory(h.map((x) => ({ ...x, placeName: placeTypeAt(polys, x.point) })))
        setActive(a)
      })
      .catch((e) => live && setError(e.message))
    cityBaseRates().then((r) => live && setRates(r)).catch(() => {})
    return () => { live = false }
  }, [parcel])

  useEffect(() => {
    if (place !== undefined && zoning !== undefined && !target) {
      // Opened from a petition: grade the district actually requested, if it's a UDO district.
      const requested = fromPetition && parseZoning(fromPetition.to).base
      setTarget(requested && districtByCode[requested] ? requested : defaultTarget(zoning?.code, place))
    }
  }, [place, zoning, target, fromPetition])
  const requestedBase = fromPetition && parseZoning(fromPetition.to).base

  const trend = useMemo(() => (history && target ? areaTrend({ history, targetCode: target, place }) : null), [history, target, place])
  const outlook = useMemo(() => {
    if (!history || !target) return null
    return rezoningOutlook({ currentCode: zoning?.code, targetCode: target, place, history, active, trend })
  }, [history, active, target, zoning, place, trend])

  if (zoning === null) return null
  if (error) return <p className="pending">Rezoning history didn't load. Try again shortly.</p>

  return (
    <div className="outlook">
      {fromPetition && (
        <p className="note petition-note">
          Petition <strong>{fromPetition.petition}</strong> requests <strong>{fromPetition.to ? <ZoneCode code={fromPetition.to} /> : 'a change'}</strong>
          {requestedBase && !districtByCode[requestedBase] ? '. That isn\'t a UDO district, so pick one below to compare.' : '. The outlook below grades that request.'}
        </p>
      )}
      <label className="target">
        <span>If rezoned to</span>
        <select value={target || ''} onChange={(e) => setTarget(e.target.value)}>
          {DISTRICTS.map((d) => <option key={d.code} value={d.code}>{d.code} · {d.name}</option>)}
        </select>
      </label>

      {!outlook ? <p className="pending">Checking the Policy Map and nearby decisions…</p> : (
        <>
          <div className={`verdict v-${outlook.verdict.toLowerCase()}`}>{outlook.verdict}</div>
          {outlook.factors.map((f) => (
            <div key={f.title} className={`check tone-${f.tone}`}>
              <div className="check-body full">
                <div className="check-value small">{f.title}</div>
                <div className="check-detail">{f.detail}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {trend && <AreaTrend trend={trend} target={districtByCode[target]} place={place} />}

      {rates && (
        <p className="base-rates">
          Citywide since 2020: {rates.pct('App')}% of decided petitions were approved, {rates.pct('Wd')}% withdrawn, {rates.pct('Den') || '<1'}% denied.
          {rates.days.median && <> Since the UDO, approvals took a median of {rates.days.median} days ({rates.days.p25}–{rates.days.p75} for the middle half).</>}
          {' '}Withdrawal, not denial, is the usual way a rezoning fails.
        </p>
      )}

      {history?.length > 0 && (
        <details className="nearby">
          <summary>Nearby petitions since 2020 ({history.length})</summary>
          <ul>
            {history.slice(0, 12).map((h) => (
              <li key={h.petition}>
                <span className="np-id">{h.petition}</span>
                <span className="np-change"><ZoneCode code={h.from} /> → <ZoneCode code={h.to} />{h.placeName && <span className="np-place">on {h.placeName}</span>}</span>
                <span className={`np-status s-${h.status.toLowerCase()}`}>{h.status}</span>
                <span className="np-date">{fmtDate(h.received)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="cite">
        Charlotte Rezoning History and Future 2040 Policy Map. A planning screen, not a prediction of a council vote; staff make the official consistency finding.
      </p>
    </div>
  )
}

const list = (items) => items.slice(0, 4).map((h) => h.petition).join(', ') + (items.length > 4 ? `, +${items.length - 4} more` : '')

function AreaTrend({ trend, target, place }) {
  const { approved, exceptions, precedent, top, anyApprox } = trend
  if (!approved.length) {
    return (
      <div className="trend">
        <div className="trend-title">Area trend</div>
        <p>No rezonings approved within ½ mile since 2020, so there's no local pattern to read.</p>
      </div>
    )
  }
  const familyLabel = FAMILY_NAME[target?.family] || target?.family
  const lines = []
  if (precedent.length) {
    lines.push(<p key="p"><strong>Precedent:</strong> {precedent.length} {familyLabel} request{precedent.length > 1 ? 's' : ''} on {place?.name || 'the same'} land nearby {precedent.length > 1 ? 'were' : 'was'} approved ({list(precedent)}).</p>)
  } else if (target && place?.name) {
    lines.push(<p key="p"><strong>No direct precedent:</strong> no {familyLabel} request on {place.name} land nearby has been approved since 2020.</p>)
  }
  if (exceptions.length) {
    lines.push(<p key="e"><strong>Plan exceptions:</strong> {exceptions.length} of {approved.length} nearby approvals went beyond their site's place type ({list(exceptions)}). Council has been flexible with the plan here.</p>)
  } else {
    lines.push(<p key="e"><strong>Plan followed:</strong> all {approved.length} nearby approvals matched their site's place type, so requests that depart from the plan would be new for this area.</p>)
  }
  if (top.length) {
    lines.push(<p key="t"><strong>Direction:</strong> approvals nearby have mostly been for {top.map(([f, n]) => `${FAMILY_NAME[f] || f} (${n})`).join(', ')}.</p>)
  }
  return (
    <div className="trend">
      <div className="trend-title">Area trend · ½ mile since 2020</div>
      {lines}
      {anyApprox && <p className="trend-note">Pre-2023 district codes are matched to their closest current district, so some categories are approximate.</p>}
    </div>
  )
}
