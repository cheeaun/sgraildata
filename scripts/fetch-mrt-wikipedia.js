const { fetch, writeFile } = require('../utils');
const cheerio = require('cheerio');

const data = [];
const names = [];

function scrapeTable($, $table) {
  $table.find('tr').each((i, row) => {
    const $th = $(row).find('th').first();
    if (!$th.length) return;

    const $a = $th.find('a');
    const url = $a.length
      ? $a.attr('href').replace(/^\/\/en\.wikipedia\.org/, '')
      : null;
    const title =
      $a.length && $a.attr('title') ? $a.attr('title').trim() : null;
    const name = $a.length ? $a.text().trim() : $th.text().trim();

    if (!name || names.includes(name)) return;

    const $tds = $(row).find('td');
    if ($tds.length < 3) return;

    if ($(row).text().includes('TBA')) return;

    const $codeTd = $tds.eq(2);
    const $codes = $codeTd.find('b');
    if (!$codes.length) return;

    const codes = $codes.map((i, el) => $(el).text().trim()).get();

    const $td0 = $tds.eq(0);
    $td0.find('sup').remove();
    const name_zh_Hans = $td0.text().trim();

    const $td1 = $tds.eq(1);
    $td1.find('sup').remove();
    const name_ta = $td1.text().trim();

    data.push({ codes, name, name_zh_Hans, name_ta, title, url });
    names.push(name);
  });
}

const CCL6_STATIONS = ['Keppel', 'Cantonment', 'Prince Edward Road'];

fetch('https://en.wikipedia.org/wiki/List_of_Singapore_MRT_stations', {
  responseType: 'text',
}).then((res) => {
  const $ = cheerio.load(res.body);

  // Section 3 = "In operation"
  const $inOperation = $('[data-mw-section-id="3"]');
  scrapeTable($, $inOperation.find('table.wikitable').first());

  // Section 5 = "Under construction" — only include CCL6 stations
  const $underConstruction = $('[data-mw-section-id="5"]');
  $underConstruction
    .find('table.wikitable')
    .first()
    .find('tr')
    .each((i, row) => {
      const $th = $(row).find('th').first();
      if (!$th.length) return;
      const name = $th.find('a').length
        ? $th.find('a').text().trim()
        : $th.text().trim();
      if (!CCL6_STATIONS.includes(name)) return;

      const $a = $th.find('a');
      const url = $a.length
        ? $a.attr('href').replace(/^\/\/en\.wikipedia\.org/, '')
        : null;
      const title =
        $a.length && $a.attr('title') ? $a.attr('title').trim() : null;

      const $tds = $(row).find('td');
      if ($tds.length < 3) return;

      const $codeTd = $tds.eq(2);
      const $codes = $codeTd.find('b');
      if (!$codes.length) return;
      const codes = $codes.map((i, el) => $(el).text().trim()).get();

      const $td0 = $tds.eq(0);
      $td0.find('sup').remove();
      const name_zh_Hans = $td0.text().trim();

      const $td1 = $tds.eq(1);
      $td1.find('sup').remove();
      const name_ta = $td1.text().trim();

      data.push({ codes, name, name_zh_Hans, name_ta, title, url });
      names.push(name);
    });

  writeFile('./data/raw/wikipedia-mrt.json', data);
  console.log(`Fetched ${data.length} MRT stations from Wikipedia`);
});
