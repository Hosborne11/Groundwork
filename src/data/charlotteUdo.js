import { IT_RULES, IT_ORDER } from './indianTrail'
import { TOWN_RULES, TOWN_ORDERS, TOWN_PLANS } from './towns'
// Charlotte Unified Development Ordinance (effective June 1, 2023).
// Only values verified against the published text are filled in. Everything else
// is marked as not yet loaded so the app never shows a guessed number.

export const UDO_HOME = 'https://read.charlotteudo.org/'

export const N1_SOURCE = {
  label: 'Charlotte UDO Article 4, Tables 4-1 to 4-3',
  url: 'https://read.charlotteudo.org/articles/article-4-neighborhood-1-zoning-districts/',
  checked: 'October 2026',
}

// Article 4 values. Front setbacks are left out on purpose: Table 4-2 sets them by
// street type and lets recorded plats and blockface averages override them.
export const N1 = {
  'N1-A': { minLotSf: 10000, minWidthFt: 70, sideFt: 5, rearFt: 40, heightFt: 48, bonusTo: 'N1-B' },
  'N1-B': { minLotSf: 8000, minWidthFt: 60, sideFt: 5, rearFt: 35, heightFt: 48, bonusTo: 'N1-C' },
  'N1-C': { minLotSf: 6000, minWidthFt: 50, sideFt: 5, rearFt: 30, heightFt: 40, bonusTo: 'N1-D' },
  'N1-D': { minLotSf: 3500, minWidthFt: 40, sideFt: 5, rearFt: 25, heightFt: 40, bonusTo: 'N1-E' },
  'N1-E': { minLotSf: 3000, minWidthFt: 30, sideFt: 5, rearFt: 20, heightFt: 40, bonusTo: null },
  'N1-F': { minLotSf: 3000, minWidthFt: 30, sideFt: 5, rearFt: 20, heightFt: 48, bonusTo: null },
  // Neighborhood 2: townhome (multi-family attached) districts. Per-sublot standards here are the
  // working minimums Groundwork drafts with (22 ft units on ~100 ft sublots), since N2 sublot
  // dimensions are set case by case through conditional rezonings rather than one UDO table.
  'N2-A': { minLotSf: 2000, minWidthFt: 20, sideFt: 5, rearFt: 20, heightFt: 48, bonusTo: null, townhome: true },
  'N2-B': { minLotSf: 2000, minWidthFt: 20, sideFt: 10, rearFt: 30, heightFt: 48, bonusTo: null, apartment: true },
}
export const N1_COVERAGE = 'Max building coverage: 40% on lots of 10,000 sq ft or more, 50% on smaller lots'
export const N1_USES = {
  standard: 'Single-family, duplex, and triplex on all lots. Quadraplex on arterial streets when one unit is affordable.',
  'N1-F': 'Everything allowed in N1-A to N1-E, plus small-scale multi-family. Usually applied along arterials.',
}
// Conservation residential development (Sec. 4.5): N1-A to N1-D, sites of 2+ acres.
// Max lots = gross acreage / district minimum lot area; lots may shrink by 50%; 10% common open space.
export const CONSERVATION_DISTRICTS = ['N1-A', 'N1-B', 'N1-C', 'N1-D']
export const CONSERVATION_MIN_ACRES = 2
// Voluntary mixed-income bonus (Sec. 4.5): N1-A to N1-D, sites of 1+ acre; build to next district's standards,
// with all units on 50% of the bonus lots affordable at 80% AMI or less.
export const MIXED_INCOME_MIN_ACRES = 1

