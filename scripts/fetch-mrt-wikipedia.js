const { fetch, writeFile } = require('../utils');
const cheerio = require('cheerio');

const data = [];

fetch('https://en.m.wikipedia.org/wiki/List_of_Singapore_MRT_stations', {
  responseType: 'text',
}).then((res) => {
  const $ = cheerio.load(res.body);
  const $td1s = $('#mf-section-2 .wikitable tr td:nth-child(2)');

  const names = [];
  $td1s
    .each((i, td1) => {
      const $td1 = $(td1);
      const $a = $td1.find('a');
      const url = $a.length ? $a.attr('href') : null;
      const title =
        $a.length && $a.attr('title') ? $a.attr('title').trim() : null;
      const name = $td1.find('a').text().trim() || $td1.text().trim();

      if (names.includes(name)) return null;

      const $tdFirst = $td1.prev('td');
      const $codes = $tdFirst.find('b');

      // Only care about current stations, not future ones
      // If first column is empty, means it's a future station
      if ($codes.length) {
        const codes = $codes.map((i, el) => $(el).text().trim()).get();

        const $td2 = $td1.next('td');
        $td2.find('sup').remove();
        const name_zh_Hans = $td2.text().trim();

        const $td3 = $td2.next('td');
        $td3.find('sup').remove();
        const name_ta = $td3.text().trim();

        data.push({ codes, name, name_zh_Hans, name_ta, title, url });
        names.push(name);
      }
    })
    .filter(Boolean);

  writeFile('./data/raw/wikipedia-mrt.json', data);
});
