# Groundwork (prototype)

Parcel map for Mecklenburg (Charlotte) and Cabarrus counties, NC.

- **Charlotte parcels:** zoning, Charlotte UDO standards for Neighborhood 1 districts,
  a by-right lot estimate, and a rezoning outlook built from the 2040 Policy Map and
  the city's rezoning history.
- **Cabarrus parcels:** distance to sewer and water mains (Concord), zoning for six towns.
- **Everywhere:** FEMA floodplain share, soils, owner, mailing address, values, last sale.


## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:5173, zoom into Concord or Harrisburg, and click a parcel.

## Deploy to Vercel

1. Push this folder to a new GitHub repo.
2. In Vercel, choose **Add New → Project**, import the repo, and keep the default Vite settings.
3. Deploy. `vercel.json` already routes the `/gis/*` data paths to the public sources.

## Data sources (all free and public)

| What | Source | Endpoint |
|---|---|---|
| Mecklenburg parcels, owners, values, sales | City of Charlotte GIS | `PLN/AllParcelData/MapServer/0`, `CountyData/Parcels/MapServer/0` |
| Charlotte zoning | City of Charlotte GIS | `PLN/Zoning/MapServer/0` |
| Active rezoning petitions | City of Charlotte GIS | `PLN/Rezonings/MapServer/0` |
| Rezoning history (7,600+ petitions) | City of Charlotte GIS | `PLN/RezoningHistory/MapServer/0` |
| 2040 Policy Map place types | City of Charlotte (ArcGIS Online) | `Charlotte_Future_2040_Policy_Map/FeatureServer/0` |
| Charlotte UDO Neighborhood 1 standards | read.charlotteudo.org, Article 4 | `src/data/charlotteUdo.js` |
| Cabarrus parcels, owners, values, sales | Cabarrus County GIS | `OpenData/Tax_Parcels/MapServer/1` |
| Zoning (6 towns) | Cabarrus County GIS | `OpenData/Zoning_By_Municipalities/MapServer/0–6` |
| Gravity sewer mains | City of Concord | `SGravityMain/FeatureServer/0` |
| Water pressure mains | City of Concord | `WaterSystem/FeatureServer/7` |
| Flood zones | FEMA NFHL | `public/NFHL/MapServer/28` |
| Soils | USDA Soil Data Access | `Tabular/post.rest` |
| Basemaps | Esri World Imagery / Street Map | tile services |

Every app request goes through `/gis/...` so the browser never calls county
servers directly. Locally that's the Vite proxy in `vite.config.js`; on Vercel
it's the rewrites in `vercel.json`. To add a source, add a matching entry to both.

## Charlotte Water data (run once, then refresh monthly)

Charlotte Water doesn't publish its pipe network, but every rezoning staff analysis
includes a Charlotte Water statement such as "accessible ... via an existing 8-inch
gravity sewer main located along Cochrane Drive." This script collects those
statements for every petition since 2020 and places each main on the map:

```bash
npm run data:charlotte-water -- --limit 25   # quick test
npm run data:charlotte-water                 # full run, roughly 30-60 minutes
```

It writes `public/data/charlotte-water.json`. **Commit that file** so Vercel serves it.
Progress is cached in `.cache/charlotte-water/`, so you can stop and restart, and
later runs only fetch new petitions.

How pipes are located: "inside parcel 05142102" uses that parcel's shape; "along
Cochrane Dr" uses Cochrane Dr centerline segments within 1,500 ft of the petition
site. Distances are measured to those shapes, so they confirm a main exists near the
site but may not show the closest one. Parser tests use real staff-analysis wording
(`scripts/lib/parseWater.mjs`).

## How the Charlotte analysis works

**By-right lots (N1 districts only).** Sites under an acre are treated as a simple lot
split. Larger sites assume 70% of non-floodplain land ends up in lots after streets
and stormwater (`LOT_EFFICIENCY` in `src/lib/analysis.js`). Conservation subdivision
uses the UDO formula directly: gross acreage ÷ minimum lot area (Sec. 4.5, N1-A to
N1-D, 2+ acres). The mixed-income bonus builds to the next district's standards.

**Rezoning outlook.** A reasons-based scorecard, not a probability:
1. Does the requested district match the parcel's 2040 place type?
2. How big a step up is it from current zoning?
3. How did petitions within ½ mile go since 2020?
4. Is a petition already in process on the site?

Two or more red flags = Uphill; no red flags and at least two green = Favorable;
otherwise Mixed. Citywide base rates and approval timing are pulled live.

Findings from the history that shaped this: since 2020 about 90% of decided petitions
were approved, 9% withdrawn, and under 1% denied, so withdrawal is the usual way a
rezoning fails. NC repealed protest petitions in 2015 and the city stopped recording
plan consistency on petitions after the UDO, so neither is used as a signal.

## Known limits

- Charlotte water and sewer come from rezoning records, so coverage is densest where
  rezonings happen and thin in established neighborhoods. Cabarrus covers Concord only.
- Charlotte UDO standards are loaded for N1 districts only. N2, commercial, campus,
  ML, IMU, center, and TOD districts show a link to the UDO article instead.
- Other Mecklenburg towns (Huntersville, Matthews, etc.) aren't covered by the
  Charlotte zoning layer.
- The place-type fit table in `src/data/charlotteUdo.js` is a typical alignment;
  Charlotte planning staff make the official consistency finding.
- Unincorporated zoning (Cabarrus County's own districts) isn't wired in yet.
- Saved parcels live in the browser only. Moving them to Supabase is the next step.
- Esri basemap tiles are fine for a prototype. A paid product needs a
  commercial tile plan (Esri, MapTiler, or Mapbox).
- Distances are measured edge-to-line and are planning estimates, not survey data.
