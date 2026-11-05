import * as turf from '@turf/turf'
import { getJSON } from './gis'

// Union County, NC zoning. The county publishes its own zoning plus a separate layer for each
// town, and each town's layer names its zoning field differently.
const LAYERS = '/gis/union/UNION_COUNTY_LAYERS/MapServer'
const MUNIS = '/gis/union/Municipalities/MapServer/5'
const TOWNS = {
  Fairview: [173, 'ZONE'],
  'Indian Trail': [174, 'NEW_ZONIN'],
  'Lake Park': [175, 'LP_Zone'],
  Marshville: [176, 'Zoning'],
  Marvin: [177, 'Marvin_Zon'],
  'Mineral Springs': [178, 'ZoneDesc'],
  'Mint Hill': [179, 'MH_ZONE'],
  Monroe: [180, 'NEW_ZONING'],
  Stallings: [181, 'CurrentZon'],
  Unionville: [182, 'zoning'],
  Waxhaw: [183, 'Zoning'],
  Weddington: [184, 'ZONE'],
  'Wesley Chapel': [185, 'ZONE'],
  Wingate: [186, 'ZONE'],
}
const COUNTY = [190, 'ZONE']

const atPoint = (parcel, outFields) => {
  const [lng, lat] = turf.pointOnFeature(parcel).geometry.coordinates
  return { geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: false, f: 'json' }
}
const clean = (v) => (v ?? '').toString().trim()

/** { town, code, source, petition } — code is null when no zoning is mapped here */
export async function unionZoning(parcel) {
  const muni = await getJSON(`${MUNIS}/query`, atPoint(parcel, 'NAME')).catch(() => null)
  const name = clean(muni?.features?.[0]?.attributes?.NAME)
  const town = name && name !== 'Union County' ? name : null

  if (town && TOWNS[town]) {
    const [id, field] = TOWNS[town]
    const z = await getJSON(`${LAYERS}/${id}/query`, atPoint(parcel, field)).catch(() => null)
    const code = clean(z?.features?.[0]?.attributes?.[field])
    if (code) return { town, code, source: `Town of ${town}` }
  }
  const [id, field] = COUNTY
  const z = await getJSON(`${LAYERS}/${id}/query`, atPoint(parcel, `${field},PETITION`)).catch(() => null)
  const a = z?.features?.[0]?.attributes
  const code = clean(a?.[field])
  if (code && code.toUpperCase() !== 'CITY') return { town: town || 'Unincorporated Union County', code, source: 'Union County', petition: clean(a.PETITION) || null }
  return { town: town || 'Union County', code: null, source: null }
}
