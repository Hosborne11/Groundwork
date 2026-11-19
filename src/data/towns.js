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

// Town of Harrisburg UDO §140.02.01, Tables 140.02.01-2 to -5 (RE, RL, RM, RH), conventional
// single-family development. Each table gives one gross density range across development types;
// conventional subdivisions use the low end (the high end needs the conservation or planned
// layouts with more open space). Keys carry "HB:" since Concord also has RE and RL.
export const HARRISBURG_SOURCE = 'Harrisburg UDO Tables 140.02.01-2 to -5 (conventional development; low end of each density range)'
const hb = { jurisdiction: 'Harrisburg', bonusTo: null, heightFt: 35 }
export const HARRISBURG_RULES = {
  'HB:RE': { ...hb, label: 'RE', minLotSf: 43560, minWidthFt: 150, maxDensity: 0.8, frontFt: 50, sideFt: 20, rearFt: 30, densityNote: 'up to 0.8 units per acre conventional (2.0 as a conservation subdivision)' },
  'HB:RL': { ...hb, label: 'RL', minLotSf: 25000, minWidthFt: 125, maxDensity: 1.0, frontFt: 35, sideFt: 15, rearFt: 30, densityNote: 'up to 1.0 unit per acre conventional (2.0 as a conservation subdivision)' },
  'HB:RM': { ...hb, label: 'RM', minLotSf: 15000, minWidthFt: 75, maxDensity: 2.0, frontFt: 25, sideFt: 10, rearFt: 25, densityNote: 'up to 2.0 units per acre conventional (3.0 as a conservation subdivision)' },
  'HB:RH': { ...hb, label: 'RH', minLotSf: 9500, minWidthFt: 55, maxDensity: 3.0, frontFt: 25, sideFt: 10, rearFt: 25, densityNote: 'up to 3.0 units per acre conventional (5.0 as a planned development)' },
}
export const HARRISBURG_ORDER = ['HB:RE', 'HB:RL', 'HB:RM', 'HB:RH']

// Town of Waxhaw Land Development Code (June 2026), Section 4.1 district pages (R-1 to R-4): minimum
// lot width and depth plus a units-per-acre cap for major subdivisions (standard values; cluster and
// conservation designs allow more). Union County's map writes these as R1-R4; keys carry "WX:".
export const WAXHAW_SOURCE = 'Waxhaw Land Development Code §4.1 (June 2026; standard, non-cluster values)'
const wx = { jurisdiction: 'Waxhaw', bonusTo: null, heightFt: 45 }
export const WAXHAW_RULES = {
  'WX:R1': { ...wx, label: 'R-1', minLotSf: 100 * 200, minWidthFt: 100, maxDensity: 1, frontFt: 30, sideFt: 15, rearFt: 30 },
  'WX:R2': { ...wx, label: 'R-2', minLotSf: 90 * 160, minWidthFt: 90, maxDensity: 2, frontFt: 25, sideFt: 12, rearFt: 30 },
  'WX:R3': { ...wx, label: 'R-3', minLotSf: 80 * 140, minWidthFt: 80, maxDensity: 3, frontFt: 20, sideFt: 10, rearFt: 30, densityNote: 'up to 3 units per acre (3.5 as a cluster subdivision)' },
  'WX:R4': { ...wx, label: 'R-4', minLotSf: 60 * 105, minWidthFt: 60, maxDensity: 4, frontFt: 15, sideFt: 7.5, rearFt: 20, densityNote: 'up to 4 units per acre (5 as a cluster subdivision)' },
}
export const WAXHAW_ORDER = ['WX:R1', 'WX:R2', 'WX:R3', 'WX:R4']

