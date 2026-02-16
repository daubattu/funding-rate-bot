const ccxt = require('ccxt');
const config = require('./config');

class ExchangeManager {
  constructor() {
    this.exchanges = new Map();
    this.initializeExchanges();
  }

  /**
   * Initialize all enabled exchanges
   */
  initializeExchanges() {
    const enabledExchanges = config.enabledExchanges;
    
    console.log(`\n🏦 Initializing exchanges: ${enabledExchanges.join(', ')}`);

    enabledExchanges.forEach(exchangeName => {
      try {
        const exchangeConfig = config.exchanges[exchangeName];
        
        if (!exchangeConfig || !exchangeConfig.enabled) {
          console.log(`⚠️  ${exchangeName}: Skipped (not configured or disabled)`);
          return;
        }

        // Create CCXT exchange instance
        const ExchangeClass = ccxt[exchangeName];
        if (!ExchangeClass) {
          console.error(`❌ ${exchangeName}: Not supported by CCXT`);
          return;
        }

        const exchange = new ExchangeClass({
          apiKey: exchangeConfig.apiKey,
          secret: exchangeConfig.apiSecret,
          enableRateLimit: true,
          options: {
            defaultType: 'swap', // Use perpetual contracts
            adjustForTimeDifference: true
          }
        });

        // Set testnet if enabled
        if (config.testnet && exchange.urls.test) {
          exchange.urls.api = exchange.urls.test;
        }

        this.exchanges.set(exchangeName, exchange);
        console.log(`✅ ${exchangeName}: Initialized`);

      } catch (error) {
        console.error(`❌ ${exchangeName}: Failed to initialize -`, error.message);
      }
    });

    if (this.exchanges.size === 0) {
      throw new Error('No exchanges initialized! Check your API keys.');
    }
  }

  /**
   * Get all initialized exchanges
   */
  getExchanges() {
    return Array.from(this.exchanges.entries());
  }

  /**
   * Get specific exchange
   */
  getExchange(name) {
    return this.exchanges.get(name);
  }

  /**
   * Fetch funding rates from an exchange
   */
  async fetchFundingRates(exchangeName) {
    const exchange = this.exchanges.get(exchangeName);
    if (!exchange) {
      throw new Error(`Exchange ${exchangeName} not found`);
    }

    try {
      // Fetch all tickers with funding info
      const tickers = await exchange.fetchTickers();
      const fundingRates = [];

      for (const [symbol, ticker] of Object.entries(tickers)) {
        // Only USDT perpetuals
        if (!symbol.includes('/USDT:USDT') && !symbol.includes('/USDT')) continue;

        try {
          // Get funding rate info
          const fundingRate = await exchange.fetchFundingRate(symbol);
          
          if (fundingRate && fundingRate.fundingRate !== undefined) {
            const baseSymbol = symbol.replace('/USDT:USDT', 'USDT').replace('/USDT', 'USDT');
            
            fundingRates.push({
              exchange: exchangeName,
              symbol: baseSymbol,
              originalSymbol: symbol,
              markPrice: ticker.last || ticker.mark || 0,
              fundingRatePer8h: fundingRate.fundingRate || 0,
              fundingRatePercent: ((fundingRate.fundingRate || 0) * 100).toFixed(4),
              fundingRateAnnualized: (fundingRate.fundingRate || 0) * (365 * 24 / 8),
              nextFundingTime: fundingRate.fundingTimestamp || Date.now(),
              volume24h: ticker.quoteVolume || 0,
              priceChange24h: ticker.percentage || 0
            });
          }
        } catch (err) {
          // Skip symbols that don't have funding rates
          continue;
        }
      }

      return fundingRates;

    } catch (error) {
      console.error(`❌ Error fetching funding rates from ${exchangeName}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch funding rates from all exchanges
   */
  async fetchAllFundingRates() {
    const allRates = [];
    
    for (const [exchangeName] of this.exchanges) {
      console.log(`📡 Fetching from ${exchangeName}...`);
      const rates = await this.fetchFundingRates(exchangeName);
      allRates.push(...rates);
    }

    return allRates;
  }

  /**
   * Get balance for an exchange
   */
  async getBalance(exchangeName) {
    const exchange = this.exchanges.get(exchangeName);
    if (!exchange) throw new Error(`Exchange ${exchangeName} not found`);

    try {
      const balance = await exchange.fetchBalance();
      const usdt = balance['USDT'] || { free: 0, total: 0 };
      
      return {
        free: usdt.free || 0,
        total: usdt.total || 0,
        used: usdt.used || 0
      };
    } catch (error) {
      console.error(`❌ Error fetching balance from ${exchangeName}:`, error.message);
      return { free: 0, total: 0, used: 0 };
    }
  }

  /**
   * Create market order
   */
  async createOrder(exchangeName, symbol, side, amount, params = {}) {
    const exchange = this.exchanges.get(exchangeName);
    if (!exchange) throw new Error(`Exchange ${exchangeName} not found`);

    try {
      const order = await exchange.createOrder(symbol, 'market', side, amount, undefined, params);
      return order;
    } catch (error) {
      console.error(`❌ Error creating order on ${exchangeName}:`, error.message);
      throw error;
    }
  }

  /**
   * Get current price
   */
  async fetchPrice(exchangeName, symbol) {
    const exchange = this.exchanges.get(exchangeName);
    if (!exchange) throw new Error(`Exchange ${exchangeName} not found`);

    try {
      const ticker = await exchange.fetchTicker(symbol);
      return ticker.last || ticker.close;
    } catch (error) {
      console.error(`❌ Error fetching price from ${exchangeName}:`, error.message);
      return null;
    }
  }

  /**
   * Get market info (min notional, lot size, etc.)
   */
  async getMarketInfo(exchangeName, symbol) {
    const exchange = this.exchanges.get(exchangeName);
    if (!exchange) throw new Error(`Exchange ${exchangeName} not found`);

    try {
      await exchange.loadMarkets();
      const market = exchange.market(symbol);
      
      return {
        minAmount: market.limits.amount.min,
        maxAmount: market.limits.amount.max,
        minCost: market.limits.cost.min,
        precision: {
          amount: market.precision.amount,
          price: market.precision.price
        }
      };
    } catch (error) {
      console.error(`❌ Error fetching market info from ${exchangeName}:`, error.message);
      return null;
    }
  }
}

module.exports = ExchangeManager;
