import {
  N1, CONSERVATION_DISTRICTS, DISTRICTS, CONSERVATION_MIN_ACRES, MIXED_INCOME_MIN_ACRES,
  districtByCode, parseZoning, PLACE_TYPE_FIT, placeTypeKey,
} from '../data/charlotteUdo'

const SF_PER_ACRE = 43560
// Share of a site left for lots after streets, stormwater, and required open space.
// A planning rule of thumb, shown to the user and easy to change.
export const LOT_EFFICIENCY = 0.7

/**
 * By-right lot estimate for a Neighborhood 1 district.
 * floodPct removes floodplain from the developable area (null = not known yet).
 */
export function n1Yield(code, grossAcres, floodPct) {
  const std = N1[code]
  if (!std || !grossAcres) return null
  const grossSf = grossAcres * SF_PER_ACRE
  const netSf = grossSf * (1 - (floodPct || 0) / 100)
  // Under an acre, assume a simple lot split with no new streets; larger sites lose land to streets and stormwater.
  const smallSite = grossAcres < 1
  const conventional = Math.floor((netSf * (smallSite ? 1 : LOT_EFFICIENCY)) / std.minLotSf)

  const out = { std, grossSf, netSf, conventional, smallSite, singleLot: conventional <= 1 }

  if (CONSERVATION_DISTRICTS.includes(code) && grossAcres >= CONSERVATION_MIN_ACRES) {
    // Sec. 4.5: max lots = gross acreage / minimum lot area of the district
    out.conservationMax = Math.floor(grossSf / std.minLotSf)
  }
  if (std.bonusTo && grossAcres >= MIXED_INCOME_MIN_ACRES) {
    const bonusStd = N1[std.bonusTo]
    const withBonus = Math.floor((netSf * LOT_EFFICIENCY) / bonusStd.minLotSf)
    const bonusLots = Math.max(0, withBonus - conventional)
    if (bonusLots > 0) out.mixedIncome = { district: std.bonusTo, total: withBonus, bonusLots, affordableLots: Math.ceil(bonusLots / 2) }
  }
  return out
}


/* ---------- district families, including pre-2023 codes ---------- */

// Closest modern family for pre-UDO district codes. Approximate by design.
const LEGACY = [
  [/^R-\d+MF/, 'N2'], [/^UR-/, 'N2'], [/^R-(3|4|5|6|8)$/, 'N1'],
  [/^MUDD|^MX-|^TOD-M/, 'CAC'], [/^NS$/, 'NC'], [/^(B-1|B-2|BD|CC|B-1SCD)/, 'COM'],
  [/^(O-[123]|BP|INST|RE-[123])/, 'CAMPUS'], [/^I-[12]/, 'ML'], [/^TOD/, 'TOD'],
]
export const FAMILY_NAME = {
  N1: 'Neighborhood 1', N2: 'Neighborhood 2', NC: 'neighborhood center', CAC: 'activity center',
  RAC: 'regional center', COM: 'commercial', CAMPUS: 'campus/office', ML: 'industrial', IMU: 'innovation mixed-use', TOD: 'transit-oriented',
}

/** { family, approx } for any zoning code, or null. */
export function districtFamily(code) {
  const base = parseZoning(code || '').base.toUpperCase()
  if (!base) return null
  const d = districtByCode[base]
  if (d) return { family: d.family, approx: false }
  const hit = LEGACY.find(([re]) => re.test(base))
  return hit ? { family: hit[1], approx: true } : null
}

/** 'fits' | 'lower' | 'no' | null: how a district family sits against a place type. */
export function placeFit(family, placeName) {
  const key = placeTypeKey(placeName)
  if (!family || !key) return null
  if (family === 'TOD') return null
  const fit = PLACE_TYPE_FIT[key]
  if (fit.fits.includes(family)) return 'fits'
  if (fit.lowerOk?.includes(family)) return 'lower'
  return 'no'
}

/**
 * What nearby rezonings actually did, read against each site's own place type.
 * history items need { status, to, placeName }.
 */
export function areaTrend({ history, targetCode, place }) {
  const target = districtByCode[targetCode]
  const approved = history.filter((h) => h.status === 'Approved').map((h) => {
    const fam = districtFamily(h.to)
    return { ...h, family: fam?.family || null, approx: fam?.approx || false, fit: placeFit(fam?.family, h.placeName) }
  })
  const exceptions = approved.filter((h) => h.fit === 'no')
  // Precedent: same kind of district approved on the same kind of land as this parcel.
  const precedent = target ? approved.filter((h) => h.family === target.family && placeTypeKey(h.placeName) === placeTypeKey(place?.name)) : []
  const counts = {}
  for (const h of approved) if (h.family) counts[h.family] = (counts[h.family] || 0) + 1
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const anyApprox = approved.some((h) => h.approx)
  return { approved, exceptions, precedent, top, anyApprox }
}

/**
 * Rezoning outlook: a reasons-based scorecard, not a probability.
 * Each factor: { tone: 'good' | 'watch' | 'flag', title, detail }
 */