// Town of Stallings Development Ordinance (adopted 2018, amended Aug 10, 2026), §8.4-2 Single-Family
// Residential Districts: lot table and gross residential density limits (SFR-1 1.6, SFR-2 2.0,
// SFR-3 2.9 units/acre). MFT (multi-family transitional) isn't drafted yet.
export const STALLINGS_SOURCE = 'Stallings Development Ordinance §8.4-2 (amended August 2026)'
const st = { jurisdiction: 'Stallings', bonusTo: null, heightFt: 35 }
export const STALLINGS_RULES = {
  'SFR-1': { ...st, minLotSf: 20000, minWidthFt: 100, maxDensity: 1.6, frontFt: 40, sideFt: 12, rearFt: 40 },
  'SFR-2': { ...st, minLotSf: 13000, minWidthFt: 90, maxDensity: 2.0, frontFt: 30, sideFt: 10, rearFt: 30 },
  'SFR-3': { ...st, minLotSf: 10000, minWidthFt: 80, maxDensity: 2.9, frontFt: 30, sideFt: 10, rearFt: 30 },
}
export const STALLINGS_ORDER = ['SFR-1', 'SFR-2', 'SFR-3']

// Town of Cornelius Land Development Code (Feb 16, 2026), §4.4.4 Table of Dimensional Requirements
// (RP, GR, NR). Inside the Lake Norman watershed's low-impervious option, single-family is capped at
// 2 units/acre with half-acre lots (§4.2). Keys carry "CO:" since Huntersville also has GR and NR.
export const CORNELIUS_SOURCE = 'Cornelius Land Development Code §4.4.4 (Feb 2026); in the Lake Norman watershed, single-family is capped at 2 units/acre on half-acre lots'
const co = { jurisdiction: 'Cornelius', bonusTo: null, heightFt: 35 }
export const CORNELIUS_RULES = {
  'CO:RP': { ...co, label: 'RP', minLotSf: 130680, minWidthFt: 60, frontFt: 50, sideFt: 15, rearFt: 50 },
  'CO:GR': { ...co, label: 'GR', minLotSf: 21780, minWidthFt: 60, frontFt: 25, sideFt: 10, rearFt: 25 },
  'CO:NR': { ...co, label: 'NR', minLotSf: 14520, minWidthFt: 50, frontFt: 10, sideFt: 10, rearFt: 25, heightFt: 26 },
}
export const CORNELIUS_ORDER = ['CO:RP', 'CO:GR', 'CO:NR']

// Town of Davidson Planning Ordinance (Feb 25, 2025), Section 2.2 Planning Areas: form-based. Areas
// regulate building types, setbacks, and open space (e.g. Neighborhood General: 20% open space, "no
// density requirements"), with lot standards set by building type, so Groundwork shows the planning
// area but doesn't draft yield. Keys carry "DV:".
const dvNote = 'Davidson regulates by building type, setbacks, and open space rather than lot size or density (Neighborhood General has no density limit at all), so Groundwork doesn’t draft a lot yield here. See Section 2.2 of the Davidson Planning Ordinance.'
const dv = { jurisdiction: 'Davidson', bonusTo: null, heightFt: 35, minLotSf: 6000, minWidthFt: 50, noDraft: dvNote }
export const DAVIDSON_RULES = {
  'DV:R': { ...dv, label: 'R (Rural)' }, 'DV:RR': { ...dv, label: 'RR (Rural Residential)' },
  'DV:NE': { ...dv, label: 'NE (Neighborhood Edge)' }, 'DV:NG': { ...dv, label: 'NG (Neighborhood General)' },
}

