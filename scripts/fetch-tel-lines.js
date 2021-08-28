/* 
Woodlands North to Woodlands South: https://www.openstreetmap.org/api/0.6/way/768424509/full.json
Woodlands South to Tanjong Rhu: https://www.openstreetmap.org/api/0.6/way/762783366/full.json
*/

const { fetch, writeFile } = require('../utils');
const nearestPointOnLine = require('@turf/nearest-point-on-line').default;
const { lineString, point } = require('@turf/helpers');
const lineSlice = require('@turf/line-slice');

const extractLine = (body) => {
  let way;
  let nodes = [];
  body.elements.forEach((element) => {
    if (element.type === 'way') {
      way = element;
    } else if (element.type === 'node') {
      nodes.push(element);
    }
  });

  const line = [];
  way.nodes.forEach((node) => {
    const fullNode = nodes.find((n) => n.id === node);
    if (fullNode) {
      line.push([fullNode.lon, fullNode.lat]);
    }
  });
  return line;
};

const caldecottPoint = [103.839991, 1.33768];

fetch('https://www.openstreetmap.org/api/0.6/way/768424509/full.json').then(
  (res) => {
    const { body } = res;
    const line1 = extractLine(body);
    writeFile('data/raw/osm-way-768424509.json', body);

    fetch('https://www.openstreetmap.org/api/0.6/way/762783366/full.json').then(
      (res) => {
        const { body } = res;
        const line2 = extractLine(body);
        writeFile('data/raw/osm-way-762783366.json', body);

        const startPoint = point(line1[0]);
        const snappedPoint = nearestPointOnLine(
          lineString(line2),
          point(caldecottPoint),
        );
        const alteredLine2 = lineSlice(
          startPoint,
          snappedPoint,
          lineString(line2),
        ).geometry.coordinates;

        const lines = [...line1, ...alteredLine2];
        writeFile('data/raw/tel-line.json', lines);
      },
    );
  },
);
