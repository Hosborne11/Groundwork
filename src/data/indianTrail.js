/*
 * Town of Indian Trail, NC — residential zoning for neighborhood drafts.
 * Source: Indian Trail UDO §520.040, Table 500-1 "Residential Lot, Density, Setback and Building
 * Height Standards" (conventional development), as amended by Ord. 397 (Mar 26, 2024).
 *
 * District names (RSF, SF-1 ... SF-5, MFR) don't collide with Charlotte's (N1-x, N2-x), so these
 * share one rules registry with Charlotte's districts.
 */

export const IT_SOURCE = 'Indian Trail UDO Table 500-1 (amended March 2024)'

// frontFt: front setback on local streets; frontMajorFt: on boulevards and thoroughfares.
const base = { jurisdiction: 'Indian Trail', bonusTo: null }
export const IT_RULES = {
  RSF: { ...base, minLotSf: 40000, minWidthFt: 120, frontFt: 40, frontMajorFt: 50, rearFt: 40, sideFt: 15, heightFt: 35, coverage: '24%' },
  'SF-1': { ...base, minLotSf: 20000, minWidthFt: 100, frontFt: 40, frontMajorFt: 50, rearFt: 40, sideFt: 15, heightFt: 35, coverage: '24%' },
  'SF-2': { ...base, minLotSf: 15000, minWidthFt: 80, frontFt: 30, frontMajorFt: 40, rearFt: 40, sideFt: 12, heightFt: 35, coverage: '35%' },
  'SF-3': { ...base, minLotSf: 12000, minWidthFt: 80, frontFt: 30, frontMajorFt: 40, rearFt: 40, sideFt: 12, heightFt: 35, coverage: '35%' },
  'SF-4': { ...base, minLotSf: 10000, minWidthFt: 60, frontFt: 30, frontMajorFt: 40, rearFt: 40, sideFt: 10, heightFt: 35, coverage: '50%' },
  'SF-5': { ...base, minLotSf: 8000, minWidthFt: 60, frontFt: 25, frontMajorFt: 30, rearFt: 30, sideFt: 10, heightFt: 35, coverage: '50%' },
  // MFR: 3,350 sq ft of lot area per unit (about 13 units an acre), 40 ft tall
  MFR: { ...base, minLotSf: 3350, minWidthFt: 20, frontFt: 25, frontMajorFt: 30, rearFt: 30, sideFt: 10, heightFt: 40, apartment: true, sfPerUnit: 3350, maxStories: 3 },
}

// Single-family districts from least to most intense; a scenario offers the ones after the current district.
export const IT_ORDER = ['RSF', 'SF-1', 'SF-2', 'SF-3', 'SF-4', 'SF-5']
export const isIndianTrail = (code) => !!IT_RULES[code]