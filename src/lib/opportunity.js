// Opportunity scoring for the hexagon grid built by `npm run data:opportunity`.
// Each factor becomes a percentile across the county; the score is a weighted blend (0–100).

const DATA_URLS = ['/data/opportunity-meck.json', '/data/opportunity-cabarrus.json', '/data/opportunity-york.json', '/data/opportunity-union.json']
const ALL_FACTORS = ['rezoning', 'sales', 'trend', 'land', 'utilities', 'plan']
const ALL_MEASURES = ['filed', 'approved', 'sales']

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
    key: 'building', label: 'New homes built', weight: 15,
    value: (m) => m.newHomes || 0,
    explain: (m) => (m.newHomes ? `${m.newHomes} new home${m.newHomes === 1 ? '' : 's'} built in the last two years` : 'No new homes recorded in the last two years'),
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
// Location signals, used in both views
const COMMUTE = {
  key: 'commute', label: 'Drive to Uptown', weight: 10,
  value: (m) => (m.commuteMin != null ? -m.commuteMin : null), // shorter is better
  explain: (m) => (m.commuteMin != null ? `${m.commuteMin} min drive to Uptown (${m.commuteMi} mi) in typical traffic, not rush hour` : 'No drive time for this area'),
}
const SCHOOLS = {
  key: 'schools', label: 'Schools nearby', weight: 5,
  value: (m) => (m.schoolMi != null ? -m.schoolMi : null), // closer is better
  explain: (m, place, h) => {
    const s = h?.schools
    if (!s || !Object.keys(s).length) return 'No schools on record nearby'
    return ['Elementary', 'Middle', 'High'].filter((l) => s[l]).map((l) => `${s[l].name} ${s[l].mi.toFixed(1)} mi`).join(' · ')
  },
}
FACTORS.push(COMMUTE, SCHOOLS)
export const DEFAULT_WEIGHTS = Object.fromEntries(FACTORS.map((f) => [f.key, f.weight]))

// "Ahead of the curve": quiet areas that look like they're next
export const EARLY_FACTORS = [
  {
    key: 'spillover', label: 'Busy neighbors, quiet here', weight: 35,
    value: (m, h) => h.early?.spill ?? null,
    explain: (m, place, h) => h.early ? `Surrounding areas rank in the ${ordinalPct(h.early.ringPct)} percentile for activity; this one is in the ${ordinalPct(h.early.ownPct)}` : 'Not enough data',
  },
  {
    key: 'accel', label: 'Picking up speed', weight: 25,
    value: (m, h) => h.early?.accel ?? null,
    explain: (m, place, h) => h.early ? `${h.early.prior} sales, approvals, and new homes in ${h.early.priorYears}; ${h.early.recent} in ${h.early.recentYears}` : 'Not enough data',
  },
  { ...FACTORS.find((f) => f.key === 'land'), weight: 25 },
  { ...COMMUTE, weight: 10 },
  { ...SCHOOLS, weight: 5 },
]
export const DEFAULT_EARLY_WEIGHTS = Object.fromEntries(EARLY_FACTORS.map((f) => [f.key, f.weight]))
const ordinalPct = (p) => { const n = Math.round(p * 100), t = n % 100, o = n % 10; return `${n}${t >= 11 && t <= 13 ? 'th' : o === 1 ? 'st' : o === 2 ? 'nd' : o === 3 ? 'rd' : 'th'}` }

let loading = null
/** Loads every county's file that exists and merges them; each hexagon knows its county. */
export function loadOpportunity() {
  if (!loading) {
    const getJson = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    loading = Promise.all([Promise.all(DATA_URLS.map(getJson)), getJson('/data/schools.json'), getJson('/data/commute.json')]).then(([files, schoolData, commute]) => {
      const got = files.filter(Boolean)
      if (!got.length) return null
      const counties = got.map((f) => ({
        name: f.county || 'Mecklenburg',
        factors: f.factors || ALL_FACTORS,
        measures: f.measures || ALL_MEASURES,
        notes: f.notes || {},
        generated: f.generated,
      }))
      const hexes = got.flatMap((f, i) => f.hexes.map((h) => ({ ...h, m: { ...h.m }, county: counties[i].name })))
      const years = got[0].years
      enrich(hexes, years, schoolData?.schools || [], commute?.times || null)
      // drive times and schools apply to every county when their data exists
      for (const c of counties) {
        if (commute) c.factors = [...c.factors, 'commute']
        if (schoolData) c.factors = [...c.factors, 'schools']
      }
      return { counties, hexes, years, partialYear: got[0].partialYear, generated: got.map((f) => f.generated).sort()[0], schools: schoolData?.schools || [], commuteNote: commute?.note }
    })
  }
  return loading
}
export const countyInfo = (data, name) => data?.counties?.find((c) => c.name === name)

