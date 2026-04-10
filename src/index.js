const logger = require('./utils/logger');
const webServer = require('./web/server');

logger.info('Starting Polymarket Trading Bot...');

// Start web dashboard
webServer;

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  process.exit(0);
});
