const { fetch, writeFile } = require('../utils');
const nearestPointOnLine = require('@turf/nearest-point-on-line').default;
const { lineString, point } = require('@turf/helpers');
const pointToLineDistance = require('@turf/point-to-line-distance').default;
const lineSlice = require('@turf/line-slice');

const extractLine = (body) => {
  const { elements } = body;
  const line = elements
    .map((element) => {
      if (
        element.type === 'way' &&
        (element.tags?.construction !== 'subway' ||
          element.tags?.railway !== 'construction')
      ) {
        if (element.id === 544673198) return; // skip this line
        const nodes = element.nodes.map((node) => {
          const fullNode = elements.find((n) => n.id === node);
          return [fullNode.lon, fullNode.lat];
        });
        return nodes;
      }
    })
    .filter(Boolean);
  return line;
};

fetch('https://www.openstreetmap.org/api/0.6/relation/2313458/full.json').then(
  (res) => {
    const { body } = res;
    const line = extractLine(body);
    writeFile('data/raw/dtl-way.json', line);
  },
);
