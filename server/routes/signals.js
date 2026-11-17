require('../registerTs')();

const mod = require('../src/routes/signals.ts');
module.exports = mod.default || mod;
