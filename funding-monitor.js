const axios = require('axios');
const EventEmitter = require('events');
const config = require('./config');
const ExchangeManager = require('./exchange-manager');

class FundingMonitor extends EventEmitter {
  constructor() {
    super();
    this.fundingRates = new Map(); // symbol => funding rate data
    this.scanInterval = null;
    this.isScanning = false;
    this.exchangeManager = new ExchangeManager();
    this.validSymbols = new Set(); // Cache of valid symbols (available on both spot & futures)
    this.symbolsCacheTime = 0; // Last time we fetched valid symbols
    this.CACHE_DURATION = 24 * 60 * 60 * 1000; // Refresh cache every 24 hours
  }

  /**
   * Fetch valid symbols from Binance (available on both spot and futures)
   */
  async fetchValidSymbols() {
    try {
      console.log('📋 Fetching valid symbols from Binance...');
      
      // Add headers to avoid being blocked
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      };

      const [spotInfo, futuresInfo] = await Promise.all([
        axios.get(`${config.binance.baseUrl}/api/v3/exchangeInfo`, { 
          headers,
          timeout: 10000 
        }),
        axios.get(`${config.binance.baseUrl}/fapi/v1/exchangeInfo`, { 
          headers,
          timeout: 10000 
        })
      ]);

      // Get all spot USDT symbols
      const spotSymbols = new Set(
        spotInfo.data.symbols
          .filter(s => s.symbol.endsWith('USDT') && s.status === 'TRADING')
          .map(s => s.symbol)
      );

      // Get all futures USDT symbols
      const futuresSymbols = new Set(
        futuresInfo.data.symbols
          .filter(s => s.symbol.endsWith('USDT') && s.status === 'TRADING')
          .map(s => s.symbol)
      );

      // Only keep symbols available on BOTH spot and futures
      this.validSymbols = new Set(
        [...spotSymbols].filter(symbol => futuresSymbols.has(symbol))
      );

      this.symbolsCacheTime = Date.now();
      console.log(`✅ Cached ${this.validSymbols.size} valid symbols (available on both spot & futures)`);
      
    } catch (error) {
      console.error('❌ Error fetching valid symbols:', error.message);
      console.log('⚠️  Will skip symbol validation. Bot will attempt to trade all opportunities.');
      console.log('💡 Note: Some symbols may fail if not available on both spot & futures.');
      // Don't throw - continue without validation
    }
  }

  /**
   * Check if symbols cache needs refresh
   */
  async ensureValidSymbols() {
    if (this.validSymbols.size === 0 || Date.now() - this.symbolsCacheTime > this.CACHE_DURATION) {
      await this.fetchValidSymbols();
    }
  }

  /**
   * Lấy funding rate hiện tại của tất cả perpetual contracts
   */
  async fetchAllFundingRates() {
    try {
      const url = `${config.binance.baseUrl}/fapi/v1/premiumIndex`;
      const response = await axios.get(url);
      
      const data = response.data
        .filter(item => item.symbol.endsWith('USDT')) // Chỉ lấy USDT pairs
        .map(item => ({
          symbol: item.symbol,
          markPrice: parseFloat(item.markPrice),
          lastFundingRate: parseFloat(item.lastFundingRate), // Funding rate vừa xảy ra
          nextFundingTime: parseInt(item.nextFundingTime),
          fundingRateAnnualized: parseFloat(item.lastFundingRate) * (365 * 24 / 8), // Annualized
          fundingRatePer8h: parseFloat(item.lastFundingRate),
          fundingRatePercent: (parseFloat(item.lastFundingRate) * 100).toFixed(4)
        }));

      return data;
    } catch (error) {
      console.error('❌ Lỗi fetch funding rates:', error.message);
      return [];
    }
  }

  /**
   * Lấy funding rate history của 1 symbol
   */
  async fetchFundingHistory(symbol, limit = 100) {
    try {
      const url = `${config.binance.baseUrl}/fapi/v1/fundingRate`;
      const response = await axios.get(url, {
        params: { symbol, limit }
      });

      return response.data.map(item => ({
        symbol: item.symbol,
        fundingRate: parseFloat(item.fundingRate),
        fundingTime: parseInt(item.fundingTime),
        date: new Date(parseInt(item.fundingTime))
      }));
    } catch (error) {
      console.error(`❌ Lỗi fetch funding history ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Lấy 24h volume của symbols
   */
  async fetch24hVolumes() {
    try {
      const url = `${config.binance.baseUrl}/fapi/v1/ticker/24hr`;
      const response = await axios.get(url);
      
      const volumes = new Map();
      response.data.forEach(item => {
        if (item.symbol.endsWith('USDT')) {
          volumes.set(item.symbol, {
            volume: parseFloat(item.volume), // Base asset volume
            quoteVolume: parseFloat(item.quoteVolume), // USDT volume
            priceChangePercent: parseFloat(item.priceChangePercent)
          });
        }
      });

      return volumes;
    } catch (error) {
      console.error('❌ Lỗi fetch volumes:', error.message);
      return new Map();
    }
  }

  /**
   * Tính average funding rate trong N kỳ gần nhất
   */
  async getAverageFundingRate(symbol, periods = 7) {
    const history = await this.fetchFundingHistory(symbol, periods);
    if (history.length === 0) return 0;

    const sum = history.reduce((acc, item) => acc + item.fundingRate, 0);
    return sum / history.length;
  }

  /**
   * Scan và tìm opportunities (coins với funding rate cao)
   */
  async scanOpportunities(skipCheck = false) {
    if (this.isScanning) {
      console.log('⏳ Đang scan, bỏ qua lần này...');
      return;
    }

    // Skip scan if we should check and don't need to scan
    if (!skipCheck && this.shouldSkipScan) {
      if (this.shouldSkipScan()) {
        console.log('⏸️  Max positions reached. Skipping scan until a position closes.');
        return;
      }
    }

    this.isScanning = true;
    console.log(`\n🔍 Scanning funding rates from all exchanges... ${new Date().toLocaleString('vi-VN')}`);

    try {
      // Ensure we have valid symbols cache
      await this.ensureValidSymbols();

      // Fetch funding rates from all exchanges
      const fundingRates = await this.exchangeManager.fetchAllFundingRates();

      // Filter và sort
      const opportunities = fundingRates
        .filter(item => {
          // CHỈ lấy funding rate DƯƠNG (spot account không thể short)
          // Dương → LONG spot + SHORT futures (có thể làm với spot account)
          const meetsThreshold = item.volume24h >= config.scanning.minVolume24hUSDT &&
                 item.fundingRatePer8h >= config.strategy.fundingRateThreshold;
          
          // For Binance, only validate if we have the cache
          // If cache failed to load, allow all symbols (will be validated during trade)
          if (item.exchange === 'binance' && this.validSymbols.size > 0) {
            return meetsThreshold && this.validSymbols.has(item.symbol);
          }
          
          return meetsThreshold;
        })
        .sort((a, b) => b.fundingRatePer8h - a.fundingRatePer8h); // Sort by funding rate (bỏ Math.abs)

      // Update cache
      opportunities.forEach(item => {
        const key = `${item.exchange}:${item.symbol}`;
        this.fundingRates.set(key, item);
      });

      // Emit opportunities
      if (opportunities.length > 0) {
        console.log(`✅ Tìm thấy ${opportunities.length} opportunities`);
        
        // Log top 10
        console.log('\n📊 TOP 10 HIGHEST POSITIVE FUNDING RATES:');
        console.log('─'.repeat(90));
        opportunities.slice(0, 10).forEach((item, i) => {
          console.log(`${i + 1}. 📈 ${item.symbol} (${item.exchange.toUpperCase()})`);
          console.log(`   Rate: ${item.fundingRatePercent}% per 8h | Annualized: ${(item.fundingRateAnnualized * 100).toFixed(2)}%`);
          console.log(`   Action: LONG spot + SHORT futures`);
          console.log(`   Volume: $${(item.volume24h / 1000000).toFixed(2)}M | Price Change: ${item.priceChange24h?.toFixed(2)}%`);
          console.log('');
        });

        this.emit('opportunities', opportunities);
      } else {
        console.log('⏳ Không tìm thấy opportunity nào (funding rate < threshold)');
      }

    } catch (error) {
      console.error('❌ Lỗi scan opportunities:', error.message);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Set callback to check if should skip scan
   */
  setShouldSkipScanCallback(callback) {
    this.shouldSkipScan = callback;
  }

  /**
   * Bắt đầu monitoring
   */
  async start() {
    console.log('🚀 Starting Funding Rate Monitor...');
    console.log(`⏱️  Scan interval: ${config.scanning.intervalSeconds} seconds`);
    console.log(`💰 Funding rate threshold: ${(config.strategy.fundingRateThreshold * 100).toFixed(2)}% per 8h`);
    console.log(`📊 Min volume: $${(config.scanning.minVolume24hUSDT / 1000000).toFixed(0)}M\n`);

    // Fetch valid symbols first
    await this.fetchValidSymbols();

    // Scan ngay lần đầu
    this.scanOpportunities();

    // Scan định kỳ
    this.scanInterval = setInterval(() => {
      this.scanOpportunities();
    }, config.scanning.intervalSeconds * 1000);
  }

  /**
   * Dừng monitoring
   */
  stop() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      console.log('⏹️  Funding Rate Monitor stopped');
    }
  }

  /**
   * Lấy funding rate của 1 symbol
   */
  getFundingRate(symbol) {
    return this.fundingRates.get(symbol);
  }

  /**
   * Lấy tất cả funding rates
   */
  getAllFundingRates() {
    return Array.from(this.fundingRates.values());
  }
}

module.exports = FundingMonitor;
