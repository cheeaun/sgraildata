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

const tel1Way = 768424508;
const woodlandsNorthPoint = [103.785519, 1.448646];
const tel2Way = 977168499;
const gardensByTheBayPoint = [103.868124, 1.279451];
// const caldecottPoint = [103.839991, 1.33768];

fetch(`https://www.openstreetmap.org/api/0.6/way/${tel1Way}/full.json`).then(
  (res) => {
    const { body } = res;
    const line1 = extractLine(body);
    writeFile(`data/raw/tel1-way.json`, body);

    const startPoint1 = nearestPointOnLine(
      lineString(line1),
      point(woodlandsNorthPoint),
    );
    const endPoint1 = line1[line1.length - 1];
    const alteredLine1 = lineSlice(startPoint1, endPoint1, lineString(line1))
      .geometry.coordinates;

    fetch(
      `https://www.openstreetmap.org/api/0.6/way/${tel2Way}/full.json`,
    ).then((res) => {
      const { body } = res;
      const line2 = extractLine(body);
      writeFile(`data/raw/tel2-way.json`, body);

      const startPoint2 = line2[0];
      const endPoint2 = nearestPointOnLine(
        lineString(line2),
        point(gardensByTheBayPoint),
      );
      const alteredLine2 = lineSlice(startPoint2, endPoint2, lineString(line2))
        .geometry.coordinates;

      // const lines = [...line1, ...line2];
      const lines = [...alteredLine1, ...alteredLine2];
      writeFile('data/raw/tel-line.json', lines);
    });
  },
);
