const got = require('got');

module.exports = (url, opts) => {
  return got(url, { responseType: 'json', ...opts });
};
