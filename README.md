# SG Rail Data

> Singapore Rail data

This is a data-only repository to complement [RailRouter SG](https://github.com/cheeaun/railrouter-sg/).

## The data

It's in the `/data` folder.

Changelog in [`CHANGELOG.md`](./CHANGELOG.md).

## Notes

- `id`s are not guaranteed to be unique
- Rail line coordinates are not guaranteed to match the real tracks. They are also simplified and smoothed.
- Station buildings data is not complete;
  - Incomplete underground building data
  - Missing aboveground building data
  - Missing multiple levels (Ground level, basement level, etc)
- Some exits data are inaccurate and incomplete

## Data sources

- Routes and stops from [CityMapper](https://citymapper.com/singapore/)
  - Run `node scripts/fetch-routes-citymapper`
- Station names in Chinese and Tamil from Wikipedia
  - Run `node scripts/fetch-mrt-wikipedia`
  - Run `node scripts/fetch-lrt-wikipedia`
- Train Station Exit Point: https://datamall.lta.gov.sg/content/datamall/en/search_datasets.html?searchText=Train%20Station%20Exit%20Point (convert from `SHP` to `GeoJSON` - instructions below)
- LTA MRT Station Exit: https://data.gov.sg/dataset/lta-mrt-station-exit (OUTDATED)
- Master Plan 2019 Rail Station layer: https://data.gov.sg/dataset/master-plan-2019-rail-station-layer
- Station codes: https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/TrainStation.zip (convert from `SHP` to `JSON Records` - instructions below)
- A point representation to indicate the location of the MRT station: https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/TrainStation.zip via https://datamall.lta.gov.sg/content/datamall/en/static-data.html
- Line for Thomson-East Coast Line from OSM:
  - Run `node scripts/fetch-tel-lines`
- Line for Punggol LRT (East Loop) from OSM:
  - Run `node scripts/fetch-punggol-lrt-east-loop`
- Line for Downtown Line (DTL) from OSM:
  - Run `node scripts/fetch-downtown-line`

### Convert SHP to GeoJSON or JSON Records

1. Upload `SHP`, `DBF` and `PRJ` files on https://mapshaper.org/
  2. Open "Console" and enter `-proj from=EPSG:3414 crs=EPSG:4326` to convert from [SVY21 (EPSG:3414)](https://epsg.io/3414) to [WGS84 (EPSG:4326)](https://epsg.io/4326)
  3. Export as `GeoJSON` or `JSON Records`.

## Generate final data

- Run `node scripts/build-geojson`

## Upload tileset to Mapbox Tiling Service (MTS)

Use [`tilesets-cli`](https://github.com/mapbox/tilesets-cli).

- Upload new tileset source: `tilesets upload-source <username> <source_id> data/v1/sg-rail.geojson`
- Create new tileset with recipe: `tilesets create <tileset_id> --recipe data/v1/sg-rail.recipe.json --name "SG Rail"`
- Update recipe: `tilesets update <tileset_id> --recipe data/v1/sg-rail.recipe.json` (Note: after update, publish to see changes)
- Publish tileset: `tilesets publish <tileset_id>`