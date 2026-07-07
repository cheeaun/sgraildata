#!/usr/bin/env node
// Diff data/v1/sg-rail.geojson between committed (HEAD) and working tree.
// Usage: node scripts/diff-geojson.js [--path=relative/path/to/geojson]

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const fileArg =
  process.argv
    .find((a) => a.startsWith('--path='))
    ?.split('=')[1] || 'data/v1/sg-rail.geojson';

const NO_COLOR = !process.stdout.isTTY;
const c = {
  reset: NO_COLOR ? '' : '\x1b[0m',
  bold: NO_COLOR ? '' : '\x1b[1m',
  dim: NO_COLOR ? '' : '\x1b[2m',
  green: NO_COLOR ? '' : '\x1b[32m',
  red: NO_COLOR ? '' : '\x1b[31m',
  yellow: NO_COLOR ? '' : '\x1b[33m',
  cyan: NO_COLOR ? '' : '\x1b[36m',
  white: NO_COLOR ? '' : '\x1b[37m',
  gray: NO_COLOR ? '' : '\x1b[90m',
};

const W = 56;
const HL = '─'.repeat(W);

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readGitHEAD(p) {
  const opts = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
  const strategies = [
    () => execSync(`git show HEAD:${p}`, opts),
    () => execSync(`git show "HEAD:${p}"`, opts),
  ];
  let lastErr;
  for (const run of strategies) {
    try {
      return JSON.parse(run());
    } catch (e) {
      lastErr = e;
    }
  }
  console.error(`Could not read HEAD version of ${p}:`);
  console.error(lastErr?.message || lastErr);
  process.exit(1);
}

const absPath = path.resolve(fileArg);
if (!fs.existsSync(absPath)) {
  console.error(`File not found: ${absPath}`);
  process.exit(1);
}

const before = readGitHEAD(fileArg);
const after = readJSON(absPath);

// ── helpers ──────────────────────────────────────────

function boxTop(title) {
  const label = ` ${title} `;
  const pad = W - label.length - 1;
  return `${c.cyan}┌─${label}${'─'.repeat(Math.max(0, pad))}┐${c.reset}`;
}

function boxSep() {
  return `${c.cyan}├${HL}┤${c.reset}`;
}

function boxBot() {
  return `${c.cyan}└${HL}┘${c.reset}`;
}

function boxLine(text) {
  const raw = text.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = W - raw.length;
  return `${c.cyan}│${c.reset} ${text}${' '.repeat(Math.max(0, pad - 1))}${c.cyan}│${c.reset}`;
}

function delta(n) {
  if (n === 0) return `${c.dim}0${c.reset}`;
  const s = n > 0 ? `+${n}` : `${n}`;
  return n > 0 ? `${c.green}${s}${c.reset}` : `${c.red}${s}${c.reset}`;
}

function deltaStr(before, after) {
  const d = after - before;
  return `${String(before).padStart(4)} → ${String(after).padStart(4)}  (${delta(d)})`;
}

function category(props) {
  if (props?.stop_type === 'station') return 'stations';
  if (props?.stop_type === 'entrance') return 'exits';
  if (props?.type === 'subway') return 'buildings';
  if (props?.line_color) return 'lines';
  return 'other';
}

function summarize(geo) {
  const out = {
    total: geo.features.length,
    byCat: {},
    byStationCode: {},
  };
  for (const f of geo.features) {
    const cat = category(f.properties);
    out.byCat[cat] = (out.byCat[cat] || 0) + 1;
    const code = f.properties?.station_codes || '-';
    out.byStationCode[code] = out.byStationCode[code] || {
      stations: 0,
      exits: 0,
      buildings: 0,
      lines: 0,
    };
    out.byStationCode[code][cat] = (out.byStationCode[code][cat] || 0) + 1;
  }
  return out;
}

function propsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildCodeNameMap(geo) {
  const map = {};
  for (const f of geo.features) {
    if (category(f.properties) === 'stations' && f.properties.station_codes) {
      map[f.properties.station_codes] = f.properties.name;
    }
  }
  return map;
}

function codeToLabel(code, nameMap) {
  const name = nameMap[code];
  return name ? `${c.bold}${name}${c.reset} ${c.dim}(${code})${c.reset}` : `${c.bold}${code}${c.reset}`;
}

// ── data ─────────────────────────────────────────────

const codeNameBefore = buildCodeNameMap(before);
const codeNameAfter = buildCodeNameMap(after);
const codeName = { ...codeNameBefore, ...codeNameAfter };

const a = summarize(before);
const b = summarize(after);

// ── output ───────────────────────────────────────────

console.log('');
console.log(boxTop(`${fileArg}`));
console.log(boxLine(`${c.dim}HEAD vs working tree${c.reset}`));
console.log(boxBot());
console.log('');

// ── Summary ──────────────────────────────────────────

