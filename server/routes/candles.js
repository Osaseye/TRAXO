require('../registerTs')();

const mod = require('../src/routes/candles.ts');
module.exports = mod.default || mod;
