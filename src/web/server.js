const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const basicAuth = require('express-basic-auth');
const config = require('../config');
const BitcoinStrategy = require('../strategies/bitcoinStrategy');
const CopyTrader = require('../strategies/copyTrader');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Basic auth
app.use(basicAuth({
  users: { [config.web.username]: config.web.password },
  challenge: true,
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize strategies
const btcStrategy = new BitcoinStrategy();
const copyTrader = new CopyTrader();

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    btcStrategy: btcStrategy.getStatus(),
    copyTrader: copyTrader.getStatus(),
    balance: { usdc: 1000 }, // Placeholder
  });
});

app.get('/api/settings/btc', (req, res) => {
  res.json(btcStrategy.settings);
});

app.post('/api/settings/btc', (req, res) => {
  btcStrategy.setSettings(req.body);
  res.json({ success: true });
});

app.get('/api/settings/copy', (req, res) => {
  res.json(copyTrader.settings);
});

app.post('/api/settings/copy', (req, res) => {
  copyTrader.setSettings(req.body);
  res.json({ success: true });
});

app.post('/api/btc/start', (req, res) => {
  btcStrategy.start();
  res.json({ success: true });
});

app.post('/api/btc/stop', (req, res) => {
  btcStrategy.stop();
  res.json({ success: true });
});

app.post('/api/btc/mode', (req, res) => {
  btcStrategy.setMode(req.body.mode);
  res.json({ success: true });
});

app.post('/api/copy/start', (req, res) => {
  copyTrader.start();
  res.json({ success: true });
});

app.post('/api/copy/stop', (req, res) => {
  copyTrader.stop();
  res.json({ success: true });
});

app.post('/api/copy/mode', (req, res) => {
  copyTrader.setMode(req.body.mode);
  res.json({ success: true });
});

// WebSocket for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected');
  
  // Send initial status
  socket.emit('status', {
    btcStrategy: btcStrategy.getStatus(),
    copyTrader: copyTrader.getStatus(),
  });
  
  // Listen to strategy events
  btcStrategy.on('tradeExecuted', (trade) => {
    socket.emit('tradeExecuted', { strategy: 'btc', trade });
  });
  
  btcStrategy.on('tradeClosed', (trade) => {
    socket.emit('tradeClosed', { strategy: 'btc', trade });
  });
  
  btcStrategy.on('settingsChanged', (settings) => {
    socket.emit('settingsChanged', { strategy: 'btc', settings });
  });
  
  copyTrader.on('tradeCopied', (trade) => {
    socket.emit('tradeExecuted', { strategy: 'copy', trade });
  });
  
  copyTrader.on('settingsChanged', (settings) => {
    socket.emit('settingsChanged', { strategy: 'copy', settings });
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const PORT = config.web.port;
server.listen(PORT, () => {
  console.log(`Web dashboard running on http://localhost:${PORT}`);
  console.log(`Username: ${config.web.username}`);
  console.log(`Password: ${config.web.password}`);
});

module.exports = { app, io, btcStrategy, copyTrader };