console.log(boxTop('Summary'));
console.log(boxLine(`Total      ${deltaStr(a.total, b.total)}`));
console.log(boxSep());
for (const cat of ['stations', 'exits', 'buildings', 'lines', 'other']) {
  const beforeN = a.byCat[cat] || 0;
  const afterN = b.byCat[cat] || 0;
  if (beforeN === afterN && beforeN === 0) continue;
  const label = cat.charAt(0).toUpperCase() + cat.slice(1);
  console.log(boxLine(`${label.padEnd(11)}${deltaStr(beforeN, afterN)}`));
}
console.log(boxBot());

// ── Buildings ────────────────────────────────────────

const buildingsBefore = new Map();
const buildingsAfter = new Map();
for (const f of before.features) {
  if (category(f.properties) === 'buildings') buildingsBefore.set(String(f.id), f);
}
for (const f of after.features) {
  if (category(f.properties) === 'buildings') buildingsAfter.set(String(f.id), f);
}

const addedById = [...buildingsAfter.entries()].filter(([id]) => !buildingsBefore.has(id));
const removedById = [...buildingsBefore.entries()].filter(([id]) => !buildingsAfter.has(id));
const keptById = [...buildingsAfter.entries()].filter(([id]) => buildingsBefore.has(id));

const changedById = keptById.filter(([id, f]) => {
  const prev = buildingsBefore.get(id);
  return !propsEqual(prev.properties, f.properties) ||
    JSON.stringify(prev.geometry) !== JSON.stringify(f.geometry);
});

// Match removed/added by station_codes (ID changed but same logical building)
const removedByCode = new Map();
for (const [id, f] of removedById) {
  const code = f.properties.station_codes;
  if (code) removedByCode.set(code, { id, f });
}
const idChangedBuildings = [];
const addedBuildings = [];
const removedBuildings = [];

for (const [id, f] of addedById) {
  const code = f.properties.station_codes;
  const match = code && removedByCode.get(code);
  if (match) {
    removedByCode.delete(code);
    idChangedBuildings.push({ oldId: match.id, newId: id, prev: match.f, next: f });
  } else {
    addedBuildings.push([id, f]);
  }
}
for (const [code, entry] of removedByCode) {
  removedBuildings.push([entry.id, entry.f]);
}

const allChanged = [...changedById.map(([id, f]) => ({ id, prev: buildingsBefore.get(id), next: f })),
  ...idChangedBuildings];

console.log('');
console.log(boxTop(`Buildings  ${c.green}+${addedBuildings.length}${c.reset}  ${c.red}-${removedBuildings.length}${c.reset}  ${c.yellow}~${allChanged.length}${c.reset}`));
console.log(boxSep());

if (addedBuildings.length) {
  console.log(boxLine(`${c.green}▸ Added${c.reset}`));
  for (const [, f] of addedBuildings) {
    console.log(boxLine(`  ${c.green}●${c.reset} ${codeToLabel(f.properties.station_codes, codeName)}${f.properties.underground ? `  ${c.dim}underground${c.reset}` : ''}`));
  }
}
if (removedBuildings.length) {
  if (addedBuildings.length) console.log(boxLine(''));
  console.log(boxLine(`${c.red}▸ Removed${c.reset}`));
  for (const [, f] of removedBuildings) {
    console.log(boxLine(`  ${c.red}○${c.reset} ${codeToLabel(f.properties.station_codes, codeName)}${f.properties.underground ? `  ${c.dim}underground${c.reset}` : ''}`));
  }
}
if (allChanged.length) {
  if (addedBuildings.length || removedBuildings.length) console.log(boxLine(''));
  console.log(boxLine(`${c.yellow}▸ Changed${c.reset}`));
  for (const entry of allChanged) {
    const { prev, next } = entry;
    console.log(boxLine(`  ${c.yellow}◆${c.reset} ${codeToLabel(next.properties.station_codes, codeName)}`));
    if (!propsEqual(prev.properties, next.properties)) {
      const keys = new Set([...Object.keys(prev.properties), ...Object.keys(next.properties)]);
      for (const k of keys) {
        if (JSON.stringify(prev.properties[k]) !== JSON.stringify(next.properties[k])) {
          const pv = JSON.stringify(prev.properties[k]);
          const nv = JSON.stringify(next.properties[k]);
          console.log(boxLine(`    ${c.dim}${k}:${c.reset} ${pv} → ${nv}`));
        }
      }
    }
    if (JSON.stringify(prev.geometry) !== JSON.stringify(next.geometry)) {
      console.log(boxLine(`    ${c.dim}geometry:${c.reset} modified`));
    }
  }
}

// Per-station building count changes
const codes = new Set([
  ...Object.keys(a.byStationCode),
  ...Object.keys(b.byStationCode),
]);
const codeRows = [];
for (const code of codes) {
  const ab = a.byStationCode[code]?.buildings || 0;
  const bb = b.byStationCode[code]?.buildings || 0;
  if (ab !== bb) {
    codeRows.push({ code, before: ab, after: bb });
  }
}
codeRows.sort((x, y) => y.after - y.after);

