require('../registerTs')();

const mod = require('../src/routes/journal.ts');
module.exports = mod.default || mod;
