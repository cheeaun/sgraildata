const { readFile, writeFile } = require('../utils');
const {
  point,
  lineString,
  multiLineString,
  featureCollection,
  feature,
} = require('@turf/helpers');
const truncate = require('@turf/truncate').default;
const centerOfMass = require('@turf/center-of-mass').default;
const nearestPoint = require('@turf/nearest-point').default;
const rewind = require('@turf/rewind').default;
const simplify = require('@turf/simplify').default;
const namer = require('color-namer');
const { chaikin } = require('chaikin');

const routesData = readFile('./data/raw/routes.citymapper.json');
const codesData = readFile('./data/raw/MRTLRTStnPtt.json');
const wikipediaMRTData = readFile('./data/raw/wikipedia-mrt.json');
const wikipediaLRTData = readFile('./data/raw/wikipedia-lrt.json');
const stationData = readFile(
  './data/raw/master-plan-2019-rail-station-layer-geojson.geojson',
);
const exitsData = readFile('./data/raw/TrainStationExit06032020.json');

// https://github.com/darkskyapp/string-hash/
function hash(str) {
  let hash = 5381;
  let i = str.length;
  while (i) hash = (hash * 33) ^ str.charCodeAt(--i);
  return hash >>> 0;
}

function brand2Network(brand) {
  return {
    SingaporeMRT: 'singapore-mrt',
    SingaporeLRT: 'singapore-lrt',
  }[brand];
}

function color2Name(color) {
  return namer(color).html[0].name;
}

const codesOrder = ['NS', 'EW', 'NE', 'CC', 'DT'];
function sortStationCodes(a, b) {
  const aCode = a.match(/[a-z]+/i)[0];
  const bCode = b.match(/[a-z]+/i)[0];
  let aIndex = codesOrder.indexOf(aCode);
  let bIndex = codesOrder.indexOf(bCode);
  if (aIndex === -1) aIndex = 99;
  if (bIndex === -1) bIndex = 99;
  return aIndex - bIndex;
}
function stationName2Codes(name) {
  const cleanName = name
    .replace(/(l|m)rt/i, '')
    .replace(/stat?ion/i, '')
    .trim();
  const found = codesData.filter((d) => {
    const stnName = d.STN_NAME.trim()
      .replace(/\s*(m|l)rt\s+station.*$/i, '')
      .toLowerCase();
    const lowerCleanName = cleanName.toLowerCase();
    return (
      lowerCleanName === stnName ||
      lowerCleanName.replace(/road/i, '').trim() ===
        stnName.replace(/road/i, '').trim() // special case for Tuas West Road
    );
  });
  if (!found.length) console.log('NOT FOUND', cleanName);
  let codes;
  if (found.length === 1) {
    codes = found[0].STN_NO.split('/').map((s) => s.trim());
  } else {
    codes = found
      .map((f) => f.STN_NO.split('/').map((s) => s.trim()))
      .flat() // Flatten
      .filter((item, index, arr) => arr.indexOf(item) === index); // Remove dups
  }
  codes.sort(sortStationCodes);
  return codes;
}

const wikipediaData = [...wikipediaMRTData, ...wikipediaLRTData];
function stationCodes2Wikipedia(codes) {
  return wikipediaData.find((d) => {
    const lowerCodes = d.codes.map((c) => c.toLowerCase());
    return lowerCodes.includes(codes[0].toLowerCase());
  });
}

const colorMap = {
  NE: 'purple',
  DT: 'blue',
  NS: 'red',
  CC: 'yellow',
  CE: 'yellow',
  EW: 'green',
  CG: 'green',
  TE: 'brown',
  BP: 'gray',
  SE: 'gray',
  SW: 'gray',
  PE: 'gray',
  PW: 'gray',
  PTC: 'gray',
  STC: 'gray',
};
const code2Color = (code) =>
  colorMap[code.match(/[a-z]+/i)[0].toUpperCase()] || 'gray';

const { stops, routes } = routesData;

