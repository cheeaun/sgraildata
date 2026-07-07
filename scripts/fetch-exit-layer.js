const { open } = require('shapefile');
const proj4 = require('proj4');
const { writeFileSync, mkdirSync } = require('fs');
const { execSync } = require('child_process');
const { join } = require('path');

// SVY21 (EPSG:3414) → WGS84 (EPSG:4326)
proj4.defs(
  'EPSG:3414',
  '+proj=tmerc +lat_0=1.36666666666667 +lon_0=103.8333333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs'
);

const ZIP_URL =
  'https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/TrainStationExit.zip';
const TMP_DIR = '/tmp/lta-exit-layer';
const OUTPUT = 'data/raw/Train_Station_Exit_Layer.json';

async function fetchExitLayer() {
  // Download ZIP
  console.log('Downloading TrainStationExit.zip...');
  mkdirSync(TMP_DIR, { recursive: true });
  execSync(`curl -sL -o ${TMP_DIR}/TrainStationExit.zip "${ZIP_URL}"`);

  // Extract ZIP
  console.log('Extracting...');
  execSync(`unzip -o ${TMP_DIR}/TrainStationExit.zip -d ${TMP_DIR}`);

  // Find SHP and DBF files
  const shpFiles = execSync(`find ${TMP_DIR} -name "*.shp"`, { encoding: 'utf8' })
    .trim()
    .split('\n');
  const dbfFiles = execSync(`find ${TMP_DIR} -name "*.dbf"`, { encoding: 'utf8' })
    .trim()
    .split('\n');

  if (shpFiles.length === 0 || dbfFiles.length === 0) {
    throw new Error('SHP or DBF file not found');
  }

  const shpPath = shpFiles[0];
  const dbfPath = dbfFiles[0];
  console.log(`Reading: ${shpPath}`);

  // Convert SHP to GeoJSON with reprojection
  const features = [];
  const source = await open(shpPath, dbfPath);
  while (true) {
    const result = await source.read();
    if (result.done) break;
    const f = result.value;
    // Reproject from SVY21 to WGS84
    const [x, y] = f.geometry.coordinates;
    f.geometry.coordinates = proj4('EPSG:3414', 'EPSG:4326', [x, y]);
    features.push(f);
  }

  console.log(`Converted ${features.length} exit features`);

  const output = {
    type: 'FeatureCollection',
    name: 'MRT_EXITS',
    features,
  };

  writeFileSync(OUTPUT, JSON.stringify(output, null, '\t'));
  console.log(`Written to ${OUTPUT}`);
}

fetchExitLayer().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
