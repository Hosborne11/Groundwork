// Opportunity scoring for the hexagon grid built by `npm run data:opportunity`.
// Each factor becomes a percentile across the county; the score is a weighted blend (0–100).

const DATA_URL = '/data/opportunity-meck.json'

const money = (v) => (v == null ? '—' : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}K`)
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

export const FACTORS = [
  {
    key: 'rezoning', label: 'Rezoning momentum', weight: 25,
    value: (m) => m.rezApproved + 1.5 * m.rezActive + m.rezAcres / 20,
    explain: (m) => m.rezApproved + m.rezActive
      ? `${plural(m.rezApproved, 'rezoning')} approved in 3 years, ${m.rezActive} in process (${Math.round(m.rezAcres)} ac)`
      : 'No recent rezonings',
  },
  {
    key: 'sales', label: 'Land sales activity', weight: 20,
    value: (m) => m.sales + m.saleAcres / 5,
    explain: (m) => (m.sales ? `${plural(m.sales, 'vacant-land sale')} in 2 years (${Math.round(m.saleAcres)} ac)` : 'No recent vacant-land sales'),
  },
  {
    key: 'trend', label: 'Land price trend', weight: 10,
    value: (m) => m.priceTrend, // null when there aren't enough comparable sales
    explain: (m) => {
      if (m.priceTrend == null) return 'Too few comparable land sales nearby to measure (needs 5+ in each period)'
      const pct = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`
      const bands = (m.trendBands || []).map((b) => `${b.band === 'small' ? 'lots under 1 ac' : 'tracts of 1+ ac'} ${pct(b.trend)} (${money(b.prior)} → ${money(b.recent)}/ac, ${b.nP} → ${b.nR} sales)`)
      const capped = (m.trendBands || []).some((b) => b.trend > 1.5 || b.trend < -0.5)
      return `${pct(m.priceTrend)} per acre on comparable land nearby: ${bands.join('; ')}${capped ? ' (capped)' : ''}`
    },
  },
  {
    key: 'land', label: 'Developable land', weight: 25,
    value: (m) => m.bigVacantAc,
    explain: (m) => (m.bigVacantN ? `${Math.round(m.bigVacantAc)} ac across ${plural(m.bigVacantN, 'vacant parcel')} of 2+ acres` : 'No vacant parcels of 2+ acres'),
  },
  {
    key: 'utilities', label: 'Utilities nearby', weight: 10,
    value: (m) => (m.sewer > 0 ? 1 : 0) + (m.water > 0 ? 1 : 0),
    explain: (m) => (m.sewer || m.water
      ? `Charlotte Water reported ${[m.sewer && 'sewer', m.water && 'water'].filter(Boolean).join(' and ')} mains here`
      : 'No water or sewer mains on record here (records come from rezoning reviews)'),
  },
  {
    key: 'plan', label: '2040 plan support', weight: 5,
    value: (m) => m.growthShare,
    explain: (m, place) => `${Math.round(m.growthShare * 100)}% planned for more than single-family${place ? ` · mostly ${place}` : ''}`,
  },
]
export const DEFAULT_WEIGHTS = Object.fromEntries(FACTORS.map((f) => [f.key, f.weight]))

