/*
 * Residential zoning for neighborhood drafts in Concord and Monroe, NC.
 * District names don't collide with Charlotte's or Indian Trail's, so all share one registry.
 *
 * maxDensity: units per gross acre, a cap separate from lot size in both towns.
 * apt: the district also allows apartments (multi-family): { density, stories }.
 * frontFt/rearFt/sideFt: principal-structure setbacks for single-family lots.
 */

// City of Concord Development Ordinance (CDO), Table 7.6.2-A (dimensions and density) and
// Table 7.6.2-B (setbacks). Multi-family: Table 7.8.17 (180 ft building length, 20 ft setbacks).
export const CONCORD_SOURCE = 'Concord Development Ordinance Tables 7.6.2-A and 7.6.2-B'
const cc = { jurisdiction: 'Concord', bonusTo: null, heightFt: 35 }
export const CONCORD_RULES = {
  AG: { ...cc, minLotSf: 43560, minWidthFt: 200, maxDensity: 1, frontFt: 50, sideFt: 20, rearFt: 30 },
  RE: { ...cc, minLotSf: 43560, minWidthFt: 150, maxDensity: 1, frontFt: 45, sideFt: 20, rearFt: 30 },
  RL: { ...cc, minLotSf: 20000, minWidthFt: 100, maxDensity: 2, frontFt: 35, sideFt: 15, rearFt: 30 },
  'RM-1': { ...cc, minLotSf: 15000, minWidthFt: 75, maxDensity: 3, frontFt: 25, sideFt: 10, rearFt: 25 },
  'RM-2': { ...cc, minLotSf: 10000, minWidthFt: 75, maxDensity: 4, frontFt: 25, sideFt: 10, rearFt: 25 },
  RV: { ...cc, minLotSf: 7500, minWidthFt: 50, maxDensity: 8, frontFt: 24, sideFt: 7, rearFt: 5 },
  RC: { ...cc, minLotSf: 5000, minWidthFt: 50, maxDensity: 15, frontFt: 24, sideFt: 7, rearFt: 5, apt: { density: 15, stories: 4 } },
}
export const CONCORD_ORDER = ['AG', 'RE', 'RL', 'RM-1', 'RM-2', 'RV', 'RC']

// City of Monroe Unified Development Ordinance, Section 4.2 (Tables 4.2.1-4.2.4), as amended 2023.
export const MONROE_SOURCE = 'Monroe UDO Section 4.2, Tables 4.2.1-4.2.4'
const mo = { jurisdiction: 'Monroe', bonusTo: null }
export const MONROE_RULES = {
  RR: { ...mo, minLotSf: 40000, minWidthFt: 100, maxDensity: 1, frontFt: 50, sideFt: 20, rearFt: 25, heightFt: 36, stories: 3 },
  RLD: { ...mo, minLotSf: 20000, minWidthFt: 100, maxDensity: 2, frontFt: 25, sideFt: 15, rearFt: 20, heightFt: 36, stories: 3 },
  RMD: { ...mo, minLotSf: 12000, minWidthFt: 75, maxDensity: 3, frontFt: 20, sideFt: 10, rearFt: 10, heightFt: 36, stories: 3 },
  // RHD front setback is 20 ft where a driveway or garage is provided (15 ft otherwise)
  RHD: { ...mo, minLotSf: 5000, minWidthFt: 50, maxDensity: 10, frontFt: 20, sideFt: 5, rearFt: 10, heightFt: 48, stories: 4, apt: { density: 10, stories: 4 } },
}
export const MONROE_ORDER = ['RR', 'RLD', 'RMD', 'RHD']


// Town of Matthews UDO §155.604.1 (Table of Dimensional Standards): lot area, width, front setback,
// and interior side yard for R-20 through R-9. Rear yards: R-9's 45 ft is confirmed on approved
// plans; the table's R-20/R-15/R-12 rear yards weren't legible in available copies, so 45 ft is
// assumed for them (it only feeds the "room for a house" check). R-VS is a conditional-only district;
// its values are the conditions repeated on approved R-VS plans (5,500 sq ft lots, 50 ft wide).
export const MATTHEWS_SOURCE = 'Matthews UDO §155.604.1 (rear yards for R-20, R-15, R-12 assumed at 45 ft)'
const mt = { jurisdiction: 'Matthews', bonusTo: null, heightFt: 35 }
export const MATTHEWS_RULES = {
  'R-20': { ...mt, minLotSf: 20000, minWidthFt: 90, frontFt: 50, sideFt: 12, rearFt: 45 },
  'R-15': { ...mt, minLotSf: 15000, minWidthFt: 80, frontFt: 40, sideFt: 10, rearFt: 45 },
  'R-12': { ...mt, minLotSf: 12000, minWidthFt: 70, frontFt: 35, sideFt: 10, rearFt: 45 },
  'R-9': { ...mt, minLotSf: 9000, minWidthFt: 60, frontFt: 30, sideFt: 6, rearFt: 45 },
  'R-VS': { ...mt, minLotSf: 5500, minWidthFt: 50, frontFt: 20, sideFt: 6, rearFt: 20, conditionalOnly: true, typical: 'Typical conditions on approved R-VS plans' },
}
export const MATTHEWS_ORDER = ['R-20', 'R-15', 'R-12', 'R-9', 'R-VS']

