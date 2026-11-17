const path = require('path');

function ensureTsNode() {
  if (!process.env.TS_NODE_PROJECT) {
    process.env.TS_NODE_PROJECT = path.join(__dirname, 'tsconfig.json');
  }
  if (!require.extensions['.ts']) {
    require('ts-node').register({
      project: process.env.TS_NODE_PROJECT,
      transpileOnly: true,
    });
  }
  require('tsconfig-paths/register');
}

module.exports = ensureTsNode;
