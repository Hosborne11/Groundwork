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