// District catalog. family drives Policy Map fit; rank orders intensity within the
// residential and center ladder (null = employment or special district).
export const DISTRICTS = [
  { code: 'N1-A', name: 'Neighborhood 1-A', family: 'N1', rank: 1, article: 4 },
  { code: 'N1-B', name: 'Neighborhood 1-B', family: 'N1', rank: 2, article: 4 },
  { code: 'N1-C', name: 'Neighborhood 1-C', family: 'N1', rank: 3, article: 4 },
  { code: 'N1-D', name: 'Neighborhood 1-D', family: 'N1', rank: 4, article: 4 },
  { code: 'N1-E', name: 'Neighborhood 1-E', family: 'N1', rank: 5, article: 4 },
  { code: 'N1-F', name: 'Neighborhood 1-F', family: 'N1', rank: 6, article: 4 },
  { code: 'N2-A', name: 'Neighborhood 2-A', family: 'N2', rank: 7, article: 5 },
  { code: 'N2-B', name: 'Neighborhood 2-B', family: 'N2', rank: 8, article: 5 },
  { code: 'N2-C', name: 'Neighborhood 2-C', family: 'N2', rank: 9, article: 5 },
  { code: 'NC', name: 'Neighborhood Center', family: 'NC', rank: 10, article: 10 },
  { code: 'CAC-1', name: 'Community Activity Center 1', family: 'CAC', rank: 11, article: 11 },
  { code: 'CAC-2', name: 'Community Activity Center 2', family: 'CAC', rank: 12, article: 11 },
  { code: 'RAC', name: 'Regional Activity Center', family: 'RAC', rank: 13, article: 12 },
  { code: 'CG', name: 'General Commercial', family: 'COM', rank: null, article: 6 },
  { code: 'CR', name: 'Regional Commercial', family: 'COM', rank: null, article: 6 },
  { code: 'OFC', name: 'Office Flex Campus', family: 'CAMPUS', rank: null, article: 7 },
  { code: 'IC-1', name: 'Institutional Campus 1', family: 'CAMPUS', rank: null, article: 7 },
  { code: 'IC-2', name: 'Institutional Campus 2', family: 'CAMPUS', rank: null, article: 7 },
  { code: 'ML-1', name: 'Manufacturing & Logistics 1', family: 'ML', rank: null, article: 8 },
  { code: 'ML-2', name: 'Manufacturing & Logistics 2', family: 'ML', rank: null, article: 8 },
  { code: 'IMU', name: 'Innovation Mixed-Use', family: 'IMU', rank: null, article: 9 },
  { code: 'TOD-NC', name: 'TOD Neighborhood Center', family: 'TOD', rank: null, article: 13 },
  { code: 'TOD-CC', name: 'TOD Community Center', family: 'TOD', rank: null, article: 13 },
  { code: 'TOD-UC', name: 'TOD Urban Center', family: 'TOD', rank: null, article: 13 },
  { code: 'TOD-TR', name: 'TOD Transition', family: 'TOD', rank: null, article: 13 },
]
export const districtByCode = Object.fromEntries(DISTRICTS.map((d) => [d.code, d]))

// Typical alignment of UDO district families to Charlotte Future 2040 place types.
// Planning staff make the official consistency call; this mirrors the naming the UDO uses.
export const PLACE_TYPE_FIT = {
  N1: { name: 'Neighborhood 1', fits: ['N1'] },
  N2: { name: 'Neighborhood 2', fits: ['N2'], lowerOk: ['N1'] },
  NC: { name: 'Neighborhood Center', fits: ['NC'], lowerOk: ['N2'] },
  CAC: { name: 'Community Activity Center', fits: ['CAC'], lowerOk: ['NC', 'N2'] },
  RAC: { name: 'Regional Activity Center', fits: ['RAC'], lowerOk: ['CAC', 'NC'] },
  IMU: { name: 'Innovation Mixed-Use', fits: ['IMU'] },
  CAMP: { name: 'Campus', fits: ['CAMPUS'] },
  ML: { name: 'Manufacturing & Logistics', fits: ['ML'] },
  COM: { name: 'Commercial', fits: ['COM'] },
  PP: { name: 'Parks & Preserves', fits: [] },
}

// Policy Map uses full names; map them to the keys above.
export function placeTypeKey(fullName = '') {
  const n = fullName.toLowerCase()
  if (n.startsWith('neighborhood 1')) return 'N1'
  if (n.startsWith('neighborhood 2')) return 'N2'
  if (n.startsWith('neighborhood center')) return 'NC'
  if (n.startsWith('community activity')) return 'CAC'
  if (n.startsWith('regional activity')) return 'RAC'
  if (n.startsWith('innovation')) return 'IMU'
  if (n.startsWith('campus')) return 'CAMP'
  if (n.startsWith('manufacturing')) return 'ML'
  if (n.startsWith('commercial')) return 'COM'
  if (n.startsWith('parks')) return 'PP'
  return null
}

// "N1-B(CD)(HDO)" -> { base: 'N1-B', conditional: true, overlays: ['HDO'] }
export function parseZoning(code = '') {
  const parts = code.match(/\(([^)]+)\)/g)?.map((p) => p.slice(1, -1)) || []
  const base = code.split('(')[0].trim()
  const conditional = parts.some((p) => p === 'CD' || p === 'INNOV')
  return { base, conditional, overlays: parts.filter((p) => p !== 'CD' && p !== 'INNOV'), isUdo: !!districtByCode[base] }
}

