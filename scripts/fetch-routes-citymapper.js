const { fetch, writeFile } = require('../utils');

fetch('https://citymapper.com/api/2/routeinfo', {
  searchParams: {
    route_ids: [
      'SingaporeMRTCircleLine',
      'SingaporeMRTDowntownLine',
      'SingaporeMRTEastwestLine',
      'SingaporeMRTNortheastLine',
      'SingaporeMRTNorthsouthLine',
      'CM_SingaporeMRT_tel',
      'SingaporeLRTBukitPanjangLine',
      'SingaporeLRTPunggolLineEastLoop',
      'SingaporeLRTPunggolLineWestLoop',
      'SingaporeLRTSengkangLineEastLoop',
      'SingaporeLRTSengkangLineWestLoop',
    ].join(','),
    region_id: 'sg-singapore',
    weekend: 1,
    status_format: 'rich',
  },
}).then((res) => {
  const { body } = res;
  writeFile('data/raw/routes.citymapper.json', body);
});
