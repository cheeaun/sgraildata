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
- Train Station Exit Point: https://www.mytransport.sg/content/mytransport/home/dataMall/search_datasets.html?searchText=exit (`SHP` file converted to `GeoJSON` on https://mapshaper.org/)
- LTA MRT Station Exit: https://data.gov.sg/dataset/lta-mrt-station-exit (OUTDATED)
- Master Plan 2019 Rail Station layer: https://data.gov.sg/dataset/master-plan-2019-rail-station-layer
- Station codes: https://www.mytransport.sg/content/dam/datamall/datasets/Geospatial/TrainStation.zip (`SHP` file converted to `JSON records` on https://mapshaper.org/)
- A point representation to indicate the location of the MRT station: https://www.mytransport.sg/content/dam/datamall/datasets/Geospatial/TrainStation.zip via https://www.mytransport.sg/content/mytransport/home/dataMall/static-data.html
- Line for Thomson-East Coast Line from OSM:
  - Run `node scripts/fetch-tel-lines`

## Generate final data

- Run `node scripts/build-geojson`