// York County, SC Zoning Code (Chapter 155, amended Sept 21, 2026), unincorporated land: Table
// 155.056-1 (lot size, single-family detached), Table 155.057-2 (lot width on minor roads), and Table
// 155.058-1 (setbacks; front setbacks are 50 ft on major roads, 25 ft on minor roads). Keys carry "YC:".
export const YORK_COUNTY_SOURCE = 'York County Zoning Code Tables 155.056-1, 155.057-2, 155.058-1 (amended Sept 2026)'
const yc = { jurisdiction: 'York County', bonusTo: null, heightFt: 50 }
export const YORK_COUNTY_RULES = {
  'YC:RUD': { ...yc, label: 'RUD', minLotSf: 43560, minWidthFt: 100, frontFt: 25, frontMajorFt: 50, sideFt: 10, rearFt: 25 },
  'YC:RSF-40': { ...yc, label: 'RSF-40', minLotSf: 40000, minWidthFt: 100, frontFt: 25, frontMajorFt: 50, sideFt: 10, rearFt: 25 },
  'YC:RSF-30': { ...yc, label: 'RSF-30', minLotSf: 30000, minWidthFt: 100, frontFt: 25, frontMajorFt: 50, sideFt: 10, rearFt: 25 },
  'YC:RMX-20': { ...yc, label: 'RMX-20', minLotSf: 20000, minWidthFt: 65, frontFt: 25, frontMajorFt: 50, sideFt: 10, rearFt: 25 },
  'YC:RMX-10': { ...yc, label: 'RMX-10', minLotSf: 10000, minWidthFt: 50, frontFt: 25, frontMajorFt: 30, sideFt: 5, rearFt: 25 },
  'YC:RMX-6': { ...yc, label: 'RMX-6', minLotSf: 6000, minWidthFt: 40, frontFt: 25, frontMajorFt: 25, sideFt: 5, rearFt: 20 },
}
export const YORK_COUNTY_ORDER = ['YC:RUD', 'YC:RSF-40', 'YC:RSF-30', 'YC:RMX-20', 'YC:RMX-10', 'YC:RMX-6']

// Town of Fort Mill Zoning Ordinance (Municode, current Sept 22, 2026), Article II Secs. 1-4.
// GR and GR-A use R-10's lot standards and allow multifamily at 10 and 8 units/acre. Planned
// neighborhood developments (PND) are negotiated plans. Keys carry "FM:" (Matthews also has R-15).
export const FORT_MILL_SOURCE = 'Fort Mill Zoning Ordinance Article II §§1-4 (current Sept 2026)'
const fm = { jurisdiction: 'Fort Mill', bonusTo: null, heightFt: 35 }
export const FORT_MILL_RULES = {
  'FM:R-25': { ...fm, label: 'R-25', minLotSf: 25000, minWidthFt: 125, frontFt: 50, sideFt: 20, rearFt: 50 },
  'FM:R-15': { ...fm, label: 'R-15', minLotSf: 15000, minWidthFt: 100, frontFt: 35, sideFt: 10, rearFt: 35 },
  'FM:R-10': { ...fm, label: 'R-10', minLotSf: 10000, minWidthFt: 75, frontFt: 35, sideFt: 10, rearFt: 35 },
  'FM:GR': { ...fm, label: 'GR', minLotSf: 10000, minWidthFt: 75, frontFt: 35, sideFt: 10, rearFt: 35, apt: { density: 10, stories: 3 } },
  'FM:GR-A': { ...fm, label: 'GR-A', minLotSf: 10000, minWidthFt: 75, frontFt: 35, sideFt: 10, rearFt: 35, apt: { density: 8, stories: 3 } },
}
export const FORT_MILL_ORDER = ['FM:R-25', 'FM:R-15', 'FM:R-10', 'FM:GR', 'FM:GR-A']

// City of Tega Cay: nearly all land is zoned PDD (Planned Development District), each a negotiated plan.
export const TEGA_CAY_RULES = {
  'TC:PDD': { jurisdiction: 'Tega Cay', label: 'PDD', bonusTo: null, heightFt: 35, minLotSf: 6000, minWidthFt: 50,
    noDraft: 'Tega Cay zones nearly all of its land PDD (Planned Development District): each development’s lots and density are set by its own approved plan, so there are no standard lot rules for Groundwork to draft against.' },
}