let loading = null
export function loadOpportunity() {
  if (!loading) loading = fetch(DATA_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  return loading
}

/** Percentile (0–1) of each value among all hexagons; null values stay null. */
function percentiles(values) {
  const present = values.map((v, i) => [v, i]).filter(([v]) => v != null).sort((a, b) => a[0] - b[0])
  const out = values.map(() => null)
  let i = 0
  while (i < present.length) {
    let j = i
    while (j + 1 < present.length && present[j + 1][0] === present[i][0]) j++
    const p = present.length > 1 ? ((i + j) / 2) / (present.length - 1) : 0.5 // ties share a rank
    for (let k = i; k <= j; k++) out[present[k][1]] = present[k][0] === 0 ? 0 : p // no activity = bottom
    i = j + 1
  }
  return out
}

/** Score every hexagon with the given weights. */
export function scoreHexes(data, weights) {
  const hexes = data.hexes
  const pct = Object.fromEntries(FACTORS.map((f) => [f.key, percentiles(hexes.map((h) => f.value(h.m)))]))
  const total = FACTORS.reduce((t, f) => t + (weights[f.key] || 0), 0) || 1
  const scored = hexes.map((h, i) => {
    const parts = Object.fromEntries(FACTORS.map((f) => [f.key, pct[f.key][i]]))
    // a factor with no data (price trend with too few sales) counts as middle-of-the-road
    const s = FACTORS.reduce((t, f) => t + (weights[f.key] || 0) * (parts[f.key] ?? 0.5), 0) / total
    return { h, score: Math.round(s * 100), parts }
  })
  const ranked = [...scored].sort((a, b) => b.score - a.score)
  ranked.forEach((x, i) => { x.rank = i + 1 })
  const fc = {
    type: 'FeatureCollection',
    features: scored.map((x) => ({ type: 'Feature', properties: { id: x.h.id, score: x.score }, geometry: { type: 'Polygon', coordinates: [x.h.g] } })),
  }
  return { fc, byId: Object.fromEntries(scored.map((x) => [x.h.id, x])), ranked, count: scored.length }
}

/** The two factors doing the most for a hexagon's score. */
export function topDrivers(x, weights) {
  return FACTORS.map((f) => ({ f, v: (weights[f.key] || 0) * (x.parts[f.key] ?? 0) }))
    .filter((d) => d.v > 0).sort((a, b) => b.v - a.v).slice(0, 2).map((d) => d.f.label.toLowerCase())
}

// Tidy county street names for display: "N I-85 Hy & S I-85 Hy" -> "I-85", "Owen Bv" -> "Owen Blvd"
const ABBREV = { Bv: 'Blvd', Hy: 'Hwy', Py: 'Pkwy', Wy: 'Way', Cr: 'Cir', Av: 'Ave', Tl: 'Trl', Pl: 'Pl' }
export function areaName(raw) {
  if (!raw) return null
  const [streets, ...town] = raw.split(', ')
  const parts = streets.split(' & ').map((n) => n
    .replace(/\b(I-\d+) Hy\b/, '$1') // interstates read better without "Hwy"
    .replace(/\b(Bv|Hy|Py|Wy|Cr|Av|Tl)\b/g, (m) => ABBREV[m]))
  // the same road listed for both directions ("N I-85" and "S I-85") counts once
  const base = (n) => n.replace(/^[NSEW] /, '')
  const unique = parts.filter((n, i) => parts.findIndex((o) => base(o) === base(n)) === i)
  const shown = unique.length < parts.length ? unique.map(base) : unique
  return [shown.join(' & '), ...town].join(', ')
}

export const SCORE_COLORS = [[0, '#2C7BB6'], [25, '#ABD9E9'], [50, '#FFFFBF'], [70, '#FDAE61'], [85, '#D7191C']]

/* ---------------- trends over time ---------------- */
export const TREND_METRICS = [
  { key: 'filed', label: 'Rezonings filed', unit: 'petition' },
  { key: 'approved', label: 'Rezonings approved', unit: 'approval' },
  { key: 'sales', label: 'Land sales', unit: 'vacant-land sale' },
]

/** Hexagons colored by one measure in one year, on a scale shared by all years. */
export function trendCollection(data, metric, yearIx) {
  const max = Math.max(1, ...data.hexes.flatMap((h) => h.t?.[metric] || []))
  return {
    type: 'FeatureCollection',
    features: data.hexes.map((h) => {
      const v = h.t?.[metric]?.[yearIx] || 0
      // square root keeps small counts visible next to a few very busy areas
      return { type: 'Feature', properties: { id: h.id, v, score: v ? Math.round(100 * Math.sqrt(v / max)) : 0 }, geometry: { type: 'Polygon', coordinates: [h.g] } }
    }),
  }
}

/** County-wide totals per year for one measure. */
export const countyTotals = (data, metric) => data.years.map((_, i) => data.hexes.reduce((t, h) => t + (h.t?.[metric]?.[i] || 0), 0))