// ---- Housing types in Neighborhood 1 (UDO Article 4, §4.1 and the N1-F multi-family limits) ----
// N1-A to N1-E: single-family, duplex, and triplex on all lots; quadraplex only on arterial streets
// with one affordable unit. N1-F adds small-scale multi-family: at most two multi-family attached
// (townhome) buildings per lot, with 250 sq ft of open space per unit, or one multi-family stacked
// (apartment) building per lot. Larger townhome or apartment communities need Neighborhood 2 zoning.
export const HOUSING = [
  { key: 'sf', label: 'Single-family', units: 1 },
  { key: 'duplex', label: 'Duplex', units: 2 },
  { key: 'triplex', label: 'Triplex', units: 3 },
  { key: 'mix', label: 'Mix by lot size' },
  { key: 'townhomes', label: 'Townhomes' },
  { key: 'apartments', label: 'Apartments' },
]
export const LOT_HOUSING = HOUSING.filter((h) => h.units) // what one lot can hold in a by-right draft
export const unitsFor = (key) => HOUSING.find((h) => h.key === key)?.units || 1

/** { ok: true | 'limited' | false, note } for a housing type in a district. */
export function housingAllowed(key, code) {
  const tr = TOWN_RULES[code]
  if (tr) {
    if (key === 'sf') return { ok: true }
    if (key === 'apartments') {
      return tr.apt
        ? { ok: true, note: `${code} allows apartments in ${tr.jurisdiction}: up to ${tr.apt.density} units an acre and ${tr.apt.stories} stories.` }
        : { ok: false, note: `Apartments aren’t allowed in ${code}. In ${tr.jurisdiction} they need ${tr.jurisdiction === 'Concord' ? 'RC' : 'RHD'} zoning.` }
    }
    return { ok: false, note: `Groundwork drafts ${tr.jurisdiction}’s ${code} district as single-family lots. Duplexes and attached homes have their own standards in the town’s ordinance and usually go through conditional zoning.` }
  }
  if (IT_RULES[code]) {
    if (IT_RULES[code].apartment) {
      return key === 'apartments'
        ? { ok: true, note: 'MFR is Indian Trail’s multifamily district: 3,350 sq ft of land per unit (about 13 units an acre), up to 40 ft tall.' }
        : { ok: true, note: 'Groundwork drafts MFR scenarios as apartments.' }
    }
    if (key === 'sf') return { ok: true }
    if (key === 'apartments') return { ok: false, note: `Apartments aren’t allowed in ${code}. They need a conditional rezoning to MFR.` }
    return { ok: false, note: `Groundwork drafts Indian Trail’s ${code} district as single-family lots. Duplexes, triplexes, and attached homes depend on the town’s use table (UDO Table 500-5) and usually conditional zoning.` }
  }
  if (N1[code]?.apartment) {
    if (key === 'apartments') return { ok: true, note: 'N2-B is Charlotte’s district for small apartment communities (multi-family stacked), up to 48 ft tall.' }
    if (key === 'townhomes') return { ok: true, note: 'N2-B also allows townhomes; pick the N2-A scenario to draft them.' }
    return { ok: true, note: 'N2-B also allows house-scale buildings at N1-E standards, but Groundwork drafts N2-B scenarios as apartments.' }
  }
  if (N1[code]?.townhome) {
    if (key === 'townhomes') return { ok: true, note: 'N2-A is Charlotte’s district for townhomes (multi-family attached). Nearly all recent townhome communities were approved as N2-A conditional rezonings.' }
    if (key === 'apartments') return { ok: false, note: 'Apartments (multi-family stacked) need N2-B or a higher-intensity district, not N2-A.' }
    return { ok: true, note: 'N2-A also allows house-scale buildings, but Groundwork drafts N2-A scenarios as townhomes.' }
  }
  const nf = code === 'N1-F'
  if (key === 'sf' || key === 'duplex') return { ok: true }
  if (key === 'triplex' || key === 'mix') return { ok: true, note: 'Triplexes also have site layout standards in the UDO that this draft doesn’t check.' }
  if (key === 'townhomes') {
    return nf
      ? { ok: 'limited', note: 'N1-F allows townhomes (multi-family attached), but at most two townhome buildings per lot, with 250 sq ft of open space per unit. This draft lays out lots; it doesn’t place townhome buildings yet.' }
      : { ok: false, note: `Townhomes aren’t allowed in ${code}. They need N1-F (at most two townhome buildings per lot) or a rezoning to Neighborhood 2, which is how most Charlotte townhome communities are approved.` }
  }
  if (key === 'apartments') {
    return nf
      ? { ok: 'limited', note: 'N1-F allows one small apartment building (multi-family stacked) per lot. This draft lays out lots; it doesn’t place apartment buildings yet.' }
      : { ok: false, note: `Apartments aren’t allowed in ${code}. They need a rezoning to Neighborhood 2 or a higher-intensity district.` }
  }
  return { ok: false }
}