// Town of Mint Hill: residential zoning is one district, R. Values are the conservation subdivision
// standards cited in Planning Board staff reports (12,500 sq ft lots, 80 ft wide, 30/8/30 setbacks).
// "R (CD)" is a conditional rezoning; its values are typical approved conditions (e.g. the 2018
// Meritage Homes petition: 6,600 sq ft lots, 55 ft wide, 20/5/20). Keys carry an "MH:" prefix so
// Mint Hill's "R" doesn't collide with Huntersville's "R"; `label` is what people see.
export const MINT_HILL_SOURCE = 'Mint Hill UDO conservation subdivision standards, as cited in Planning Board staff reports'
const mh = { jurisdiction: 'Mint Hill', bonusTo: null, heightFt: 35 }
export const MINT_HILL_RULES = {
  'MH:R': { ...mh, label: 'R', minLotSf: 12500, minWidthFt: 80, frontFt: 30, sideFt: 8, rearFt: 30 },
  'MH:R-CD': { ...mh, label: 'R (CD)', minLotSf: 6600, minWidthFt: 55, frontFt: 20, sideFt: 5, rearFt: 20, conditionalOnly: true, typical: 'Typical conditions on approved R (CD) rezonings' },
}
export const MINT_HILL_ORDER = ['MH:R', 'MH:R-CD']

// Town of Huntersville Zoning Ordinance, Article 3.2 (and TA25-08): density, not lot size, governs.
// R and TR: conservation subdivision lots (20,000 sq ft, 90 ft wide) with a sliding density scale;
// the caps below are the maximums with the open space bonus (R: 0.9 units/acre at about 45% open
// space; TR: 1.5 at about 40%). NR: lots average at least 60 ft wide, none under 50 ft, with no
// minimum lot area. GR exists to complete existing subdivisions, so it isn't drafted. Huntersville
// sets build-to lines rather than fixed front setbacks, so drafts keep the 20 ft assumption.
export const HUNTERSVILLE_SOURCE = 'Huntersville Zoning Ordinance Article 3.2 (density caps include the maximum open space bonus)'
const hv = { jurisdiction: 'Huntersville', bonusTo: null, heightFt: 35 }
export const HUNTERSVILLE_RULES = {
  'HV:R': { ...hv, label: 'R', minLotSf: 20000, minWidthFt: 90, maxDensity: 0.9, sideFt: 10, rearFt: 25, densityNote: 'up to 0.9 units per acre with about 45% open space (0.3 at the 25% minimum)' },
  TR: { ...hv, minLotSf: 20000, minWidthFt: 90, maxDensity: 1.5, sideFt: 10, rearFt: 25, densityNote: 'up to 1.5 units per acre with about 40% open space (0.5 at the 20% minimum)' },
  NR: { ...hv, minLotSf: 5000, minWidthFt: 50, sideFt: 5, rearFt: 20, densityNote: 'no minimum lot area; lots average at least 60 ft wide' },
  GR: { ...hv, minLotSf: 20000, minWidthFt: 100, noDraft: 'GR exists to complete existing conventional subdivisions and isn’t used for new projects, so Groundwork doesn’t draft it.' },
}
export const HUNTERSVILLE_ORDER = ['HV:R', 'TR', 'NR']

