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

export const TOWN_RULES = { ...CONCORD_RULES, ...MONROE_RULES }
export const TOWN_ORDERS = { Concord: CONCORD_ORDER, Monroe: MONROE_ORDER }
export const TOWN_SOURCES = { Concord: CONCORD_SOURCE, Monroe: MONROE_SOURCE }
export const TOWN_PLANS = { Concord: '2030 Land Use Plan', Monroe: 'Forward Monroe plan' }