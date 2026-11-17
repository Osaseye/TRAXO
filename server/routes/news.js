require('../registerTs')();

const mod = require('../src/routes/news.ts');
module.exports = mod.default || mod;
