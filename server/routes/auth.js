require('../registerTs')();

const mod = require('../src/routes/auth.ts');
module.exports = {
  setupAuthRoutes: mod.setupAuthRoutes,
  authRouter: mod.authRouter || mod.default,
};
