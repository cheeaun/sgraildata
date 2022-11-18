require('dotenv').config();
const { ONEMAP_TOKEN, MAPBOX_ACCESS_TOKEN } = process.env;

const { readFile, writeFile } = require('../utils');
const distance = require('@turf/distance').default;
const got = require('got');
const {
  featureCollection,
  feature,
  lineString,
  point,
} = require('@turf/helpers');
const cleanCoords = require('@turf/clean-coords').default;
const along = require('@turf/along').default;
const polyline = require('@mapbox/polyline');

const data = readFile('./data/v1/sg-rail.geojson');

const stations = data.features.filter(
  (f) => f.properties.stop_type === 'station',
);
const mrtStations = stations.filter(
  (f) => f.properties.network === 'singapore-mrt',
);
const exits = data.features.filter(
  (f) => f.properties.stop_type === 'entrance',
);

function stationsAreAdjacent(sc1, sc2) {
  const codes1 = sc1.split('-');
  const codes2 = sc2.split('-');
  const codes2Adjacents = [...codes2];
  codes2.forEach((c) => {
    const [alphabets, numbers] = (c.match(/([a-z]+)(\d+)/i) || []).slice(1);
    if (numbers) {
      codes2Adjacents.push(alphabets + (Number(numbers) + 1));
      codes2Adjacents.push(alphabets + (Number(numbers) - 1));
    }
  });
  for (let i = 0, l = codes1.length; i < l; i++) {
    if (codes2Adjacents.includes(codes1[i])) return true;
  }
  return false;
}

const maxDistance = 800; // meter
const maxWalkDuration = 10 * 60; // in seconds
const nearbyStationsPair = [];
const nearbyStationsPairCodes = {};
mrtStations.forEach((s1) => {
  mrtStations.forEach((s2) => {
    const c1 = s1.properties.station_codes;
    const c2 = s2.properties.station_codes;
    if (c1 === c2) return;
    if (stationsAreAdjacent(c1, c2)) return;
    const d = distance(s1, s2); // km
    if (d >= maxDistance / 1000) return;
    const c12 = c1 + c2;
    const c21 = c2 + c1;
    if (nearbyStationsPairCodes[c12] || nearbyStationsPairCodes[c21]) return;
    nearbyStationsPairCodes[c12] = true;
    nearbyStationsPair.push([s1, s2]);
  });
});

nearbyStationsPair.forEach(([p1, p2], i) => {
  console.log(
    `${(i + 1).toString().padStart(2, ' ')}. [${p1.properties.station_codes}] ${
      p1.properties.name
    } <-> [${p2.properties.station_codes}] ${p2.properties.name}`,
  );
});

function getExitsForStation(codes) {
  return exits.filter((e) => e.properties.station_codes === codes);
}
function timeout(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
const exitPairs = [];
(async () => {
  for (let i = 0, l = nearbyStationsPair.length; i < l; i++) {
    const [p1, p2] = nearbyStationsPair[i];
    const e1 = getExitsForStation(p1.properties.station_codes);
    const e2 = getExitsForStation(p2.properties.station_codes);
    let shortestDuration = Infinity;
    let exitPair;
    for (let i1 = 0, l1 = e1.length; i1 < l1; i1++) {
      const exit1 = e1[i1];
      for (let i2 = 0, l2 = e2.length; i2 < l2; i2++) {
        const exit2 = e2[i2];
        console.log(
          `➡️ ${p1.properties.station_codes} (${exit1.properties.name}) - ${p2.properties.station_codes} (${exit2.properties.name})`,
        );
        const startCoords = exit1.geometry.coordinates;
        const endCoords = exit2.geometry.coordinates;
        const coords = startCoords.join(',') + ';' + endCoords.join(',');
        // const { body } = await got(
        //   `https://api.mapbox.com/directions/v5/mapbox/walking/${encodeURIComponent(
        //     coords,
        //   )}`,
        //   {
        //     searchParams: {
        //       geometries: 'geojson',
        //       access_token: MAPBOX_ACCESS_TOKEN,
        //     },
        //     responseType: 'json',
        //   },
        // );
        // // console.log(body);
        // const { geometry, distance: d, duration } = body.routes[0];
        // console.log(d, duration);
        const { body } = await got(
          'https://developers.onemap.sg/publicapi/routingsvc/route',
          {
            responseType: 'json',
            searchParams: {
              start: [...startCoords].reverse().join(','),
              end: [...endCoords].reverse().join(','),
              routeType: 'walk',
              token: ONEMAP_TOKEN,
            },
          },
        );
        const {
          route_geometry,
          route_summary: { total_distance: d, total_time: duration },
        } = body;
        const lineCoords = polyline
          .decode(route_geometry)
          .map((coord) => coord.reverse());
        // Put the start and end coords back in because sometimes the line cut off from the actual points
        lineCoords.unshift(startCoords);
        lineCoords.push(endCoords);
        const { geometry } = cleanCoords(lineString(lineCoords));
        // const d = distance(exit1, exit2);
        if (duration <= maxWalkDuration && duration <= shortestDuration) {
          shortestDuration = duration;
          exitPair = [p1, exit1, p2, exit2, d, duration, geometry];
        }
        await timeout(240);
      }
    }
    if (exitPair) exitPairs.push(exitPair);
    await timeout(240);
  }

  const exitNamePairs = exitPairs.map(
    ([p1, e1, p2, e2, dist, dur, geometry]) => {
      return {
        'Station A ->': `${p1.properties.name} (Exit ${e1.properties.name})`,
        '<- Station B': `${p2.properties.name} (Exit ${e2.properties.name})`,
        'Distance (m)': Math.round(dist),
        'Walk duration (min)': Math.ceil(dur / 60),
      };
    },
  );
  console.table(exitNamePairs);

  const features = exitPairs.map(([p1, e1, p2, e2, dist, dur, geometry]) => {
    const lineFeature = feature(geometry);
    const pointFeature = along(lineFeature, dist / 2 / 1000);
    pointFeature.properties.duration_min = Math.ceil(dur / 60);
    pointFeature.properties.station_codes_1 = p1.properties.station_codes;
    pointFeature.properties.station_codes_2 = p2.properties.station_codes;
    pointFeature.properties.exit_name_1 = e1.properties.name;
    pointFeature.properties.exit_name_2 = e2.properties.name;
    return [lineFeature, pointFeature];
  });
  writeFile(
    'data/v1/sg-rail-walks.geojson',
    featureCollection(features.flat()),
  );
})();
