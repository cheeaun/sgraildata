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
const { rewind, simplify } = require('@turf/turf');
const namer = require('color-namer');
const { chaikin } = require('chaikin');

const routesData = readFile('./data/raw/routes.citymapper.json');
const codesData = readFile('./data/raw/MRTLRTStnPtt.json');
const wikipediaMRTData = readFile('./data/raw/wikipedia-mrt.json');
const wikipediaLRTData = readFile('./data/raw/wikipedia-lrt.json');
const stationData = readFile(
  './data/raw/master-plan-2019-rail-station-layer-geojson.geojson',
);
const exitsData = readFile('./data/raw/Train_Station_Exit_Layer.json');
const telExitsData = readFile('./data/raw/tel-exits.citymapper.json');
const telLine = readFile('./data/raw/tel-line.json');
const peLine = readFile('./data/raw/punggol-lrt-east-loop.json');
const dtlLine = readFile('./data/raw/dtl-way.json');

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

  let codes = [];
  const wikipedia = stationName2Wikipedia(cleanName);
  if (wikipedia) {
    codes = filterInvalidCodes(wikipedia.codes);
  } else {
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

    if (found.length) {
      if (found.length === 1) {
        codes = found[0].STN_NO.split('/').map((s) => s.trim());
      } else {
        codes = found
          .map((f) => f.STN_NO.split('/').map((s) => s.trim()))
          .flat() // Flatten
          .filter((item, index, arr) => arr.indexOf(item) === index); // Remove dups
      }
    }
  }

  codes.sort(sortStationCodes);
  if (!codes.length) {
    console.warn('NO CODES', name);
  }
  return codes;
}

const wikipediaData = [...wikipediaMRTData, ...wikipediaLRTData];
function stationCodes2Wikipedia(codes) {
  return wikipediaData.find((d) => {
    const lowerCodes = d.codes.map((c) => c.toLowerCase());
    return lowerCodes.includes(codes[0].toLowerCase());
  });
}

