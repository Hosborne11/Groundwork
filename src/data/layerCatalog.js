// The Explore Layers catalog: every layer Groundwork can draw, with where it applies and how to load it.
// kind 'builtin' = an existing map layer switched through App's `layers` state (key);
// kind 'vector'  = features fetched for the current view from an ArcGIS service (url or urls, code field).

const AGOL = (org, svc, n = 0) => `https://services${org}/arcgis/rest/services/${svc}/FeatureServer/${n}`
const UNION = (n) => `/gis/union/UNION_COUNTY_LAYERS/MapServer/${n}`
const CAB = (n) => `/gis/cabarrus/OpenData/Zoning_By_Municipalities/MapServer/${n}`

export const CATEGORIES = [
  { id: 'zoning', label: 'Zoning & Land Use', hue: '#4E7D3A' },
  { id: 'environment', label: 'Environmental', hue: '#2D6E8E' },
  { id: 'utilities', label: 'Utilities', hue: '#3A7A5E' },
  { id: 'boundaries', label: 'Parcels & Boundaries', hue: '#4A5A6E' },
  { id: 'growth', label: 'Market & Growth', hue: '#6E5A2E' },
  { id: 'community', label: 'Schools & Community', hue: '#4A4E8A' },
]

export const LOCATIONS = ['Mecklenburg', 'Cabarrus', 'Union', 'York']

const zoning = (id, name, county, towns, url, field, source, extra = {}) => ({
  id, name: `${name} zoning`, category: 'zoning', kind: 'vector', style: 'zoning', url, field, minzoom: 13.5,
  locations: [county, ...towns], source, desc: `Zoning districts for ${name}, colored by district family and labeled with the district code.`, ...extra,
})

