require('dotenv').config();

module.exports = {
  wallet: {
    privateKey: process.env.PRIVATE_KEY,
    proxyWallet: process.env.PROXY_WALLET_ADDRESS,
  },
  rpc: {
    polygon: process.env.POLYGON_RPC_URL || 'https://polygon.lava.build',
  },
  polymarket: {
    apiKey: process.env.CLOB_API_KEY,
    apiSecret: process.env.CLOB_API_SECRET,
    apiPassphrase: process.env.CLOB_API_PASSPHRASE,
  },
  proxy: {
    url: process.env.PROXY_URL,
  },
  trading: {
    dryRun: process.env.DRY_RUN === 'true',
  },
  web: {
    port: parseInt(process.env.WEB_PORT) || 3000,
    username: process.env.WEB_USERNAME,
    password: process.env.WEB_PASSWORD,
  },
  markets: {
    '5m': {
      slug: 'bitcoin-up-or-down-5-minutes',
      duration: 5 * 60 * 1000,
    },
    '15m': {
      slug: 'bitcoin-up-or-down-15-minutes',
      duration: 15 * 60 * 1000,
    },
  },
};