// Front setbacks depend on the street type and existing setbacks on the block, so drafts assume
// 20 ft on new local streets. A house needs room for that, the rear setback, and a modest footprint.
export const FRONT_SETBACK_ASSUMED = 20
export const MIN_HOUSE_DEPTH = 30

// ---- Rezoning scenarios ----
// N1 districts from lowest to highest intensity; an upzoning scenario offers the ones after the current district.
export const N1_ORDER = ['N1-A', 'N1-B', 'N1-C', 'N1-D', 'N1-E', 'N1-F']
export const upzoneOptions = (code) => {
  const town = TOWN_RULES[code]?.jurisdiction
  const order = town ? TOWN_ORDERS[town] : IT_ORDER.includes(code) ? IT_ORDER : N1_ORDER
  const i = order.indexOf(code)
  return i < 0 ? [] : order.slice(i + 1)
}

/**
 * How a district fits the 2040 Policy Map place type: staff weigh this heavily in rezoning reviews.
 * Returns { fit: 'consistent' | 'inconsistent' | 'unknown', note }.
 */
export function policyFit(code, placeName) {
  if (TOWN_RULES[code]) {
    const t = TOWN_RULES[code].jurisdiction
    return { fit: 'unknown', note: `${t} weighs rezonings against its ${TOWN_PLANS[t]}, which Groundwork doesn’t check here, so look up the parcel’s land use designation before relying on a scenario.` }
  }
  if (IT_RULES[code]) return { fit: 'unknown', note: 'Indian Trail weighs rezonings against its Comprehensive Plan (the “Indian Trail Framework Plan”), which isn’t published as map data, so Groundwork doesn’t check plan consistency here.' }
  if (!placeName) return { fit: 'unknown', note: 'The 2040 Policy Map place type for this parcel isn’t loaded.' }
  const family = code.startsWith('N1') ? 'Neighborhood 1' : code.startsWith('N2') ? 'Neighborhood 2' : null
  if (family && placeName.toLowerCase().startsWith(family.toLowerCase())) {
    return {
      fit: 'consistent',
      note: `${code} matches the parcel’s ${placeName} place type on the 2040 Policy Map, which staff weigh in favor of a rezoning.${code === 'N1-F' ? ' N1-F is usually applied along arterial streets.' : ''}`,
    }
  }
  return { fit: 'inconsistent', note: `${code} doesn’t match the parcel’s ${placeName} place type on the 2040 Policy Map. Staff typically flag that as inconsistent, which makes approval harder but not impossible.` }
}

// ---- Townhomes (N2-A rezoning scenarios) ----
// Defaults follow the conditions that recent approved Charlotte townhome rezonings
// (N2-A(CD) site plans) repeat: 4-6 unit buildings about 100-120 ft long, ~20 ft front
// setbacks, 5 ft building sides (10 ft between buildings), 48 ft height.
export const TOWNHOME = {
  unitW: 22,        // ft of frontage per unit
  maxPerBldg: 5,    // units per building
  bldgDepth: 40,    // building footprint depth, ft
  maxBldgFt: 120,   // longest building typically conditioned
  styles: [
    { key: 'front', label: 'Front-loaded garages' },
    { key: 'alley', label: 'Rear alley-loaded' },
  ],
}

// ---- Apartments (N2-B rezoning scenarios) ----
// Garden-apartment assumptions for yield estimates: 3-story buildings up to 160 ft long and
// 65 ft deep, ~85% of floor area in units, surface parking in shared courts between buildings.
export const APARTMENT = {
  stories: 3,       // within the 48 ft height limit
  unitSf: 1000,     // average unit, gross
  bldgDepth: 65,
  maxBldgFt: 160,
  efficiency: 0.85, // share of floor area that is units rather than halls and stairs
  parkRatio: 1.5,   // surface spaces per unit; the practical limit on garden-apartment yield
}

// ---- One rules registry for every town Groundwork drafts in ----
// Charlotte's N1/N2 districts plus Indian Trail's; district names don't collide.
export const RULES = { ...N1, ...IT_RULES, ...TOWN_RULES }
export const jurisdictionOf = (code) => RULES[code]?.jurisdiction || 'Charlotte'