// Union County Development Ordinance (adopted 2014; this copy amended through Jan 2018), Table 5-2
// "R District Lot and Building Regulations - Conventional Development" (amended 1-4-2016), for
// unincorporated land. Apartment forms use the table's land area per multi-unit dwelling. Keys
// carry "UC:" (Matthews also has R-15 and R-20).
export const UNION_COUNTY_SOURCE = 'Union County Development Ordinance Table 5-2 (copy amended through Jan 2018)'
const uc = { jurisdiction: 'Union County', bonusTo: null, heightFt: 40 }
export const UNION_COUNTY_RULES = {
  'UC:R-40': { ...uc, label: 'R-40', minLotSf: 40000, minWidthFt: 120, frontFt: 40, sideFt: 15, rearFt: 40 },
  'UC:RA-40': { ...uc, label: 'RA-40', minLotSf: 40000, minWidthFt: 120, frontFt: 40, sideFt: 15, rearFt: 40 },
  'UC:R-20': { ...uc, label: 'R-20', minLotSf: 20000, minWidthFt: 100, frontFt: 40, sideFt: 12, rearFt: 40 },
  'UC:RA-20': { ...uc, label: 'RA-20', minLotSf: 20000, minWidthFt: 100, frontFt: 40, sideFt: 12, rearFt: 40 },
  'UC:R-15': { ...uc, label: 'R-15', minLotSf: 15000, minWidthFt: 80, frontFt: 30, sideFt: 10, rearFt: 30 },
  'UC:R-10': { ...uc, label: 'R-10', minLotSf: 10000, minWidthFt: 70, frontFt: 30, sideFt: 10, rearFt: 30 },
  'UC:R-8': { ...uc, label: 'R-8', minLotSf: 8000, minWidthFt: 60, frontFt: 30, sideFt: 10, rearFt: 30, apt: { density: 8.7, stories: 3 } },
  'UC:R-6': { ...uc, label: 'R-6', minLotSf: 6000, minWidthFt: 50, frontFt: 25, sideFt: 8, rearFt: 25, apt: { density: 11.6, stories: 3 } },
  'UC:R-4': { ...uc, label: 'R-4', minLotSf: 4000, minWidthFt: 35, frontFt: 20, sideFt: 5, rearFt: 25, apt: { density: 21.8, stories: 3 } },
}
export const UNION_COUNTY_ORDER = ['UC:R-40', 'UC:R-20', 'UC:R-15', 'UC:R-10', 'UC:R-8', 'UC:R-6', 'UC:R-4']

// Cabarrus County Development Ordinance (Chapter 5, amended Jan 18, 2022), open space subdivision
// standards for unincorporated land (the one type allowed in every residential district; MDR and HDR
// allow no other). Each requires 35-40% common open space; LDR-HDR require public water and sewer.
// Keys carry "CC:".
export const CABARRUS_COUNTY_SOURCE = 'Cabarrus County Development Ordinance Chapter 5 (open space subdivisions, amended Jan 2022)'
const cc2 = { jurisdiction: 'Cabarrus County', bonusTo: null, heightFt: 40 }
export const CABARRUS_COUNTY_RULES = {
  'CC:AO': { ...cc2, label: 'AO', minLotSf: 43560, minWidthFt: 150, maxDensity: 0.5, frontFt: 50, sideFt: 20, rearFt: 30, densityNote: 'up to 0.5 units per acre with 40% open space; lots at least 1 acre (septic)' },
  'CC:CR': { ...cc2, label: 'CR', minLotSf: 43560, minWidthFt: 125, maxDensity: 1.0, frontFt: 50, sideFt: 20, rearFt: 30, densityNote: 'up to 1 unit per acre with 40% open space; lots at least 1 acre (septic)' },
  'CC:LDR': { ...cc2, label: 'LDR', minLotSf: 15000, minWidthFt: 75, maxDensity: 1.5, frontFt: 30, sideFt: 10, rearFt: 30, densityNote: 'up to 1.5 units per acre with 35% open space' },
  'CC:MDR': { ...cc2, label: 'MDR', minLotSf: 8000, minWidthFt: 60, maxDensity: 2.5, frontFt: 25, sideFt: 5, rearFt: 20, densityNote: 'up to 2.5 units per acre with 35% open space' },
  'CC:HDR': { ...cc2, label: 'HDR', minLotSf: 4000, minWidthFt: 40, maxDensity: 4.5, frontFt: 15, sideFt: 5, rearFt: 15, densityNote: 'up to 4.5 units per acre with 35% open space' },
}
export const CABARRUS_COUNTY_ORDER = ['CC:AO', 'CC:CR', 'CC:LDR', 'CC:MDR', 'CC:HDR']

