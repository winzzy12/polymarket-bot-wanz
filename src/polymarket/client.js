const { ClobClient } = require('@polymarket/clob-client');
const { ethers } = require('ethers');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('../config');
const logger = require('../utils/logger');

class PolymarketClient {
  constructor() {
    this.client = null;
    this.provider = null;
    this.wallet = null;
    this.proxyAgent = null;
  }

  initProxy() {
    if (!config.proxy.url) return null;
    
    const proxyUrl = config.proxy.url;
    if (proxyUrl.startsWith('socks')) {
      return new SocksProxyAgent(proxyUrl);
    }
    return new HttpsProxyAgent(proxyUrl);
  }

  async initialize() {
    try {
      this.proxyAgent = this.initProxy();
      
      this.provider = new ethers.providers.JsonRpcProvider(
        config.rpc.polygon,
        undefined,
        this.proxyAgent ? { agent: this.proxyAgent } : undefined
      );
      
      this.wallet = new ethers.Wallet(config.wallet.privateKey, this.provider);
      
      const clobOptions = {
        chainId: 137,
        signatureType: 1,
      };
      
      if (this.proxyAgent) {
        clobOptions.axiosConfig = { httpsAgent: this.proxyAgent };
      }
      
      this.client = new ClobClient(
        'https://clob.polymarket.com',
        137,
        this.wallet,
        clobOptions
      );
      
      if (config.polymarket.apiKey) {
        await this.client.createOrReplaceApiKey();
      }
      
      logger.info('Polymarket client initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Polymarket client:', error);
      throw error;
    }
  }

  async getBalance() {
    try {
      const balance = await this.client.getBalance();
      return balance;
    } catch (error) {
      logger.error('Failed to get balance:', error);
      return null;
    }
  }

  async getMarket(tokenId) {
    try {
      const market = await this.client.getMarket(tokenId);
      return market;
    } catch (error) {
      logger.error('Failed to get market:', error);
      return null;
    }
  }

  async placeOrder(order) {
    if (config.trading.dryRun) {
      logger.info(`[DRY RUN] Would place order:`, order);
      return { success: true, dryRun: true, order };
    }
    
    try {
      const response = await this.client.postOrder(order);
      logger.info(`Order placed: ${response.orderID}`);
      return { success: true, orderId: response.orderID, response };
    } catch (error) {
      logger.error('Failed to place order:', error);
      return { success: false, error: error.message };
    }
  }

  async cancelOrder(orderId) {
    if (config.trading.dryRun) {
      logger.info(`[DRY RUN] Would cancel order: ${orderId}`);
      return { success: true };
    }
    
    try {
      await this.client.cancelOrder(orderId);
      logger.info(`Order cancelled: ${orderId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to cancel order:', error);
      return { success: false };
    }
  }

  async getOrders() {
    try {
      const orders = await this.client.getOrders();
      return orders;
    } catch (error) {
      logger.error('Failed to get orders:', error);
      return [];
    }
  }
}

module.exports = new PolymarketClient();