if (codeRows.length) {
  console.log(boxSep());
  console.log(boxLine(`${c.dim}Per-station changes${c.reset}`));
  const maxNameLen = Math.max(...codeRows.map(({ code }) => codeToLabel(code, codeName).replace(/\x1b\[[0-9;]*m/g, '').length));
  for (const { code, before: bv, after: av } of codeRows) {
    const label = codeToLabel(code, codeName);
    const visibleLen = label.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padded = label + ' '.repeat(maxNameLen - visibleLen + 2);
    const d = av - bv;
    const sign = d > 0 ? '+' : '';
    console.log(boxLine(`  ${padded}${bv} → ${av}  (${delta(d)})`));
  }
}
console.log(boxBot());

// ── Stations / Exits / Lines ─────────────────────────

const cats = ['stations', 'exits', 'lines'];
const catIcons = { stations: '⬢', exits: '◯', lines: '━' };
const catColors = { stations: c.cyan, exits: c.green, lines: c.yellow };

const catResults = [];
for (const cat of cats) {
  const beforeSet = new Map(
    before.features
      .filter((f) => category(f.properties) === cat)
      .map((f) => [String(f.id), f]),
  );
  const afterSet = new Map(
    after.features
      .filter((f) => category(f.properties) === cat)
      .map((f) => [String(f.id), f]),
  );
  const added = [...afterSet.entries()].filter(([id]) => !beforeSet.has(id));
  const removed = [...beforeSet.entries()].filter(([id]) => !afterSet.has(id));
  if (!added.length && !removed.length) continue;
  catResults.push({ cat, added, removed });
}

if (catResults.length) {
  console.log('');
  console.log(boxTop('Stations / Exits / Lines'));

  for (let i = 0; i < catResults.length; i++) {
    const { cat, added, removed } = catResults[i];
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    console.log(boxLine(`${catColors[cat]}${catIcons[cat]} ${label}  ${c.green}+${added.length}${c.reset} ${c.red}-${removed.length}${c.reset}${c.reset}`));

    if (cat === 'exits') {
      const addedByStation = {};
      const removedByStation = {};
      for (const [, f] of added) {
        const code = f.properties.station_codes || '?';
        if (!addedByStation[code]) addedByStation[code] = [];
        addedByStation[code].push(f.properties.name || '?');
      }
      for (const [, f] of removed) {
        const code = f.properties.station_codes || '?';
        if (!removedByStation[code]) removedByStation[code] = [];
        removedByStation[code].push(f.properties.name || '?');
      }
      const allCodes = new Set([...Object.keys(addedByStation), ...Object.keys(removedByStation)]);
      const maxNameLen = Math.max(...[...allCodes].map((code) => codeToLabel(code, codeName).replace(/\x1b\[[0-9;]*m/g, '').length));
      for (const code of allCodes) {
        const label = codeToLabel(code, codeName);
        const visibleLen = label.replace(/\x1b\[[0-9;]*m/g, '').length;
        const padded = label + ' '.repeat(maxNameLen - visibleLen + 2);
        const addedExits = addedByStation[code] || [];
        const removedExits = removedByStation[code] || [];
        const parts = [];
        if (addedExits.length) parts.push(`${c.green}${addedExits.length} added (${addedExits.join(', ')})${c.reset}`);
        if (removedExits.length) parts.push(`${c.red}${removedExits.length} removed (${removedExits.join(', ')})${c.reset}`);
        console.log(boxLine(`    ${padded}${parts.join('  ')}`));
      }
    } else {
      for (const [, f] of added) {
        console.log(boxLine(`    ${c.green}+${c.reset} ${codeToLabel(f.properties.station_codes, codeName)}`));
      }
      for (const [, f] of removed) {
        console.log(boxLine(`    ${c.red}-${c.reset} ${codeToLabel(f.properties.station_codes, codeName)}`));
      }
    }
    if (i < catResults.length - 1) console.log(boxSep());
  }

  console.log(boxBot());
}

// ── Missing Chinese / Tamil names ─────────────────────

const missingNames = [];
for (const f of after.features) {
  if (category(f.properties) === 'stations') {
    const missing = [];
    if (!f.properties['name_zh-Hans']) missing.push('name_zh-Hans');
    if (!f.properties.name_ta) missing.push('name_ta');
    if (missing.length) {
      missingNames.push({ code: f.properties.station_codes, name: f.properties.name, missing });
    }
  }
}

if (missingNames.length) {
  console.log('');
  console.log(boxTop(`Missing names  ${c.yellow}${missingNames.length} stations${c.reset}`));
  console.log(boxSep());
  missingNames.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  for (const { code, name, missing } of missingNames) {
    const label = codeToLabel(code, codeName);
    const tags = missing.map((m) => `${c.red}${m}${c.reset}`).join(', ');
    console.log(boxLine(`  ${label}  ${tags}`));
  }
  console.log(boxBot());
}

console.log('');
