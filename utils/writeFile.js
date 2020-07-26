const fs = require('fs');

module.exports = (fileName, data) => {
  fs.writeFileSync(fileName, JSON.stringify(data, null, '\t'));
  console.log(`File written: ${fileName}`);
};