export const TOWN_RULES = { ...CONCORD_RULES, ...MONROE_RULES, ...MATTHEWS_RULES, ...MINT_HILL_RULES, ...HUNTERSVILLE_RULES, ...PINEVILLE_RULES, ...KANNAPOLIS_RULES, ...HARRISBURG_RULES, ...WAXHAW_RULES, ...STALLINGS_RULES, ...CORNELIUS_RULES, ...DAVIDSON_RULES, ...YORK_COUNTY_RULES, ...FORT_MILL_RULES, ...TEGA_CAY_RULES, ...UNION_COUNTY_RULES, ...CABARRUS_COUNTY_RULES }
export const TOWN_ORDERS = { Concord: CONCORD_ORDER, Monroe: MONROE_ORDER, Matthews: MATTHEWS_ORDER, 'Mint Hill': MINT_HILL_ORDER, Huntersville: HUNTERSVILLE_ORDER, Pineville: PINEVILLE_ORDER, Kannapolis: KANNAPOLIS_ORDER, Harrisburg: HARRISBURG_ORDER, Waxhaw: WAXHAW_ORDER, Stallings: STALLINGS_ORDER, Cornelius: CORNELIUS_ORDER, 'York County': YORK_COUNTY_ORDER, 'Fort Mill': FORT_MILL_ORDER, 'Union County': UNION_COUNTY_ORDER, 'Cabarrus County': CABARRUS_COUNTY_ORDER }
export const TOWN_SOURCES = { Concord: CONCORD_SOURCE, Monroe: MONROE_SOURCE, Matthews: MATTHEWS_SOURCE, 'Mint Hill': MINT_HILL_SOURCE, Huntersville: HUNTERSVILLE_SOURCE, Pineville: PINEVILLE_SOURCE, Kannapolis: KANNAPOLIS_SOURCE, Harrisburg: HARRISBURG_SOURCE, Waxhaw: WAXHAW_SOURCE, Stallings: STALLINGS_SOURCE, Cornelius: CORNELIUS_SOURCE, 'York County': YORK_COUNTY_SOURCE, 'Fort Mill': FORT_MILL_SOURCE, 'Union County': UNION_COUNTY_SOURCE, 'Cabarrus County': CABARRUS_COUNTY_SOURCE }
export const TOWN_PLANS = { Concord: '2030 Land Use Plan', Monroe: 'Forward Monroe plan', Matthews: 'Envision Matthews land use plan', 'Mint Hill': 'Comprehensive Plan and Future Land Use map', Huntersville: '2040 Community Plan', Pineville: 'Comprehensive Plan and Residential Overlay District', Kannapolis: 'Comprehensive Plan', Harrisburg: 'Land Use Plan', Waxhaw: 'Comprehensive Plan', Stallings: 'Comprehensive Land Use Plan', Cornelius: 'Land Use Plan', 'York County': '2035 Comprehensive Plan', 'Fort Mill': 'Comprehensive Plan', 'Union County': '2050 Comprehensive Plan', 'Cabarrus County': 'area land use plans' }
// what a district is called on screen (Mint Hill's keys carry a town prefix)
export const districtLabel = (code) => TOWN_RULES[code]?.label || code