// Town of Pineville Zoning Ordinance (updated March 10, 2026), Section 6.6 Applicable Dimensional
// Requirements: 6.6.1 R-44, 6.6.2 R-12, 6.6.3 R-7, 6.6.4 R-MF (single-family and master-planned
// apartments at 10 units/acre). RMX has no Section 6.6 table (it's conditional); its values are the
// conditions on the approved 2022 Miller Farm RMX plan. Keys carry "PV:" since Matthews also has R-12.
export const PINEVILLE_SOURCE = 'Pineville Zoning Ordinance §6.6 (updated March 2026)'
const pv = { jurisdiction: 'Pineville', bonusTo: null, heightFt: 40 }
export const PINEVILLE_RULES = {
  'PV:R-44': { ...pv, label: 'R-44', minLotSf: 44000, minWidthFt: 100, frontFt: 20, sideFt: 12, rearFt: 40 },
  'PV:R-12': { ...pv, label: 'R-12', minLotSf: 12000, minWidthFt: 70, frontFt: 20, sideFt: 10, rearFt: 40 },
  'PV:R-7': { ...pv, label: 'R-7', minLotSf: 7000, minWidthFt: 50, frontFt: 15, sideFt: 5, rearFt: 30 },
  'PV:R-MF': { ...pv, label: 'R-MF', minLotSf: 7000, minWidthFt: 50, frontFt: 20, sideFt: 5, rearFt: 30, apt: { density: 10, stories: 3 } },
  'PV:RMX': { ...pv, label: 'RMX', minLotSf: 4920, minWidthFt: 41, frontFt: 10, sideFt: 5, rearFt: 10, conditionalOnly: true, typical: 'Conditions on the approved 2022 Miller Farm RMX plan' },
}
export const PINEVILLE_ORDER = ['PV:R-44', 'PV:R-12', 'PV:R-7', 'PV:R-MF', 'PV:RMX']

// City of Kannapolis Development Ordinance (KDO rewrite), Section 3.3 Residential Districts. Only R1
// sets a minimum lot area; the others govern by lot width and a units-per-acre cap. Widths are for
// front-loaded single-family lots (duplex/triplex 90 ft; alley-loaded and attached lots narrower).
// minLotSf below is a drafting floor (width x 85 ft), not a code minimum. Keys carry "KN:" since
// Waxhaw also uses R1 and R4.
export const KANNAPOLIS_SOURCE = 'Kannapolis Development Ordinance §3.3 (rewrite document); only R1 sets a minimum lot area'
const kn = { jurisdiction: 'Kannapolis', bonusTo: null, heightFt: 35 }
const knRow = (label, width, density, frontFt, sideFt, rearFt, extra = {}) =>
  ({ ...kn, label, minLotSf: width * 85, minWidthFt: width, maxDensity: density, frontFt, sideFt, rearFt, densityNote: `no minimum lot area; up to ${density} units per acre`, noMinLot: true, ...extra })
export const KANNAPOLIS_RULES = {
  'KN:R1': { ...kn, label: 'R1', minLotSf: 43560, minWidthFt: 150, maxDensity: 1, frontFt: 45, sideFt: 20, rearFt: 30 },
  'KN:R2': knRow('R2', 100, 2, 35, 15, 30),
  'KN:R4': knRow('R4', 75, 4, 25, 10, 25),
  'KN:R6': knRow('R6', 60, 6, 15, 5, 25),
  'KN:R7': knRow('R7', 60, 7, 10, 5, 20),
  'KN:R8': knRow('R8', 60, 8, 10, 5, 5, { apt: { density: 8, stories: 3 } }),
  'KN:R18': knRow('R18', 60, 18, 10, 5, 5, { heightFt: 48, apt: { density: 18, stories: 4 } }),
}
export const KANNAPOLIS_ORDER = ['KN:R1', 'KN:R2', 'KN:R4', 'KN:R6', 'KN:R7', 'KN:R8', 'KN:R18']

export const TOWN_RULES = { ...CONCORD_RULES, ...MONROE_RULES, ...MATTHEWS_RULES, ...MINT_HILL_RULES, ...HUNTERSVILLE_RULES, ...PINEVILLE_RULES, ...KANNAPOLIS_RULES }
export const TOWN_ORDERS = { Concord: CONCORD_ORDER, Monroe: MONROE_ORDER, Matthews: MATTHEWS_ORDER, 'Mint Hill': MINT_HILL_ORDER, Huntersville: HUNTERSVILLE_ORDER, Pineville: PINEVILLE_ORDER, Kannapolis: KANNAPOLIS_ORDER }
export const TOWN_SOURCES = { Concord: CONCORD_SOURCE, Monroe: MONROE_SOURCE, Matthews: MATTHEWS_SOURCE, 'Mint Hill': MINT_HILL_SOURCE, Huntersville: HUNTERSVILLE_SOURCE, Pineville: PINEVILLE_SOURCE, Kannapolis: KANNAPOLIS_SOURCE }
export const TOWN_PLANS = { Concord: '2030 Land Use Plan', Monroe: 'Forward Monroe plan', Matthews: 'Envision Matthews land use plan', 'Mint Hill': 'Comprehensive Plan and Future Land Use map', Huntersville: '2040 Community Plan', Pineville: 'Comprehensive Plan and Residential Overlay District', Kannapolis: 'Comprehensive Plan' }
// what a district is called on screen (Mint Hill's keys carry a town prefix)
export const districtLabel = (code) => TOWN_RULES[code]?.label || code