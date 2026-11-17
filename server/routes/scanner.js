require('../registerTs')();

const mod = require('../src/routes/scanner.ts');
module.exports = mod.default || mod;