export const CATALOG = [
  // existing map layers
  { id: 'parcels', key: 'parcels', kind: 'builtin', category: 'boundaries', name: 'Parcel lines', locations: LOCATIONS, source: 'County GIS', desc: 'Property lines for every parcel. Visible from neighborhood zoom.' },
  { id: 'flood', key: 'flood', kind: 'builtin', category: 'environment', name: 'FEMA flood zones', locations: LOCATIONS, source: 'FEMA NFHL', desc: '100-year (1% annual) and 500-year floodplain and regulatory floodway.' },
  { id: 'terrain', key: 'terrain', kind: 'builtin', category: 'environment', name: 'Terrain: relief and 5 ft contours', locations: LOCATIONS, source: 'USGS 3DEP', desc: 'Shaded relief with 5 ft contour lines from lidar elevation.' },
  { id: 'sewer', key: 'sewer', kind: 'builtin', category: 'utilities', name: 'Sewer mains', locations: LOCATIONS, source: 'City and county utilities', desc: 'Gravity sewer and force mains where the utility publishes them; Charlotte mains from rezoning reviews.' },
  { id: 'water', key: 'water', kind: 'builtin', category: 'utilities', name: 'Water mains', locations: LOCATIONS, source: 'City and county utilities', desc: 'Water distribution mains where the utility publishes them.' },
  { id: 'rezonings', key: 'rezonings', kind: 'builtin', category: 'zoning', name: 'Rezonings: in process and approved', locations: LOCATIONS, source: 'City and county planning', desc: 'Active rezoning petitions (amber) and recently approved ones (violet).' },
  { id: 'opportunity', key: 'opportunity', kind: 'builtin', category: 'growth', name: 'Development opportunity', locations: LOCATIONS, source: 'Groundwork analysis', desc: 'Hexagons scored from rezonings, land sales, price trends, vacant land, new homes, and utilities.' },
  { id: 'schools', key: 'schools', kind: 'builtin', category: 'community', name: 'Schools', locations: LOCATIONS, source: 'NC DPI, SC Dept. of Education', desc: 'Public, charter, and York private schools by level.' },

  // land use and boundaries
  { id: 'lu-clt-2040', kind: 'vector', style: 'zoning', category: 'zoning', name: 'Charlotte 2040 Policy Map', url: '/gis/agolclt/Charlotte_Future_2040_Policy_Map/FeatureServer/0', field: 'PlaceTypeCde', minzoom: 12,
    locations: ['Mecklenburg', 'Charlotte'], source: 'City of Charlotte', desc: 'Adopted place types (Neighborhood 1, Neighborhood 2, activity centers, and more) that guide rezonings.' },
  { id: 'b-meck', kind: 'vector', style: 'boundary', category: 'boundaries', name: 'Town limits: Mecklenburg', url: 'https://meckgis.mecklenburgcountync.gov/server/rest/services/Jurisdictions/FeatureServer/0', field: 'name', minzoom: 9,
    locations: ['Mecklenburg'], source: 'Mecklenburg County GIS', desc: 'Charlotte and the six towns, including their extraterritorial jurisdictions.' },
  { id: 'b-union', kind: 'vector', style: 'boundary', category: 'boundaries', name: 'Town limits: Union', url: '/gis/union/Municipalities/MapServer/5', field: 'NAME', minzoom: 9,
    locations: ['Union'], source: 'Union County GIS', desc: 'Municipal limits for Monroe, Indian Trail, Waxhaw, Stallings, and the other Union towns.' },

  // zoning by jurisdiction
  zoning('z-charlotte', 'Charlotte', 'Mecklenburg', ['Charlotte'], '/gis/clt/PLN/Zoning/MapServer/0', 'ZoneDes', 'City of Charlotte'),
  zoning('z-huntersville', 'Huntersville', 'Mecklenburg', ['Huntersville'], AGOL('7.arcgis.com/CADYoH7VVBN3BQHU', 'huntersville_zoning_current'), 'ZONE_DES', 'Town of Huntersville'),
  zoning('z-matthews', 'Matthews', 'Mecklenburg', ['Matthews'], null, 'ZONE_DES', 'Town of Matthews', {
    urls: ['Traditional_Residential_Districts', 'Conditional_Only_District', 'Conditional_Districts', 'Traditional_Nonresidential_Districts'].map((n) => AGOL('5.arcgis.com/Ueg5beFsCRb0dUTQ', n)) }),
  zoning('z-minthill', 'Mint Hill', 'Mecklenburg', ['Mint Hill'], AGOL('5.arcgis.com/4q0H41ETciaWgDNF', 'Zoning_Layer'), 'ZoneDes', 'Town of Mint Hill'),
  zoning('z-meck-towns', 'Pineville, Cornelius, and Davidson', 'Mecklenburg', ['Pineville', 'Cornelius', 'Davidson'], 'https://meckgis.mecklenburgcountync.gov/server/rest/services/UnincorporatedCountyandTownsZoning/FeatureServer/0', 'zone_des', 'Mecklenburg County GIS'),
  zoning('z-concord', 'Concord', 'Cabarrus', ['Concord'], '/gis/concord/Zoning/FeatureServer/10', 'ZONINGCODE', 'City of Concord'),
  zoning('z-kannapolis', 'Kannapolis', 'Cabarrus', ['Kannapolis'], CAB(3), 'ZONINGCODE', 'Cabarrus County GIS'),
  zoning('z-harrisburg', 'Harrisburg', 'Cabarrus', ['Harrisburg'], CAB(2), 'ZONINGCODE', 'Cabarrus County GIS'),
  zoning('z-cabarrus', 'Unincorporated Cabarrus', 'Cabarrus', [], '/gis/cabarrus/opendata/MapServer/35', 'ZONINGCODE', 'Cabarrus County GIS'),
  zoning('z-indiantrail', 'Indian Trail', 'Union', ['Indian Trail'], UNION(174), 'NEW_ZONIN', 'Union County GIS'),
  zoning('z-monroe', 'Monroe', 'Union', ['Monroe'], UNION(180), 'NEW_ZONING', 'Union County GIS'),
  zoning('z-stallings', 'Stallings', 'Union', ['Stallings'], UNION(181), 'CurrentZon', 'Union County GIS'),
  zoning('z-waxhaw', 'Waxhaw', 'Union', ['Waxhaw'], UNION(183), 'Zoning', 'Union County GIS'),
  zoning('z-union', 'Unincorporated Union', 'Union', [], UNION(190), 'ZONE', 'Union County GIS'),
  zoning('z-york', 'Unincorporated York', 'York', [], `/gis/yorksc/${encodeURIComponent('York County Zoning (regions)')}/FeatureServer/0`, 'zone', 'York County GIS'),
  zoning('z-rockhill', 'Rock Hill', 'York', ['Rock Hill'], `/gis/yorksc/${encodeURIComponent('Rock Hill Zoning')}/FeatureServer/0`, 'ZONE', 'York County GIS'),
  zoning('z-fortmill', 'Fort Mill', 'York', ['Fort Mill'], AGOL('8.arcgis.com/9DcCkxgoIscCej54', 'Town_of_Fort_Mill_Map_WFL1', 7), 'Zoning', 'Town of Fort Mill'),
  zoning('z-tegacay', 'Tega Cay', 'York', ['Tega Cay'], AGOL('8.arcgis.com/h9JHFVWvWofKfQhH', 'CityofTegaCaySC_Zoning'), 'ZoningCode', 'Catawba Regional COG'),
]

