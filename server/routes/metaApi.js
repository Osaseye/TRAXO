require('../registerTs')();

const mod = require('../src/routes/metaApi.ts');
module.exports = mod.default || mod;
