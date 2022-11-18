const { fetch, writeFile } = require('../utils');

fetch('https://citymapper.com/api/1/routeinfo', {
  searchParams: {
    route: 'mrt-te',
    region_id: 'sg-singapore',
    weekend: 1,
    status_format: 'rich',
    extended: 1,
  },
}).then((res) => {
  const { body } = res;
  const { stops } = body;
  // extract all keys into an array
  const stopIDs = Object.keys(stops);
  console.log(stopIDs.length, stopIDs);

  fetch('https://citymapper.com/api/3/stopinfo', {
    searchParams: {
      ids: stopIDs.join(','),
      region_id: 'sg-singapore',
    },
  }).then((res) => {
    const { body } = res;
    const { stops } = body;
    // construct stop to exits hash
    const stopNameToExits = {};
    stops.forEach((stop) => {
      const { name, exits } = stop;
      stopNameToExits[name] = exits;
    });
    console.log(stopNameToExits);
    writeFile('data/raw/tel-exits.citymapper.json', stopNameToExits);
  });
});
