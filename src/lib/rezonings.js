import * as turf from '@turf/turf'
import { getJSON } from './gis'
import { activePetitionShapes } from './charlotte'

// Every county publishes something different, so each source says what it covers.
export const SOURCE_NOTES = {
  Mecklenburg: 'Charlotte rezoning petitions currently in process.',
  Cabarrus: 'City of Concord rezoning cases. Concord stopped updating this list after 2024, and other Cabarrus towns don\'t publish cases.',
  York: 'Rezonings York County approved in the last two years (unincorporated areas). Pending cases and town rezonings aren\'t published.',
}

const YORK_ZONING = `/gis/yorksc/${encodeURIComponent('York County Zoning (regions)')}/FeatureServer/0`
const CONCORD_CASES = '/gis/concord/Case_Polygons/FeatureServer/7'
const ACRES = (f) => { try { return turf.area(f) / 4046.8564224 } catch { return null } }

/* ---------- Mecklenburg: active Charlotte petitions ---------- */
async function mecklenburg() {
  const d = await activePetitionShapes()
  return (d.features || []).filter((f) => f.geometry).map((f) => {
    const p = f.properties
    return turf.feature(f.geometry, {
      key: `M-${p.Petition}`, county: 'Mecklenburg', caseNumber: p.Petition, title: p.Petitioner || '',
      fromZone: (p.ExistZone || '').trim(), toZone: (p.ReqZone || '').trim(),
      status: 'In process', kind: 'active', date: p.Received || null, acres: p.PetAcres || ACRES(f),
    })
  })
}

/* ---------- York: approvals recorded on the county zoning map ---------- */
async function york() {
  const since = new Date(); since.setMonth(since.getMonth() - 24)
  const [d, legend] = await Promise.all([
    getJSON(`${YORK_ZONING}/query`, {
      where: `RezoningCaseNumber IS NOT NULL AND CouncilAdoptionDate >= DATE '${since.toISOString().slice(0, 10)}'`,
      outFields: 'zone,ConditionalZoning,RezoningCaseNumber,CouncilAdoptionDate',
      returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.00003, geometryPrecision: 6, f: 'geojson',
    }),
    getJSON(YORK_ZONING, { f: 'json' }).then((m) => Object.fromEntries((m.drawingInfo?.renderer?.uniqueValueInfos || []).map((i) => [String(i.value), i.label]))).catch(() => ({})),
  ])
  // one case can cover several zoning areas; merge them
  const byCase = new Map()
  for (const f of d.features || []) {
    if (!f.geometry) continue
    const a = f.properties
    const c = byCase.get(a.RezoningCaseNumber) || { polys: [], zones: new Set(), conditional: false, date: a.CouncilAdoptionDate }
    c.polys.push(...(f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates))
    c.zones.add(a.zone)
    c.conditional ||= a.ConditionalZoning === 1
    c.date = Math.max(c.date || 0, a.CouncilAdoptionDate || 0)
    byCase.set(a.RezoningCaseNumber, c)
  }
  return [...byCase.entries()].map(([num, c]) => {
    const geometry = { type: 'MultiPolygon', coordinates: c.polys }
    const zones = [...c.zones]
    return turf.feature(geometry, {
      key: `Y-${num}`, county: 'York', caseNumber: `York ${num}`, title: '',
      fromZone: '', toZone: zones.join(', '), toName: zones.map((z) => legend[z]).filter(Boolean).join(', '),
      conditional: c.conditional, status: 'Approved', kind: 'approved', date: c.date || null, acres: ACRES(turf.feature(geometry)),
    })
  })
}

/* ---------- Cabarrus: City of Concord case layer ---------- */
function concordStatus(status, update) {
  const s = (status || '').trim()
  if (/withdrawn/i.test(s)) return ['Withdrawn', 'other']
  if (/agenda/i.test(s)) return ['On upcoming agenda', 'active']
  if (/complete/i.test(s)) return /approv/i.test(update || '') ? ['Approved', 'approved'] : /den(ied|y)/i.test(update || '') ? ['Denied', 'other'] : ['Decided', 'other']
  if (/post/i.test(s)) return ['Post-processing', 'other']
  return ['Status not listed', 'other']
}

async function concord() {
  const d = await getJSON(`${CONCORD_CASES}/query`, {
    where: "CaseType = 'Zoning Map Amendment'",
    outFields: 'CaseNumber,CaseName,Description,Status,MostRecentUpdate,Year,httpLocation',
    returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.00003, geometryPrecision: 6, f: 'geojson',
  })
  return (d.features || []).filter((f) => f.geometry).map((f) => {
    const p = f.properties
    const [status, kind] = concordStatus(p.Status, p.MostRecentUpdate)
    const updDate = (p.MostRecentUpdate || '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1]
    // "Rezoning from RC (Residential Compact) to O-I (Office Institutional District)."
    const m = (p.Description || '').match(/from\s+(.+?)\s+to\s+(.+?)\.?$/i)
    return turf.feature(f.geometry, {
      key: `C-${p.CaseNumber}`, county: 'Cabarrus', caseNumber: p.CaseNumber, title: p.CaseName || '',
      fromZone: m ? m[1] : '', toZone: m ? m[2] : '', description: m ? '' : (p.Description || ''),
      update: (p.MostRecentUpdate || '').replace(/^\d{4}-\d{2}-\d{2}:\s*/, ''),
      status, kind, date: updDate ? Date.parse(updDate) : (p.Year ? Date.UTC(p.Year, 0, 1) : null), acres: ACRES(f),
      link: p.httpLocation || null, town: 'Concord',
    })
  })
}

/**
 * All rezoning cases, by county. A county that fails to load comes back with an error
 * message instead of breaking the others.
 */
export async function loadRezonings() {
  const [m, c, y] = await Promise.allSettled([mecklenburg(), concord(), york()])
  const pick = (r) => (r.status === 'fulfilled' ? { features: r.value } : { features: [], error: 'Could not load right now.' })
  const byCounty = { Mecklenburg: pick(m), Cabarrus: pick(c), York: pick(y) }
  const all = Object.values(byCounty).flatMap((x) => x.features)
  return { byCounty, all: turf.featureCollection(all) }
}
