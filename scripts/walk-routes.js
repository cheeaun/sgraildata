const { readFile, writeFile } = require('../utils');
const distance = require('@turf/distance').default;

const data = readFile('./data/v1/sg-rail.geojson');

const stations = data.features.filter(
  (f) => f.properties.stop_type === 'station',
);
const mrtStations = stations.filter(
  (f) => f.properties.network === 'singapore-mrt',
);

const nearbyStationsPair = [];
const nearbyStationsPairCodes = {};
mrtStations.forEach((s1) => {
  mrtStations.forEach((s2) => {
    const c1 = s1.properties.station_codes;
    const c2 = s2.properties.station_codes;
    if (c1 === c2) return;
    const d = distance(s1, s2); // km
    if (d >= 0.6) return;
    const c12 = c1 + c2;
    const c21 = c2 + c1;
    if (nearbyStationsPairCodes[c12] || nearbyStationsPairCodes[c21]) return;
    nearbyStationsPairCodes[c12] = true;
    nearbyStationsPair.push([s1, s2]);
  });
});

const pairs = nearbyStationsPair.map(([p1, p2]) => [
  p1.properties.name,
  p2.properties.name,
]);
console.log(pairs);
