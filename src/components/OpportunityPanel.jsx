import { FACTORS, DEFAULT_WEIGHTS, SCORE_COLORS, topDrivers, areaName } from '../lib/opportunity'

const scoreColor = (s) => [...SCORE_COLORS].reverse().find(([t]) => s >= t)[1]

export default function OpportunityPanel({ data, scored, weights, setWeights, selected, onSelect }) {
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

  return (
    <div className="opp">
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
