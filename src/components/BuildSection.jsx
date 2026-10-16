import { N1, N1_COVERAGE, N1_USES, N1_SOURCE, UDO_HOME, districtByCode, parseZoning, CONSERVATION_MIN_ACRES } from '../data/charlotteUdo'
import { n1Yield, LOT_EFFICIENCY } from '../lib/analysis'

const OVERLAY_NAMES = { HDO: 'Historic District Overlay', ANDO: 'Airport Noise Disclosure Overlay', PED: 'Pedestrian Overlay' }
const sf = (n) => `${n.toLocaleString()} sq ft`

export default function BuildSection({ zoning, acres, floodPct }) {
  if (zoning === undefined) return <p className="pending">Loading zoning…</p>
  if (zoning === null) {
    return <p className="note">Outside City of Charlotte zoning. Town zoning rules for this area aren't loaded yet.</p>
  }

  const z = parseZoning(zoning.code)
  const district = districtByCode[z.base]
  const overlays = [...z.overlays, zoning.overlay].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)

  return (
    <div className="build">
      <div className="zone-head">
        <span className="zone-code">{zoning.code}</span>
        <span className="zone-name">{district?.name || zoning.className}</span>
      </div>
      {overlays.length > 0 && (
        <div className="chips">
          {overlays.map((o) => <span key={o} className="chip">{OVERLAY_NAMES[o.replace('-O', '')] || o}</span>)}
        </div>
      )}

      {z.conditional && (
        <p className="note warn">
          Conditional district: development follows the site plan approved
          {zoning.petition ? <> with petition <strong>{zoning.petition}</strong></> : ''}, not just the base district rules.
          {zoning.link && <> <a href={zoning.link} target="_blank" rel="noreferrer">Open petition</a></>}
        </p>
      )}

      {!district && (
        <p className="note">
          {z.base} is a pre-2023 district carried over from the old zoning ordinance. Its standards aren't in the app yet.
        </p>
      )}

      {district && !N1[z.base] && (
        <p className="note">
          Standards for {district.name} aren't loaded yet. See <a href={UDO_HOME} target="_blank" rel="noreferrer">UDO Article {district.article}</a>.
        </p>
      )}

      {N1[z.base] && <N1Detail code={z.base} acres={acres} floodPct={floodPct} conditional={z.conditional} />}
    </div>
  )
}

function N1Detail({ code, acres, floodPct, conditional }) {
  const std = N1[code]
  const y = n1Yield(code, acres, floodPct)
  return (
    <>
      <p className="uses">{code === 'N1-F' ? N1_USES['N1-F'] : N1_USES.standard}</p>
      <dl className="facts compact">
        <dt>Min lot area</dt><dd>{sf(std.minLotSf)}</dd>
        <dt>Min lot width</dt><dd>{std.minWidthFt} ft</dd>
        <dt>Side / rear setback</dt><dd>{std.sideFt} ft / {std.rearFt} ft</dd>
        <dt>Max height</dt><dd>{std.heightFt} ft (residential)</dd>
        <dt>Coverage</dt><dd>{N1_COVERAGE.replace('Max building coverage: ', '')}</dd>
      </dl>

      {y && !conditional && (
        <div className="yield">
          {y.singleLot ? (
            <p className="yield-main">Single lot: room for one home, duplex, or triplex.</p>
          ) : (
            <>
              <p className="yield-main"><span className="yield-num">≈ {y.conventional}</span> lots by right</p>
              <p className="yield-detail">
                {y.smallSite
                  ? `A lot split with no new street, if frontage allows ${std.minWidthFt} ft per lot.`
                  : `Standard subdivision, assuming ${Math.round(LOT_EFFICIENCY * 100)}% of ${floodPct ? 'non-floodplain ' : ''}land ends up in lots after streets and stormwater.`}
                {floodPct == null ? ' Floodplain not checked yet.' : ''}
              </p>
            </>
          )}
          {y.conservationMax != null && (
            <p className="yield-alt">
              <strong>Up to {y.conservationMax} lots</strong> as a conservation subdivision (gross acreage ÷ {sf(std.minLotSf)}, with lots up to 50% smaller and 10% common open space; sites of {CONSERVATION_MIN_ACRES}+ acres).
            </p>
          )}
          {y.mixedIncome && (
            <p className="yield-alt">
              <strong>≈ {y.mixedIncome.total} lots</strong> with the mixed-income bonus (build to {y.mixedIncome.district} standards; about {y.mixedIncome.affordableLots} of the {y.mixedIncome.bonusLots} bonus lots go to homes affordable at 80% AMI or less).
            </p>
          )}
        </div>
      )}
      <p className="cite">
        <a href={N1_SOURCE.url} target="_blank" rel="noreferrer">{N1_SOURCE.label}</a>, checked {N1_SOURCE.checked}. Front setbacks vary by street type; see Table 4-2.
      </p>
    </>
  )
}