export function rezoningOutlook({ currentCode, targetCode, place, history, active, trend }) {
  const factors = []
  const target = districtByCode[targetCode]
  const current = districtByCode[parseZoning(currentCode || '').base]
  const placeKey = placeTypeKey(place?.name)
  const fit = placeKey ? PLACE_TYPE_FIT[placeKey] : null

  // 1. Policy Map fit
  if (!fit) {
    factors.push({ tone: 'watch', title: 'Policy Map', detail: 'No 2040 place type found for this parcel.' })
  } else if (target.family === 'TOD') {
    factors.push({ tone: 'watch', title: `Policy Map: ${fit.name}`, detail: 'TOD districts depend on distance to a transit station; staff review case by case.' })
  } else if (fit.fits.includes(target.family)) {
    factors.push({ tone: 'good', title: `Policy Map: ${fit.name}`, detail: `${target.name} matches the planned place type.` })
  } else if (fit.lowerOk?.includes(target.family)) {
    factors.push({ tone: 'good', title: `Policy Map: ${fit.name}`, detail: `${target.name} is less intense than planned, which staff generally accept.` })
  } else if ((trend?.precedent.length || 0) >= 2) {
    const n = trend.precedent.length
    factors.push({ tone: 'watch', title: `Policy Map: ${fit.name}`, detail: `${target.name} doesn't match the planned place type, but ${n} nearby ${FAMILY_NAME[target.family] || target.family} requests on ${fit.name} land were approved since 2020. Expect an inconsistency finding, with local precedent on your side.` })
  } else {
    factors.push({ tone: 'flag', title: `Policy Map: ${fit.name}`, detail: `${target.name} doesn't match the planned place type. Expect an inconsistency finding unless the place type is amended.` })
  }

  // 2. Size of the jump
  if (current?.rank && target.rank) {
    const steps = target.rank - current.rank
    if (steps <= 0) factors.push({ tone: 'good', title: 'Intensity change', detail: `Same or lower intensity than ${current.code}.` })
    else if (steps <= 2) factors.push({ tone: 'good', title: 'Intensity change', detail: `A modest step up from ${current.code} (${steps} district${steps > 1 ? 's' : ''}).` })
    else if (steps <= 5) factors.push({ tone: 'watch', title: 'Intensity change', detail: `A sizable step up from ${current.code} (${steps} districts). Expect questions about transitions to neighbors.` })
    else factors.push({ tone: 'flag', title: 'Intensity change', detail: `A large jump from ${current.code} (${steps} districts).` })
  } else if (current && current.family !== target.family) {
    const residential = ['N1', 'N2'].includes(current.family)
    const toEmployment = ['ML', 'COM', 'CAMPUS', 'IMU'].includes(target.family)
    factors.push(residential && toEmployment
      ? { tone: 'flag', title: 'Intensity change', detail: `Changes a neighborhood district (${current.code}) to ${target.name}, a hard case to make next to homes.` }
      : { tone: 'watch', title: 'Intensity change', detail: `Changes category from ${current.name} to ${target.name}.` })
  } else if (!current) {
    factors.push({ tone: 'watch', title: 'Intensity change', detail: `Current zoning (${currentCode || 'unknown'}) is a pre-2023 district, so the step size can't be compared directly.` })
  }

  // 3. Nearby decisions since 2020
  const decided = history.filter((h) => ['Approved', 'Withdrawn', 'Denied'].includes(h.status))
  const count = (s) => decided.filter((h) => h.status === s).length
  const approved = count('Approved'), withdrawn = count('Withdrawn'), denied = count('Denied')
  const sameFamily = decided.filter((h) => districtByCode[parseZoning(h.to).base]?.family === target.family)
  const sameFamilyApproved = sameFamily.filter((h) => h.status === 'Approved').length
  if (!decided.length) {
    factors.push({ tone: 'watch', title: 'Nearby decisions', detail: 'No rezonings decided within ½ mile since 2020, so there\'s no local track record.' })
  } else {
    const summary = `${approved} approved, ${withdrawn} withdrawn, ${denied} denied within ½ mile since 2020`
    const kind = target.family === 'N1' || target.family === 'N2' ? `${target.family} districts` : 'similar districts'
    const similar = sameFamily.length
      ? ` Of the ${sameFamily.length === 1 ? 'one request' : `${sameFamily.length} requests`} for ${kind}, ${sameFamilyApproved} ${sameFamilyApproved === 1 ? 'was' : 'were'} approved.`
      : ''
    const tone = denied > 0 || withdrawn > approved ? 'flag' : withdrawn * 3 > approved ? 'watch' : 'good'
    factors.push({ tone, title: 'Nearby decisions', detail: summary + '.' + similar })
  }

  // 4. Already in process?
  if (active.length) {
    const a = active[0]
    factors.push({ tone: 'watch', title: 'Active petition', detail: `Petition ${a.petition} (${a.from} to ${a.to}) is already in process on this site.` })
  }

  const flags = factors.filter((f) => f.tone === 'flag').length
  const goods = factors.filter((f) => f.tone === 'good').length
  const verdict = flags >= 2 ? 'Uphill' : flags === 0 && goods >= 2 ? 'Favorable' : 'Mixed'
  return { verdict, factors }
}