// STATIONS
console.log('Generate Stations...');
const stationCodes = [];
const stations = Object.values(stops).map((s) => {
  const { name, coords, brands } = s;

  const codes = stationName2Codes(name);
  const wikipedia = stationCodes2Wikipedia(codes);
  const { title, name_zh_Hans, name_ta, url } = wikipedia;

  const joinedCodes = codes.join('-');
  stationCodes.push(joinedCodes);

  const p = point(
    coords.reverse(),
    {
      name,
      'name_zh-Hans': name_zh_Hans,
      name_ta,
      network: brands.map(brand2Network).join('.'),
      // Custom
      network_count: codes.length,
      station_codes: joinedCodes,
      station_colors: codes
        .map((c) => c.replace(/\d+$/, ''))
        .map(code2Color)
        .join('-'),
      wikipedia: `en:${title}`, // https://wiki.openstreetmap.org/wiki/Key:wikipedia
      wikipedia_slug: url.replace(/^.*\/wiki\//i, ''),
      // Follow Mapbox
      stop_type: 'station',
      mode: 'metro_rail',
    },
    {
      id: hash(joinedCodes),
    },
  );
  return p;
});

// LINES
console.log('Generate Lines...');
const lines = routes.map((r) => {
  const { live_line_code, color, brand, long_name, patterns } = r;

  // Always get longest one first
  patterns.sort((a, b) => b.stop_points.length - a.stop_points.length);
  const diffPatterns = [patterns[0]];
  const diffStopPoints = patterns[0].stop_points.map((p) => p.id.toLowerCase());

  for (let i = 1, l = patterns.length; i < l; i++) {
    let addPattern = 0;
    let p2;
    for (let j = 0, lj = diffPatterns.length; j < lj; j++) {
      const p1 = diffPatterns[j];
      p2 = patterns[i];
      const sp1 = p1.stop_points.map((p) => p.id.toLowerCase());
      const sp2 = p2.stop_points.map((p) => p.id.toLowerCase());
      if (
        sp1.join().includes(sp2.join()) ||
        sp1.join().includes(sp2.reverse().join()) ||
        (diffStopPoints.includes(p2.stop_points[0].id.toLowerCase()) &&
          diffStopPoints.includes(
            p2.stop_points[p2.stop_points.length - 1].id.toLowerCase(),
          ))
      ) {
        // console.log(p1.name, p2.name);
        // do nothing
      } else {
        ++addPattern;

        // Chop off the path, prevent overlapping with original path
        if (p1.stop_points[0].id === p2.stop_points[0].id) {
          for (let k = 0, lk = p1.stop_points.length; k < lk; k++) {
            if (
              p2.stop_points[k] &&
              p1.stop_points[k].id !== p2.stop_points[k].id
            ) {
              const { path_index } = p2.stop_points[k - 1];
              p2.stop_points = p2.stop_points.slice(k - 1);
              p2.path = p2.path.slice(path_index);
            }
          }
          if (!p2.path.length) addPattern--;
        }
      }
    }
    if (addPattern === diffPatterns.length) {
      // console.log(
      //   diffPatterns.map((p) => p.name),
      //   p2.name,
      // );
      diffPatterns.push(p2);
      diffStopPoints.push(...p2.stop_points.map((p) => p.id.toLowerCase()));
    }
  }
  // console.log({ long_name, diffPatterns });

  const lines = diffPatterns.map((p) => p.path.map((c) => c.reverse()));
  const props = {
    name: long_name.trim(),
    line_color: color2Name(color),
    network: brand2Network(brand),
    // Follow Mapbox
    mode: 'metro_rail',
  };
  const opts = {
    id: hash(live_line_code),
  };

  let l;
  // console.log({ long_name, c: lines.length });
  if (lines.length === 1) {
    l = lineString(chaikin(lines[0], 3), props, opts);
  } else {
    l = multiLineString(
      lines.map((l) => chaikin(l, 3)),
      props,
      opts,
    );
  }
  return truncate(
    simplify(l, { tolerance: 0.000005, highQuality: true, mutate: true }),
    { mutate: true },
  );
});

// console.log({ lines: lines.map((l) => l.properties) });

// EXITS
console.log('Generate Exits...');
const exits = exitsData.features
  .map((f) => {
    const {
      properties: { STN_NAME, STN_NO, EXIT_CODE },
      geometry,
    } = f;
    if (/^null/i.test(EXIT_CODE)) return;

    let codes = stationName2Codes(STN_NAME);
    if (!codes.length) {
      codes = STN_NO.split('/').map((s) => s.trim());
    }
    codes.sort(sortStationCodes);

    if (codes.includes('NS9') && /[a-z]/i.test(EXIT_CODE)) {
      // Deprecated in favor of 123s https://landtransportguru.net/woodlands-station/
      return;
    }

    const joinedCodes = codes.join('-');

    const props = {
      stop_type: 'entrance',
      network: 'entrance',
      name: EXIT_CODE.toUpperCase(),
      // Custom
      station_codes: joinedCodes,
    };
    const opts = {
      id: hash(STN_NAME + EXIT_CODE),
    };
    const truncGeometry = truncate(geometry, {
      coordinates: 2,
    });
    const e = feature(truncGeometry, props, opts);
    return e;
  })
  .filter(Boolean);

// STATION BUILDINGS
console.log('Generate Station Buildings...');
const exitsCollection = featureCollection(exits);
const stationsCollection = featureCollection(stations);
const buildings = stationData.features
  .map((f) => {
    const {
      properties: { Description },
      geometry,
    } = f;

    const centerPoint = centerOfMass(geometry);
    const nearPoint = nearestPoint(centerPoint, exitsCollection);
    const { distanceToPoint } = nearPoint.properties;

    if (distanceToPoint < 0.2) {
      // kilometer

      const nearStation = nearestPoint(centerPoint, stationsCollection);

      const name = Description.match(
        /(NAME|INC_CRC)<\/th>\s+<td>([^<>]*)<\/td/i,
      )[2].toLowerCase();
      // console.log({ name, distanceToPoint });

      const groundLevel = Description.match(
        />((under|above)ground)</i,
      )[1].toLowerCase();
      const isAboveGround = groundLevel === 'aboveground';

      const props = {
        station_codes: nearStation.properties.station_codes,
        underground: !isAboveGround,
        type: 'subway',
      };
      const opts = {
        id: hash(name),
      };
      const truncGeometry = truncate(geometry, {
        precision: 8,
        coordinates: 2,
      });
      const b = rewind(feature(truncGeometry, props, opts));
      return b;
    } else {
      // console.log({ Name, distanceToPoint });
      return null;
    }
  })
  .filter(Boolean);

const geoJSON = featureCollection([
  ...stations,
  ...exits,
  ...lines,
  ...buildings,
]);

writeFile('data/v1/sg-rail.geojson', geoJSON);
console.log('Stations count', stationCodes.length);
writeFile('data/raw/sg-station-codes.txt', stationCodes.join(' '));
