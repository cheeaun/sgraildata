const { fetch, writeFile } = require('../utils');

fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  body: `
    [out:json][timeout:25];
    (
      relation(9663919);
    );
    out body;
    >;
    out skel qt;
  `,
}).then((res) => {
  const { body } = res;
  // get all nodes from the ways
  const nodes = body.elements.filter((element) => element.type === 'node');
  const ways = body.elements.filter((e) => e.type === 'way');
  const lines = ways.map((way) => {
    // return lat, lon from nodes
    return way.nodes.map((node) => {
      const fullNode = nodes.find((n) => n.id === node);
      return [fullNode.lon, fullNode.lat];
    });
  });
  writeFile('data/raw/punggol-lrt-east-loop.json', lines);
});
