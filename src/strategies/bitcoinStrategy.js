const EventEmitter = require('events');
const logger = require('../utils/logger');
const polymarketClient = require('../polymarket/client');

class BitcoinStrategy extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.mode = 'simulation'; // 'live' or 'simulation'
    this.settings = {
      duration: '5m', // '5m' or '15m'
      direction: 'up', // 'up', 'down', or 'both'
      tradeSize: 10,
      maxPositionSize: 100,
      stopLoss: 0.5, // 50% stop loss
      takeProfit: 2.0, // 200% take profit
      maxConcurrentTrades: 3,
      entryDelay: 0, // seconds after market open
      exitBeforeClose: 60, // seconds before market close
    };
    this.activeTrades = [];
    this.intervalId = null;
  }

  setSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.emit('settingsChanged', this.settings);
    logger.info('Strategy settings updated:', this.settings);
  }

  setMode(mode) {
    this.mode = mode;
    this.emit('modeChanged', mode);
    logger.info(`Trading mode set to: ${mode}`);
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Strategy already running');
      return;
    }
    
    this.isRunning = true;
    logger.info(`Starting Bitcoin strategy (${this.mode} mode)`);
    
    if (this.mode === 'live') {
      await polymarketClient.initialize();
    }
    
    this.intervalId = setInterval(() => this.checkMarkets(), 5000);
    this.emit('started');
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    logger.info('Bitcoin strategy stopped');
    this.emit('stopped');
  }

  async checkMarkets() {
    try {
      const markets = await this.getAvailableMarkets();
      
      for (const market of markets) {
        await this.evaluateMarket(market);
      }
      
      await this.checkActiveTrades();
    } catch (error) {
      logger.error('Error checking markets:', error);
    }
  }

  async getAvailableMarkets() {
    // Fetch markets from Polymarket API
    try {
      const response = await fetch('https://data-api.polymarket.com/markets');
      const data = await response.json();
      
      const slug = this.settings.duration === '5m' 
        ? 'bitcoin-up-or-down-5-minutes'
        : 'bitcoin-up-or-down-15-minutes';
      
      return data.filter(m => m.slug === slug && m.closed === false);
    } catch (error) {
      logger.error('Failed to fetch markets:', error);
      return [];
    }
  }

  async evaluateMarket(market) {
    // Check if market is already traded
    const existingTrade = this.activeTrades.find(t => t.marketId === market.id);
    if (existingTrade) return;
    
    // Check max concurrent trades
    if (this.activeTrades.length >= this.settings.maxConcurrentTrades) return;
    
    // Check entry window
    const marketOpenTime = new Date(market.startDate).getTime();
    const now = Date.now();
    if (now - marketOpenTime < this.settings.entryDelay * 1000) return;
    
    // Check if too close to close
    const marketCloseTime = new Date(market.endDate).getTime();
    if (marketCloseTime - now < this.settings.exitBeforeClose * 1000) return;
    
    // Analyze market
    const analysis = await this.analyzeMarket(market);
    
    if (analysis.shouldTrade) {
      await this.executeTrade(market, analysis.direction);
    }
  }

  async analyzeMarket(market) {
    // Simple analysis based on current odds
    const yesPrice = market.outcomes[0].price;
    const noPrice = market.outcomes[1].price;
    
    let shouldTrade = false;
    let direction = null;
    
    if (this.settings.direction === 'up') {
      shouldTrade = yesPrice < 0.6; // Buy YES when cheap
      direction = 'yes';
    } else if (this.settings.direction === 'down') {
      shouldTrade = noPrice < 0.6; // Buy NO when cheap
      direction = 'no';
    } else {
      // Both directions
      if (yesPrice < 0.45) {
        shouldTrade = true;
        direction = 'yes';
      } else if (noPrice < 0.45) {
        shouldTrade = true;
        direction = 'no';
      }
    }
    
    return { shouldTrade, direction, yesPrice, noPrice };
  }

  async executeTrade(market, direction) {
    const outcome = direction === 'yes' ? market.outcomes[0] : market.outcomes[1];
    const price = outcome.price;
    const shares = this.settings.tradeSize / price;
    
    const trade = {
      id: Date.now(),
      marketId: market.id,
      direction,
      entryPrice: price,
      shares,
      size: this.settings.tradeSize,
      timestamp: Date.now(),
      stopLossPrice: price * (1 - this.settings.stopLoss),
      takeProfitPrice: price * (1 + this.settings.takeProfit),
    };
    
    if (this.mode === 'live') {
      const order = {
        market: market.id,
        side: 'BUY',
        price,
        size: shares,
      };
      
      const result = await polymarketClient.placeOrder(order);
      if (!result.success) {
        logger.error('Failed to place order:', result.error);
        return;
      }
      
      trade.orderId = result.orderId;
    }
    
    this.activeTrades.push(trade);
    this.emit('tradeExecuted', trade);
    logger.info(`Trade executed: ${direction.toUpperCase()} ${shares} shares at $${price}`);
  }

  async checkActiveTrades() {
    for (let i = 0; i < this.activeTrades.length; i++) {
      const trade = this.activeTrades[i];
      const market = await this.getMarketById(trade.marketId);
      
      if (!market || market.closed) {
        await this.closeTrade(trade, market);
        this.activeTrades.splice(i, 1);
        i--;
        continue;
      }
      
      const currentPrice = trade.direction === 'yes' 
        ? market.outcomes[0].price
        : market.outcomes[1].price;
      
      // Check stop loss
      if (currentPrice <= trade.stopLossPrice) {
        await this.closeTrade(trade, market, 'stop_loss');
        this.activeTrades.splice(i, 1);
        i--;
        continue;
      }
      
      // Check take profit
      if (currentPrice >= trade.takeProfitPrice) {
        await this.closeTrade(trade, market, 'take_profit');
        this.activeTrades.splice(i, 1);
        i--;
        continue;
      }
      
      // Update trade
      trade.currentPrice = currentPrice;
      trade.unrealizedPnL = (currentPrice - trade.entryPrice) * trade.shares;
      this.emit('tradeUpdated', trade);
    }
  }

  async closeTrade(trade, market, reason = 'market_closed') {
    const finalPrice = trade.direction === 'yes'
      ? market?.outcomes[0].price || 0
      : market?.outcomes[1].price || 0;
    
    const realizedPnL = (finalPrice - trade.entryPrice) * trade.shares;
    
    if (this.mode === 'live' && trade.orderId) {
      await polymarketClient.cancelOrder(trade.orderId);
    }
    
    this.emit('tradeClosed', {
      ...trade,
      closePrice: finalPrice,
      realizedPnL,
      reason,
    });
    
    logger.info(`Trade closed: ${reason}, PnL: $${realizedPnL.toFixed(2)}`);
  }

  async getMarketById(marketId) {
    const markets = await this.getAvailableMarkets();
    return markets.find(m => m.id === marketId);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      mode: this.mode,
      settings: this.settings,
      activeTrades: this.activeTrades.length,
      totalPnL: this.activeTrades.reduce((sum, t) => sum + (t.unrealizedPnL || 0), 0),
    };
  }
}

module.exports = BitcoinStrategy;
