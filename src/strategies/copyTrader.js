const EventEmitter = require('events');
const logger = require('../utils/logger');
const polymarketClient = require('../polymarket/client');

class CopyTrader extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.mode = 'simulation';
    this.settings = {
      targetAddress: '',
      sizeMode: 'balance', // 'percentage' or 'balance'
      sizePercent: 10,
      minTradeSize: 1,
      maxPositionSize: 100,
      autoSellEnabled: true,
      autoSellProfitPercent: 10,
      sellMode: 'market', // 'market' or 'limit'
    };
    this.copiedTrades = [];
    this.pollInterval = null;
  }

  setSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.emit('settingsChanged', this.settings);
    logger.info('Copy trader settings updated:', this.settings);
  }

  setMode(mode) {
    this.mode = mode;
    this.emit('modeChanged', mode);
    logger.info(`Copy trader mode set to: ${mode}`);
  }

  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    logger.info(`Starting copy trader (${this.mode} mode)`);
    
    if (this.mode === 'live') {
      await polymarketClient.initialize();
    }
    
    this.pollInterval = setInterval(() => this.checkTargetTrades(), 10000);
    this.emit('started');
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    logger.info('Copy trader stopped');
    this.emit('stopped');
  }

  async checkTargetTrades() {
    if (!this.settings.targetAddress) {
      return;
    }
    
    try {
      const trades = await this.getTraderTrades(this.settings.targetAddress);
      
      for (const trade of trades) {
        const alreadyCopied = this.copiedTrades.some(t => t.originalId === trade.id);
        if (!alreadyCopied && trade.timestamp > Date.now() - 60000) {
          await this.copyTrade(trade);
        }
      }
    } catch (error) {
      logger.error('Error checking target trades:', error);
    }
  }

  async getTraderTrades(address) {
    try {
      const response = await fetch(
        `https://data-api.polymarket.com/trades?address=${address}&limit=50`
      );
      const data = await response.json();
      return data.map(t => ({
        id: t.id,
        marketId: t.marketId,
        side: t.side,
        price: parseFloat(t.price),
        size: parseFloat(t.size),
        timestamp: new Date(t.timestamp).getTime(),
      }));
    } catch (error) {
      logger.error('Failed to fetch trader trades:', error);
      return [];
    }
  }

  async copyTrade(originalTrade) {
    let tradeSize = this.calculateTradeSize(originalTrade);
    
    if (tradeSize < this.settings.minTradeSize) {
      logger.info(`Trade size ${tradeSize} below minimum, skipping`);
      return;
    }
    
    const copiedTrade = {
      id: Date.now(),
      originalId: originalTrade.id,
      marketId: originalTrade.marketId,
      side: originalTrade.side,
      entryPrice: originalTrade.price,
      shares: tradeSize / originalTrade.price,
      size: tradeSize,
      timestamp: Date.now(),
      originalSize: originalTrade.size,
    };
    
    if (this.mode === 'live') {
      const order = {
        market: originalTrade.marketId,
        side: originalTrade.side,
        price: originalTrade.price,
        size: copiedTrade.shares,
      };
      
      const result = await polymarketClient.placeOrder(order);
      if (!result.success) {
        logger.error('Failed to copy trade:', result.error);
        return;
      }
      
      copiedTrade.orderId = result.orderId;
    }
    
    this.copiedTrades.push(copiedTrade);
    this.emit('tradeCopied', copiedTrade);
    logger.info(`Trade copied: ${originalTrade.side} ${copiedTrade.shares} shares at $${originalTrade.price}`);
    
    if (this.settings.autoSellEnabled) {
      this.setupAutoSell(copiedTrade);
    }
  }

  calculateTradeSize(originalTrade) {
    if (this.settings.sizeMode === 'percentage') {
      // Percentage of max position size
      return (this.settings.sizePercent / 100) * this.settings.maxPositionSize;
    } else {
      // Percentage of current balance
      const balance = this.getCurrentBalance();
      return (this.settings.sizePercent / 100) * balance;
    }
  }

  getCurrentBalance() {
    // Get USDC balance from wallet
    return 1000; // Placeholder
  }

  setupAutoSell(trade) {
    const targetPrice = trade.entryPrice * (1 + this.settings.autoSellProfitPercent / 100);
    
    const checkPrice = setInterval(async () => {
      const market = await this.getMarketPrice(trade.marketId);
      const currentPrice = trade.side === 'BUY' ? market.yes : market.no;
      
      if (currentPrice >= targetPrice) {
        await this.sellTrade(trade, currentPrice);
        clearInterval(checkPrice);
      }
    }, 5000);
  }

  async sellTrade(trade, price) {
    if (this.mode === 'live') {
      const order = {
        market: trade.marketId,
        side: trade.side === 'BUY' ? 'SELL' : 'SELL',
        price,
        size: trade.shares,
      };
      
      const result = await polymarketClient.placeOrder(order);
      if (result.success) {
        logger.info(`Auto-sold trade for profit at $${price}`);
        this.emit('tradeSold', { ...trade, sellPrice: price });
      }
    }
  }

  async getMarketPrice(marketId) {
    try {
      const response = await fetch(`https://data-api.polymarket.com/markets/${marketId}`);
      const data = await response.json();
      return {
        yes: data.outcomes[0].price,
        no: data.outcomes[1].price,
      };
    } catch (error) {
      return { yes: 0.5, no: 0.5 };
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      mode: this.mode,
      settings: this.settings,
      copiedTrades: this.copiedTrades.length,
      targetAddress: this.settings.targetAddress,
    };
  }
}

module.exports = CopyTrader;