export const COLLECTIONS = [
  { id: 'diligence', name: 'Site due diligence', blurb: 'Floodplain, terrain, utilities, and parcel lines', layers: ['flood', 'terrain', 'sewer', 'water', 'parcels'], swatches: ['#2D6E8E', '#8E969E', '#4BB07A', '#5AA7E6'] },
  { id: 'rezoning', name: 'Rezoning watch', blurb: 'Rezonings, Charlotte zoning, and the 2040 Policy Map', layers: ['rezonings', 'z-charlotte', 'lu-clt-2040'], swatches: ['#F2A81D', '#A78BFA', '#D9B44A', '#4FAE9B'] },
  { id: 'utilities', name: 'Utilities', blurb: 'Sewer and water mains', layers: ['sewer', 'water'], swatches: ['#4BB07A', '#5AA7E6'] },
  { id: 'growth', name: 'Growth signals', blurb: 'Opportunity, rezonings, and schools', layers: ['opportunity', 'rezonings', 'schools'], swatches: ['#3FA37E', '#F2A81D', '#86ADD9'] },
]

/** Zoning and place-type codes grouped into families for color. Approximate across jurisdictions. */
export const FAMILIES = [
  { id: 'rural', label: 'Rural and agricultural', color: '#7FA65A', test: /^(AG|AO|RA-|RA\d|RR|RE$|RP$|RUD|R$|R \(CD\)|RL$|R-?40|R-?44|RSF-40|SFR-1|PR$|HV)/ },
  { id: 'planned', label: 'Planned development', color: '#A3ADB6', test: /(PUD|^PD|PND|PDD|PCD|^MP|TND|^SP$)/ },
  { id: 'mixed', label: 'Mixed use', color: '#4FAE9B', test: /^(MX|MU|TOD|NMX|WMX|RMX|TC$|VC$|DTWN|DC$|UR|NS$|VI$|VE$|CAC|RAC|MS$|IMU|N2-C|CC$)/ },
  { id: 'industrial', label: 'Industrial', color: '#9A7FD1', test: /^(I-|I\d|IG|IH|IB|LI|GI|HI|ML|ID$|CI$|EC$|INST|IND|M-?\d)/ },
  { id: 'office', label: 'Office and institutional', color: '#6C9BD2', test: /^(O-|O$|OI|OC|OA|NO$|INS|CE$)/ },
  { id: 'commercial', label: 'Commercial', color: '#D95F6E', test: /^(B-|B\d|C-|C\d|GC|HC|LC|NC|CB|BC|BP|RC$|HB|GB|CR-?\d|CG|BD|TS$)/ },
  { id: 'multi', label: 'Multifamily and attached', color: '#D9773E', test: /(MF|MFR|^RH|HDR|R18|^R-?8$|^R-?6$|^R-?4$|SF-A|^RT|GR-A|^RV|^N2|^UC:|R-VS|SRN)/ },
  { id: 'residential', label: 'Single-family residential', color: '#D9B44A', test: /.*/ },
]
export const familyOf = (code) => FAMILIES.find((f) => f.test.test(String(code || '').trim().toUpperCase())) || FAMILIES[FAMILIES.length - 1]
