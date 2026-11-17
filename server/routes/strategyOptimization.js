require('../registerTs')();

const mod = require('../src/routes/strategyOptimization.ts');
module.exports = mod.default || mod;