/** Adds drive times, nearest schools, neighbors, and the early-signal measures to each hexagon. */
function enrich(hexes, years, schools, times) {
  const kx = Math.cos((35.2 * Math.PI) / 180)
  const miles = (a, b) => Math.hypot((a[0] - b[0]) * kx, a[1] - b[1]) * 69.05
  for (const h of hexes) {
    const n = h.g.length - 1
    h.c = h.g.slice(0, n).reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n], [0, 0])
    if (times?.[h.id]) { h.m.commuteMin = times[h.id][0]; h.m.commuteMi = times[h.id][1] }
    // nearest public or charter school at each level
    h.schools = {}
    for (const lvl of ['Elementary', 'Middle', 'High']) {
      let best = null
      for (const s of schools) {
        if (s.type === 'Private' || !s.level.includes(lvl)) continue
        const d = miles(h.c, [s.lng, s.lat])
        if (!best || d < best.mi) best = { name: s.name, mi: d }
      }
      if (best) h.schools[lvl] = best
    }
    const ds = Object.values(h.schools).map((x) => x.mi)
    h.m.schoolMi = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null
  }
  // neighbors: hexagons within about one ring (0.75 mi between centers)
  const B = 0.02, buckets = new Map(), key = (x, y) => `${Math.floor(x / B)},${Math.floor(y / B)}`
  for (const h of hexes) { const k = key(...h.c); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(h) }
  for (const h of hexes) {
    const [bx, by] = [Math.floor(h.c[0] / B), Math.floor(h.c[1] / B)]
    h.nbrs = []
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of buckets.get(`${bx + i},${by + j}`) || []) {
      if (o !== h && miles(h.c, o.c) < 0.75) h.nbrs.push(o)
    }
  }
  // activity = rezonings + land sales + new homes; ranked within each county
  const activity = (m) => (m.rezApproved || 0) + 1.5 * (m.rezActive || 0) + (m.sales || 0) + (m.newHomes || 0)
  for (const county of new Set(hexes.map((h) => h.county))) {
    const list = hexes.filter((h) => h.county === county)
    const p = percentiles(list.map((h) => activity(h.m)))
    list.forEach((h, i) => { h.actPct = p[i] ?? 0 })
  }
  // recent vs prior full years (the current year is partial, so it's left out)
  const n = years.length
  const yrs = (a, b) => (years[a] === years[b] ? `${years[a]}` : `${years[a]}–${String(years[b]).slice(2)}`)
  for (const h of hexes) {
    const yearly = years.map((_, i) => ['sales', 'approved', 'built'].reduce((t, k) => t + (h.t?.[k]?.[i] || 0), 0))
    const recent = (yearly[n - 2] || 0) + (yearly[n - 3] || 0), prior = (yearly[n - 4] || 0) + (yearly[n - 5] || 0)
    const ringPct = h.nbrs.length ? h.nbrs.reduce((t, o) => t + o.actPct, 0) / h.nbrs.length : h.actPct
    h.early = {
      ownPct: h.actPct, ringPct,
      spill: Math.max(0, ringPct - h.actPct), // neighbors busier than this area
      recent, prior, accel: (recent - prior) / (prior + 2), // growth from a low base counts
      recentYears: yrs(n - 3, n - 2), priorYears: yrs(n - 5, n - 4),
    }
  }
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

/**
 * Score every hexagon with the given weights. Each county is scored against itself (percentiles
 * within the county) using only the signals that county publishes; missing signals drop out and
 * the remaining weights carry the score.
 */
export function scoreHexes(data, weights, view = 'now') {
  const FS = view === 'early' ? EARLY_FACTORS : FACTORS
  const always = view === 'early' ? ['spillover', 'accel'] : [] // computed for every county
  const hexes = data.hexes
  const scored = []
  const rankedBy = {}
  for (const c of data.counties || [{ name: 'Mecklenburg', factors: ALL_FACTORS }]) {
    const list = hexes.filter((h) => (h.county || 'Mecklenburg') === c.name)
    const use = FS.filter((f) => always.includes(f.key) || c.factors.includes(f.key))
    const pct = Object.fromEntries(use.map((f) => [f.key, percentiles(list.map((h) => f.value(h.m, h)))]))
    const total = use.reduce((t, f) => t + (weights[f.key] || 0), 0) || 1
    const here = list.map((h, i) => {
      const parts = Object.fromEntries(FS.map((f) => [f.key, use.includes(f) ? pct[f.key][i] : undefined]))
      // a signal with no data for this area (price trend with too few sales) counts as middle-of-the-road
      const s = use.reduce((t, f) => t + (weights[f.key] || 0) * (parts[f.key] ?? 0.5), 0) / total
      return { h, score: Math.round(s * 100), parts }
    })
    const r = [...here].sort((a, b) => b.score - a.score)
    r.forEach((x, i) => { x.rank = i + 1; x.of = r.length })
    rankedBy[c.name] = r
    scored.push(...here)
  }
  const ranked = [...scored].sort((a, b) => b.score - a.score)
  const fc = {
    type: 'FeatureCollection',
    features: scored.map((x) => ({ type: 'Feature', properties: { id: x.h.id, score: x.score }, geometry: { type: 'Polygon', coordinates: [x.h.g] } })),
  }
  return { fc, byId: Object.fromEntries(scored.map((x) => [x.h.id, x])), ranked, rankedBy, count: scored.length, factors: FS, view }
}

