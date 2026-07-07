const { fetch, writeFile } = require('../utils');
const cheerio = require('cheerio');

const data = [];

fetch('https://en.wikipedia.org/wiki/List_of_Singapore_LRT_stations', {
  responseType: 'text',
}).then((res) => {
  const $ = cheerio.load(res.body);
  // Wikipedia changed section IDs from #mf-section-N to data-mw-section-id="N"
  const $section = $('[data-mw-section-id="1"]');
  const $table = $section.find('table.wikitable').first();
  const $rows = $table.find('tr');

  const names = [];
  $rows.each((i, row) => {
    const $cells = $(row).find('th, td');
    if ($cells.length < 4) return; // Skip header/sub-header rows

    // Station name is in first cell (could be th or td)
    const $nameCell = $cells.eq(0);
    const name = $nameCell.text().trim();
    if (!name || names.includes(name)) return;

    // Check for TBA in the row (future stations)
    if ($(row).text().includes('TBA')) return;

    // New structure: Cell 0=Name, 1=Chinese, 2=Tamil, 3=Code
    // But some rows have fewer cells due to rowspan
    const $codeCell = $cells.eq(3);
    const $codes = $codeCell.find('b');
    if (!$codes.length) return;

    const codes = $codes
      .map((i, el) => $(el).text().trim())
      .get()
      .sort();

    const $a = $nameCell.find('a');
    const url = $a.length ? $a.attr('href').replace(/^\/\/en\.wikipedia\.org/, '') : null;
    const title =
      $a.length && $a.attr('title') ? $a.attr('title').trim() : null;

    const $zhCell = $cells.eq(1);
    const name_zh_Hans = $zhCell.text().trim();

    const $taCell = $cells.eq(2);
    const name_ta = $taCell.text().trim();

    data.push({ codes, name, name_zh_Hans, name_ta, title, url });
    names.push(name);
  });

  writeFile('./data/raw/wikipedia-lrt.json', data);
  console.log(`Fetched ${data.length} LRT stations from Wikipedia`);
});
