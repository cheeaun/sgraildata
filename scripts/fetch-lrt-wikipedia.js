const { fetch, writeFile } = require('../utils');
const cheerio = require('cheerio');

const data = [];

fetch('https://en.m.wikipedia.org/wiki/List_of_Singapore_LRT_stations', {
  responseType: 'text',
}).then((res) => {
  const $ = cheerio.load(res.body);
  const $td1s = $('#mf-section-1 .wikitable tr td:first-child');

  $td1s.each((i, tdFirst) => {
    const $tdFirst = $(tdFirst);
    if ($tdFirst.attr('colspan')) return;
    const $codes = $tdFirst.find('b');

    // Only care about current stations, not future ones
    // If first column is empty, means it's a future station
    if ($codes.length) {
      const codes = $codes
        .map((i, el) => $(el).text().trim())
        .get()
        .sort();

      let $td1 = $tdFirst.next('td');
      if ($td1.attr('rowspan')) {
        $td1 = $td1.next('td');
      }

      const $a = $td1.find('a');
      const url = $a.length ? $a.attr('href') : null;
      const title =
        $a.length && $a.attr('title') ? $a.attr('title').trim() : null;
      const name = $td1.text().trim();

      const $td2 = $td1.next('td');
      const name_zh_Hans = $td2.text().trim();

      const $td3 = $td2.next('td');
      const name_ta = $td3.text().trim();

      data.push({ codes, name, name_zh_Hans, name_ta, title, url });
    }
  });

  writeFile('./data/raw/wikipedia-lrt.json', data);
});