/** The two factors doing the most for a hexagon's score. */
export function topDrivers(x, weights, factors = FACTORS) {
  return factors.filter((f) => x.parts[f.key] !== undefined).map((f) => ({ f, v: (weights[f.key] || 0) * (x.parts[f.key] ?? 0) }))
    .filter((d) => d.v > 0).sort((a, b) => b.v - a.v).slice(0, 2).map((d) => d.f.label.toLowerCase())
}

// Tidy county street names for display: "N I-85 Hy & S I-85 Hy" -> "I-85", "Owen Bv" -> "Owen Blvd"
const ABBREV = { Bv: 'Blvd', Hy: 'Hwy', Py: 'Pkwy', Wy: 'Way', Cr: 'Cir', Av: 'Ave', Tl: 'Trl', Pl: 'Pl' }
export function areaName(raw) {
  if (!raw) return null
  const [streets, ...town] = raw.split(', ')
  const tidy = (n) => n
    .replace(/\bI- ?(\d+)/g, 'I-$1') // "I- 77" -> "I-77"
    .replace(/\b(I-\d+) Hy\b/, '$1') // interstates read better without "Hwy"
    .replace(/^US Hwy (\d+)/, 'US-$1') // Census: "US Hwy 29" -> "US-29"
    .replace(/^State (?:Rd|Rte) (\d+)/, 'SR $1') // secondary road numbers, shown only when nothing better exists
    .replace(/^State Hwy (\d+)/, 'Hwy $1') // state highways are real roads: "State Hwy 49" -> "Hwy 49"
    .replace(/\b(Bv|Hy|Py|Wy|Cr|Av|Tl)\b/g, (m) => ABBREV[m])
  // secondary-road numbers like "State Rd 1442" (not state highways, which are named roads)
  const isRouteNumber = (n) => /^(State (Rd|Rte)|Co(unty)? Rd|SR) \d+[A-Z]?( [NSEW])?$/.test(n)
  let parts = streets.split(' & ')
  // a plain route number adds nothing when a real street name is there too
  if (parts.length > 1 && parts.some((n) => !isRouteNumber(n))) parts = parts.filter((n) => !isRouteNumber(n))
  parts = parts.map(tidy)
  // the same road listed twice (both directions, or "Hwy 49" and "Hwy 49 S") counts once
  const base = (n) => n.replace(/^[NSEW] /, '').replace(/ [NSEW]$/, '')
  const unique = parts.filter((n, i) => parts.findIndex((o) => base(o) === base(n)) === i)
  const shown = unique.length < parts.length ? unique.map(base) : unique
  return [shown.join(' & '), ...town].join(', ')
}

// Green = opportunity. Low scores aren't shaded on the map at all (see the fill opacity in App).
export const SCORE_COLORS = [[0, '#E5F5E0'], [45, '#A1D99B'], [65, '#41AB5D'], [80, '#238B45'], [100, '#00441B']]

/* ---------------- trends over time ---------------- */
export const TREND_METRICS = [
  { key: 'filed', label: 'Rezonings filed', unit: 'petition' },
  { key: 'approved', label: 'Rezonings approved', unit: 'approval' },
  { key: 'sales', label: 'Land sales', unit: 'vacant-land sale' },
  { key: 'built', label: 'New homes', unit: 'home' },
]

/**
 * Hexagons colored by one measure in one year. scale 'all' shares one scale across every year
 * (years compare honestly); 'year' scales to that year's busiest area (hot spots in quiet years show up).
 */
export function trendCollection(data, metric, yearIx, scale = 'all') {
  const max = Math.max(1, ...(scale === 'year' ? data.hexes.map((h) => h.t?.[metric]?.[yearIx] || 0) : data.hexes.flatMap((h) => h.t?.[metric] || [])))
  return {
    type: 'FeatureCollection',
    features: data.hexes.map((h) => {
      const v = h.t?.[metric]?.[yearIx] || 0
      // square root keeps small counts visible next to a few very busy areas
      // any activity at all is shaded (starting light green); none stays unshaded
      return { type: 'Feature', properties: { id: h.id, v, score: v ? Math.round(45 + 55 * Math.sqrt(v / max)) : 0 }, geometry: { type: 'Polygon', coordinates: [h.g] } }
    }),
  }
}

/** Totals per year for one measure, for one county or all of them. */
export const countyTotals = (data, metric, county) => data.years.map((_, i) => data.hexes.reduce((t, h) => t + (!county || h.county === county ? h.t?.[metric]?.[i] || 0 : 0), 0))