import { useState } from 'react'
import { CURRENT, SUFFIXES, LEGACY } from '../data/zoningKey'

const EXAMPLES = [
  ['R-8MF(CD)', 'Multi-family (up to 8 units per acre)'],
  ['B-1', 'Neighborhood Business'], ['B-2', 'General Business'], ['B-D', 'Business Distribution'],
  ['I-1', 'Light Industrial'], ['I-2', 'General Industrial'], ['O-1', 'Office 1'], ['MUDD', 'Mixed Use Development'],
  ['UR-2', 'Urban Residential 2'], ['MX-2', 'Mixed Use Residential 2'], ['NS', 'Neighborhood Services'],
  ['CC', 'Commercial Center'], ['BP', 'Business Park'], ['INST', 'Institutional'], ['RE-3', 'Research 3'],
]

export default function ZoningKey() {
  const [q, setQ] = useState('')
  const match = (...t) => !q || t.join(' ').toLowerCase().includes(q.toLowerCase())

  const groups = CURRENT.map((g) => ({ ...g, items: g.items.filter((i) => match(i.code, i.name, i.desc)) })).filter((g) => g.items.length)
  const suffixes = SUFFIXES.filter((s) => match(s.code, s.name, s.desc))
  const legacy = EXAMPLES.filter(([c, n]) => match(c, n))

  return (
    <div className="zkey">
      <div className="zkey-howto">
        <div className="zkey-howto-title">How to read a code</div>
        <div className="zkey-example">
          <span className="zt">N2-A</span><span className="zt sfx">(CD)</span><span className="zt sfx">ANDO</span>
        </div>
        <p><strong>N2-A</strong> is the district: what can be built. <strong>(CD)</strong> means Conditional: approved with a specific site plan. <strong>ANDO</strong> is an overlay: extra rules or notices on top.</p>
        <p className="muted-small">Tip: hover or tap any code in Groundwork to see what it means.</p>
      </div>

      <input className="flyout-filter" type="search" placeholder="Search codes, like N2-B or conditional" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search zoning codes" />

      {groups.map((g) => (
        <section key={g.group} className="zkey-group">
          <h3>{g.group}</h3>
          <dl>{g.items.map((i) => <Entry key={i.code} code={i.code} name={i.name} desc={i.desc} />)}</dl>
        </section>
      ))}

      {suffixes.length > 0 && (
        <section className="zkey-group">
          <h3>Suffixes and overlays</h3>
          <dl>{suffixes.map((s) => <Entry key={s.code} code={s.code} name={s.name} desc={s.desc} />)}</dl>
        </section>
      )}

      {legacy.length > 0 && (
        <section className="zkey-group">
          <h3>Pre-2023 districts</h3>
          <p className="muted-small">Charlotte replaced these with the UDO in June 2023, but many conditional sites still carry them and develop under their approved plans.</p>
          <dl>{legacy.map(([c, n]) => <Entry key={c} code={c} name={n} />)}</dl>
          {!q && <p className="muted-small">R-3 to R-8 are single-family districts and R-8MF to R-43MF are multi-family; the number is the maximum homes per acre.</p>}
        </section>
      )}

      {!groups.length && !suffixes.length && !legacy.length && <p className="muted">No codes match "{q}".</p>}
      <p className="muted-small">Based on the Charlotte UDO and City of Charlotte zoning labels. The official text is at read.charlotteudo.org.</p>
    </div>
  )
}

function Entry({ code, name, desc }) {
  return (
    <div className="zkey-entry">
      <dt><span className="zt">{code}</span></dt>
      <dd><strong>{name}</strong>{desc && <span>{desc}</span>}</dd>
    </div>
  )
}
