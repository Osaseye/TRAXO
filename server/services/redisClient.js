require('../registerTs')();

const mod = require('../src/modules/market-data/redisClient.ts');
module.exports = mod.default || mod.redis || mod;
