require('../registerTs')();

const mod = require('../src/routes/globalSignals.ts');
module.exports = mod.default || mod;
