require('../registerTs')();

const mod = require('../src/routes/tradingContext.ts');
module.exports = mod.default || mod;
