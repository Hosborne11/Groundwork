import * as turf from '@turf/turf'
import { getJSON } from './gis'

// Counties Groundwork covers. GEOID = state FIPS + county FIPS.
export const COUNTIES = [
  { id: '37119', name: 'Mecklenburg', note: 'Charlotte and surrounding towns' },
  { id: '37025', name: 'Cabarrus', note: 'Concord, Kannapolis, Harrisburg' },
  { id: '45091', name: 'York', note: 'Rock Hill, Fort Mill, Tega Cay, Clover (SC)' },
]

let loading = null
/** County boundaries from the U.S. Census Bureau (TIGERweb), simplified for display. */
export function loadCounties() {
  if (!loading) {
    loading = getJSON('/gis/tiger/State_County/MapServer/1/query', {
      where: `GEOID IN (${COUNTIES.map((c) => `'${c.id}'`).join(',')})`,
      outFields: 'GEOID,BASENAME',
      returnGeometry: true,
      outSR: 4326,
      maxAllowableOffset: 0.0005,
      geometryPrecision: 5,
      f: 'geojson',
    }).catch((e) => { loading = null; throw e })
  }
  return loading
}

/** Which covered county contains a point, or null. */
export function countyAt(fc, [lng, lat]) {
  const pt = turf.point([lng, lat])
  const hit = (fc?.features || []).find((f) => { try { return turf.booleanPointInPolygon(pt, f) } catch { return false } })
  return hit?.properties.GEOID || null
}
