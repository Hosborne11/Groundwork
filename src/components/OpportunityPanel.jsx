import { useEffect, useState } from 'react'
import { FACTORS, DEFAULT_WEIGHTS, SCORE_COLORS, topDrivers, areaName, TREND_METRICS, countyTotals } from '../lib/opportunity'

const scoreColor = (s) => [...SCORE_COLORS].reverse().find(([t]) => s >= t)[1]

export default function OpportunityPanel({ data, scored, weights, setWeights, selected, onSelect, mode, setMode, metric, setMetric, yearIx, setYearIx, scale, setScale }) {
  if (data === undefined) return <p className="muted">Loading opportunity data…</p>
  if (data === null) {
    return (
      <p className="flyout-note">
        Opportunity data hasn't been built yet. In the project folder run <code>npm run data:opportunity</code>, then commit
        <code> public/data/opportunity-meck.json</code>.
      </p>
    )
  }
  const sel = selected != null ? scored?.byId[selected] : null
  const generated = new Date(data.generated).toLocaleDateString()

  const tabs = (
    <div className="seg opp-tabs" role="tablist">
      <button role="tab" aria-selected={mode !== 'trends'} className={mode !== 'trends' ? 'on' : ''} onClick={() => setMode('score')}>Outlook</button>
      <button role="tab" aria-selected={mode === 'trends'} className={mode === 'trends' ? 'on' : ''} onClick={() => setMode('trends')} disabled={!data.years}>Trends</button>
    </div>
  )
  if (mode === 'trends' && data.years) {
    return <div className="opp">{tabs}<TrendsView data={data} metric={metric} setMetric={setMetric} yearIx={yearIx} setYearIx={setYearIx} selected={selected} onSelect={onSelect} scale={scale} setScale={setScale} /></div>
  }

  return (
    <div className="opp">
      {tabs}
      <p className="flyout-note">
        Where Mecklenburg land is likely to develop next, scored from public records. Click any hexagon on the map for the reasons behind its score.
      </p>

      <div className="opp-legend" aria-hidden="true">
        <span style={{ background: `linear-gradient(90deg, ${SCORE_COLORS.map(([t, c]) => `${c} ${t}%`).join(', ')})` }} />
        <div><small>Lower</small><small>Higher opportunity</small></div>
      </div>

      {sel && (
        <section className="opp-sel">
          <div className="opp-sel-head">
            <span className="opp-score" style={{ background: scoreColor(sel.score) }}>{sel.score}</span>
            <div>
              {sel.h.name && <strong className="opp-name">{areaName(sel.h.name)}</strong>}
              <span>Rank {sel.rank} of {scored.count} · top {Math.max(1, Math.round((sel.rank / scored.count) * 100))}% in the county</span>
            </div>
            <button className="close" onClick={() => onSelect(null)} aria-label="Clear selection">×</button>
          </div>
          {FACTORS.map((f) => {
            const p = sel.parts[f.key]
            return (
              <div key={f.key} className="opp-factor">
                <div className="opp-f-top"><span>{f.label}</span><span>{p == null ? 'n/a' : `${Math.round(p * 100)}th pct`}</span></div>
                <div className="opp-bar"><i style={{ width: `${(p ?? 0) * 100}%` }} /></div>
                <small>{f.explain(sel.h.m, sel.h.place)}</small>
              </div>
            )
          })}
          {sel.h.rz?.length > 0 && (
            <div className="opp-rz">
              <small>Rezonings here</small>
              <ul>{sel.h.rz.map(([p, z, s]) => <li key={p}><strong>{p}</strong> {z} <span>{s}</span></li>)}</ul>
            </div>
          )}
        </section>
      )}

      <section className="opp-weights">
        <div className="opp-w-head">
          <strong>What matters most</strong>
          <button className="link-btn" onClick={() => setWeights(DEFAULT_WEIGHTS)}>Reset</button>
        </div>
        {FACTORS.map((f) => (
          <label key={f.key} className="slider">
            <span>{f.label} <strong>{weights[f.key]}</strong></span>
            <input type="range" min={0} max={50} step={5} value={weights[f.key]} onChange={(e) => setWeights({ ...weights, [f.key]: Number(e.target.value) })} />
          </label>
        ))}
      </section>

      {scored && (
        <section className="opp-top">
          <strong>Top areas</strong>
          <ol>
            {scored.ranked.slice(0, 10).map((x) => (
              <li key={x.h.id}>
                <button className={selected === x.h.id ? 'on' : ''} onClick={() => onSelect(x.h.id, true)}>
                  <span className="opp-score sm" style={{ background: scoreColor(x.score) }}>{x.score}</span>
                  <span className="opp-why">
                    <strong>{areaName(x.h.name) || 'Unnamed area'}</strong>
                    <small>{topDrivers(x, weights).join(' · ') || 'mixed signals'}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="cite">
        Built {generated} from City of Charlotte rezoning records, Mecklenburg parcel and vacant-land data, Charlotte Water statements, and the
        Charlotte Future 2040 Policy Map. Each hexagon is about 0.4 square miles. A screening tool, not a forecast.
      </p>
    </div>
  )
}

/* ---------------- Trends tab ---------------- */
function Bars({ values, years, active, height = 64, onPick }) {
  const max = Math.max(1, ...values)
  const w = 100 / values.length
  return (
    <div className="bars-wrap">
      <svg className="bars" style={{ height }} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label="Counts by year">
        {values.map((v, i) => {
          const h = (v / max) * (height - 2)
          return (
            <rect key={i} x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={Math.max(h, v ? 1 : 0)}
              className={i === active ? 'on' : ''} onClick={onPick ? () => onPick(i) : undefined} style={onPick ? { cursor: 'pointer' } : undefined} />
          )
        })}
      </svg>
      {/* year labels as regular text so they never stretch with the chart */}
      <div className="bars-years">{years.map((y, i) => <span key={y} className={i === active ? 'on' : ''}>{`'${String(y).slice(2)}`}</span>)}</div>
    </div>
  )
}

function TrendsView({ data, metric, setMetric, yearIx, setYearIx, selected, onSelect, scale, setScale }) {
  const [playing, setPlaying] = useState(false)
  const years = data.years
  const totals = countyTotals(data, metric)
  const m = TREND_METRICS.find((x) => x.key === metric)
  const sel = selected != null ? data.hexes.find((h) => h.id === selected) : null
  const partial = data.partialYear && years[yearIx] === data.partialYear.year

  // play through the years
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setYearIx((i) => ((i ?? years.length - 1) + 1) % years.length), 1100)
    return () => clearInterval(t)
  }, [playing, years.length, setYearIx])

  return (
    <>
      <p className="flyout-note">How activity has moved across Mecklenburg since {years[0]}.</p>
      <div className="seg" role="group" aria-label="Measure">
        {TREND_METRICS.map((x) => <button key={x.key} className={metric === x.key ? 'on' : ''} onClick={() => setMetric(x.key)}>{x.label}</button>)}
      </div>

      <div className="trend-year">
        <button className="btn" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>{playing ? 'Pause' : 'Play'}</button>
        <input type="range" min={0} max={years.length - 1} value={yearIx} onChange={(e) => { setPlaying(false); setYearIx(Number(e.target.value)) }} aria-label="Year" />
        <strong>{years[yearIx]}</strong>
      </div>

      <div className="trend-scale">
        <span>Color scale</span>
        <div className="seg" role="group" aria-label="Color scale">
          <button className={scale === 'all' ? 'on' : ''} onClick={() => setScale('all')} aria-pressed={scale === 'all'}>All years</button>
          <button className={scale === 'year' ? 'on' : ''} onClick={() => setScale('year')} aria-pressed={scale === 'year'}>This year only</button>
        </div>
      </div>
      <p className="muted-small">{scale === 'all' ? 'One scale for every year, so a hotter color always means more activity.' : `Scaled to ${years[yearIx]}'s busiest area, so the year's relative hot spots stand out even when activity is low.`}</p>

      <section className="trend-chart">
        <div className="trend-head"><span>County total: {m.label.toLowerCase()}</span><strong>{totals[yearIx].toLocaleString()}</strong></div>
        <Bars values={totals} years={years} active={yearIx} onPick={(i) => { setPlaying(false); setYearIx(i) }} />
        {partial && <small className="muted-small">{years[yearIx]} runs through {new Date(data.partialYear.through).toLocaleDateString()}, so it's a partial year.</small>}
      </section>

      {sel ? (
        <section className="opp-sel">
          <div className="opp-sel-head">
            <div><strong className="opp-name">{areaName(sel.name) || 'Selected area'}</strong><span>Year by year</span></div>
            <button className="close" onClick={() => onSelect(null)} aria-label="Clear selection">×</button>
          </div>
          {TREND_METRICS.map((x) => (
            <div key={x.key} className="trend-mini">
              <div className="trend-head"><span>{x.label}</span><strong>{(sel.t?.[x.key] || []).reduce((a, b) => a + b, 0)} total</strong></div>
              <Bars values={sel.t?.[x.key] || years.map(() => 0)} years={years} active={yearIx} height={34} />
            </div>
          ))}
        </section>
      ) : (
        <p className="muted-small">Click any hexagon on the map to see its own year-by-year activity.</p>
      )}

      <p className="cite">Rezonings from City of Charlotte records (filed by date received, approved by approval date). Land sales are vacant-land sales, counted once per deed.</p>
    </>
  )
}