function stationName2Wikipedia(name) {
  return wikipediaData.find((d) => {
    const lowerName = d.name.toLowerCase().trim();
    return lowerName === name.toLowerCase().trim();
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
const validCodes = Object.keys(colorMap);

const filterInvalidCodes = (codes) => {
  return codes.filter((c) =>
    validCodes.includes(c.toUpperCase().replace(/\d+$/, '')),
  );
};

const { stops, routes } = routesData;

// STATIONS
console.log('Generate Stations...');
const stationCodes = [];
const stations = Object.values(stops)
  .map((s) => {
    const { name, coords, brands } = s;

    // const codes = stationName2Codes(name);
    // const wikipedia = stationCodes2Wikipedia(codes);
    const wikipedia = stationName2Wikipedia(name);
    if (!wikipedia) throw new Error(`No Wikipedia for ${name}`);
    const { codes: _codes, title, name_zh_Hans, name_ta, url } = wikipedia;
    const codes = filterInvalidCodes(_codes).sort(sortStationCodes);

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
  })
  .sort((a, b) => a.properties.name.localeCompare(b.properties.name));

stationCodes.sort((a, b) => a.localeCompare(b));

// LINES
console.log('Generate Lines...');
const lines = routes
  .map((r) => {
    const { live_line_code, color, brand, long_name, patterns } = r;

    // Always get longest one first
    patterns.sort((a, b) => b.stop_points.length - a.stop_points.length);
    const diffPatterns = [patterns[0]];
    const diffStopPoints = patterns[0].stop_points.map((p) =>
      p.id.toLowerCase(),
    );

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

    let lines = diffPatterns.map((p) => p.path.map((c) => c.reverse()));

    if (/thomson/i.test(long_name)) {
      // Special case for TEL
      lines = [telLine];
    } else if (/punggol lrt \(east/i.test(long_name)) {
      // Special case for PE
      lines = peLine;
    } else if (/downtown/i.test(long_name)) {
      // Special case for DTL
      lines = dtlLine;
    }

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
  })
  .sort((a, b) => a.properties.name.localeCompare(b.properties.name));

// console.log({ lines: lines.map((l) => l.properties) });

// EXITS
console.log('Generate Exits...');
const tel3Stations =
  /^(stevens|napier|orchard|great world|havelock|outram park|maxwell|shenton way|marina bay|gardens by the bay)/i;
const exitsList = exitsData.features
  .map((f) => {
    const {
      properties: { stn_name, exit_code: _exit_code },
      geometry,
    } = f;
    const exit_code = _exit_code.replace(/exit\s+?/i, '').toUpperCase();
    if (/^null/i.test(exit_code)) return;
    if (tel3Stations.test(stn_name)) return; // Skip TEL3 stations. Exits have become 123 instead of ABC

    let codes = stationName2Codes(stn_name);

    if (codes.includes('NS9') && /[a-z]/i.test(exit_code)) {
      // Deprecated in favor of 123s https://landtransportguru.net/woodlands-station/
      return;
    }

    const joinedCodes = codes.join('-');

    const props = {
      stop_type: 'entrance',
      network: 'entrance',
      name: exit_code,
      // Custom
      station_codes: joinedCodes,
    };
    const opts = {
      id: hash(stn_name + exit_code),
    };
    const truncGeometry = truncate(geometry, {
      coordinates: 2,
    });
    const e = feature(truncGeometry, props, opts);
    return e;
  })
  .filter(Boolean)
  .sort((a, b) =>
    a.properties.station_codes.localeCompare(b.properties.station_codes),
  );

const telExitsList = Object.entries(telExitsData)
  .map(([stationName, exits]) => {
    if (!tel3Stations.test(stationName)) return;
    const stn_name = stationName;
    return exits.map((exit) => {
      const { indicator, coords } = exit;
      const exit_code = indicator;
      const geometry = {
        type: 'Point',
        coordinates: coords.reverse(),
      };

      let codes = stationName2Codes(stn_name);

      const joinedCodes = codes.join('-');

      const props = {
        stop_type: 'entrance',
        network: 'entrance',
        name: exit_code.toUpperCase(),
        // Custom
        station_codes: joinedCodes,
      };
      const opts = {
        id: hash(stn_name + exit_code),
      };
      const truncGeometry = truncate(geometry, {
        coordinates: 2,
      });
      const e = feature(truncGeometry, props, opts);
      return e;
    });
  })
  .filter(Boolean)
  .flat()
  .sort((a, b) =>
    a.properties.station_codes.localeCompare(b.properties.station_codes),
  );
const exits = [...exitsList, ...telExitsList];

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
    // nearestPoint retuns value in km unit
    const nearPoint = nearestPoint(centerPoint, exitsCollection);
    const { distanceToPoint: distPoint2Exits } = nearPoint.properties;

    const nearStation = nearestPoint(centerPoint, stationsCollection);
    let nearestStation;

    if (distPoint2Exits < 0.2) {
      nearestStation = nearStation;
    } else {
      const { distanceToPoint: distPoint2Station } = nearStation.properties;
      if (distPoint2Station < 0.3) {
        nearestStation = nearStation;
      }
    }

    if (!nearestStation) return null;
    if (nearestStation.properties.station_codes === 'NS28') {
      // Exclude Marina South station
      return null;
    }

    const name = Description.match(
      /(NAME|INC_CRC)<\/th>\s+<td>([^<>]*)<\/td/i,
    )[2].toLowerCase();
    // console.log({ name, distanceToPoint });

    const groundLevel = Description.match(
      />((under|above)ground)</i,
    )[1].toLowerCase();
    const isAboveGround = groundLevel === 'aboveground';

    const props = {
      station_codes: nearestStation.properties.station_codes,
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
  })
  .filter(Boolean)
  .sort((a, b) =>
    a.properties.station_codes.localeCompare(b.properties.station_codes),
  );

const geoJSON = featureCollection([
  ...stations,
  ...exits,
  ...lines,
  ...buildings,
]);

writeFile('data/v1/sg-rail.geojson', geoJSON);
console.log('Stations count', stationCodes.length);
writeFile('data/raw/sg-station-codes.txt', stationCodes.join(' '));
