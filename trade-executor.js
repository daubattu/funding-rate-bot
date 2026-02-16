const Binance = require('binance-api-node').default;
const config = require('./config');

class TradeExecutor {
  constructor() {
    this.client = Binance({
      apiKey: config.binance.apiKey,
      apiSecret: config.binance.apiSecret,
      futures: true // Enable futures API
    });

    this.activePositions = new Map(); // symbol => position data
    this.orderHistory = [];
    this.isTestMode = config.binance.testnet;
  }

  /**
   * Lấy số dư tài khoản
   */
  async getBalance() {
    try {
      const [spotAccount, futuresAccount] = await Promise.all([
        this.client.accountInfo(),
        this.client.futuresAccountBalance()
      ]);

      const spotUSDT = spotAccount.balances.find(b => b.asset === 'USDT');
      const futuresUSDT = futuresAccount.find(b => b.asset === 'USDT');

      return {
        spot: {
          total: parseFloat(spotUSDT?.free || 0) + parseFloat(spotUSDT?.locked || 0),
          free: parseFloat(spotUSDT?.free || 0),
          locked: parseFloat(spotUSDT?.locked || 0)
        },
        futures: {
          total: parseFloat(futuresUSDT?.balance || 0),
          available: parseFloat(futuresUSDT?.availableBalance || 0),
          crossWalletBalance: parseFloat(futuresUSDT?.crossWalletBalance || 0)
        }
      };
    } catch (error) {
      console.error('❌ Lỗi get balance:', error.message);
      return null;
    }
  }

  /**
   * Lấy giá hiện tại
   */
  async getCurrentPrices(symbol) {
    try {
      const [spotPrice, futuresPrice] = await Promise.all([
        this.client.prices({ symbol }),
        this.client.futuresPrices({ symbol })
      ]);

      return {
        spot: parseFloat(spotPrice[symbol]),
        futures: parseFloat(futuresPrice[symbol])
      };
    } catch (error) {
      console.error(`❌ Lỗi get prices ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Lấy thông tin symbol (lot size, tick size, etc.)
   */
  async getSymbolInfo(symbol) {
    try {
      const [spotInfo, futuresInfo] = await Promise.all([
        this.client.exchangeInfo(),
        this.client.futuresExchangeInfo()
      ]);

      const spotSymbol = spotInfo.symbols.find(s => s.symbol === symbol);
      const futuresSymbol = futuresInfo.symbols.find(s => s.symbol === symbol);

      if (!spotSymbol || !futuresSymbol) {
        throw new Error(`Symbol ${symbol} not found`);
      }

      // Extract lot size and price filters
      const spotLotSize = spotSymbol.filters.find(f => f.filterType === 'LOT_SIZE');
      const futuresLotSize = futuresSymbol.filters.find(f => f.filterType === 'LOT_SIZE');

      return {
        spot: {
          minQty: parseFloat(spotLotSize.minQty),
          maxQty: parseFloat(spotLotSize.maxQty),
          stepSize: parseFloat(spotLotSize.stepSize)
        },
        futures: {
          minQty: parseFloat(futuresLotSize.minQty),
          maxQty: parseFloat(futuresLotSize.maxQty),
          stepSize: parseFloat(futuresLotSize.stepSize),
          pricePrecision: futuresSymbol.pricePrecision,
          quantityPrecision: futuresSymbol.quantityPrecision
        }
      };
    } catch (error) {
      console.error(`❌ Lỗi get symbol info ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Tính toán quantity phù hợp
   */
  calculateQuantity(priceUSDT, positionSizeUSDT, stepSize) {
    const rawQuantity = positionSizeUSDT / priceUSDT;
    // Round down to step size
    const quantity = Math.floor(rawQuantity / stepSize) * stepSize;
    return parseFloat(quantity.toFixed(8));
  }

  /**
   * Mở vị thế hedge (Long spot + Short futures hoặc ngược lại)
   */
  async openHedgePosition(symbol, fundingRate, positionSizeUSDT) {
    console.log(`\n🎯 Opening hedge position for ${symbol}...`);
    
    try {
      // 0. Kiểm tra đã có vị thế với token này chưa
      if (this.activePositions.has(symbol)) {
        console.log(`⚠️  Already have an active position for ${symbol}. Skipping.`);
        return null;
      }

      // 1. Kiểm tra balance
      const balance = await this.getBalance();
      if (!balance) throw new Error('Cannot get balance');

      console.log(`💰 Current Balance:`);
      console.log(`   Spot Free: $${balance.spot.free.toFixed(2)} (Total: $${balance.spot.total.toFixed(2)})`);
      console.log(`   Futures Available: $${balance.futures.available.toFixed(2)} (Total: $${balance.futures.total.toFixed(2)})`);
      console.log(`   Need: $${positionSizeUSDT} on each side`);

      if (balance.spot.free < positionSizeUSDT || balance.futures.available < positionSizeUSDT) {
        throw new Error(`Insufficient balance. Need $${positionSizeUSDT} on both spot and futures`);
      }

      // 2. Kiểm tra symbol info trước (để biết symbol có tồn tại không)
      const symbolInfo = await this.getSymbolInfo(symbol);
      if (!symbolInfo) {
        throw new Error(`Symbol ${symbol} not available on Binance (spot or futures missing)`);
      }

      // 3. Lấy giá hiện tại
      const prices = await this.getCurrentPrices(symbol);
      if (!prices) {
        throw new Error(`Cannot get current prices for ${symbol}`);
      }

      // 4. Tính quantity
      const spotQuantity = this.calculateQuantity(
        prices.spot,
        positionSizeUSDT,
        symbolInfo.spot.stepSize
      );
      
      const futuresQuantity = this.calculateQuantity(
        prices.futures,
        positionSizeUSDT,
        symbolInfo.futures.stepSize
      );

      console.log(`📊 Position Details:`);
      console.log(`   Spot Price: $${prices.spot}`);
      console.log(`   Futures Price: $${prices.futures}`);
      console.log(`   Spot Quantity: ${spotQuantity}`);
      console.log(`   Futures Quantity: ${futuresQuantity}`);

      // 5. Determine direction based on funding rate
      const isLongSpot = fundingRate > 0; // Positive funding → Long spot + Short futures

      let spotOrder, futuresOrder;

      if (this.isTestMode) {
        console.log('⚠️  TEST MODE: Orders not actually placed');
        spotOrder = { orderId: `TEST_SPOT_${Date.now()}`, status: 'FILLED' };
        futuresOrder = { orderId: `TEST_FUTURES_${Date.now()}`, status: 'FILLED' };
      } else {
        // 6. Execute orders SIMULTANEOUSLY
        console.log(`🔄 Executing orders...`);
        
        [spotOrder, futuresOrder] = await Promise.all([
          // Spot order
          this.client.order({
            symbol,
            side: isLongSpot ? 'BUY' : 'SELL',
            type: 'MARKET',
            quantity: spotQuantity
          }),
          // Futures order (opposite side)
          this.client.futuresOrder({
            symbol,
            side: isLongSpot ? 'SELL' : 'BUY', // Opposite
            type: 'MARKET',
            quantity: futuresQuantity
          })
        ]);
      }

      // 7. Save position
      const position = {
        symbol,
        openTime: Date.now(),
        fundingRate,
        isLongSpot,
        spot: {
          quantity: spotQuantity,
          entryPrice: prices.spot,
          orderId: spotOrder.orderId
        },
        futures: {
          quantity: futuresQuantity,
          entryPrice: prices.futures,
          orderId: futuresOrder.orderId
        },
        positionSizeUSDT,
        fundingEarned: 0,
        fundingCount: 0
      };

      this.activePositions.set(symbol, position);
      this.orderHistory.push({
        type: 'OPEN',
        timestamp: Date.now(),
        ...position
      });

      console.log(`✅ Hedge position opened for ${symbol}`);
      console.log(`   ${isLongSpot ? '📈 LONG' : '📉 SHORT'} spot + ${isLongSpot ? '📉 SHORT' : '📈 LONG'} futures`);

      return position;

    } catch (error) {
      console.error(`❌ Lỗi open position ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Đóng vị thế hedge
   */
  async closeHedgePosition(symbol, reason = 'Manual close') {
    console.log(`\n🔄 Closing hedge position for ${symbol}...`);
    console.log(`   Reason: ${reason}`);

    const position = this.activePositions.get(symbol);
    if (!position) {
      console.log(`⚠️  No active position for ${symbol}`);
      return null;
    }

    try {
      // 1. Lấy giá hiện tại
      const prices = await this.getCurrentPrices(symbol);
      if (!prices) throw new Error('Cannot get current prices');

      let spotOrder, futuresOrder;

      if (this.isTestMode) {
        console.log('⚠️  TEST MODE: Close orders not actually placed');
        spotOrder = { orderId: `TEST_CLOSE_SPOT_${Date.now()}`, status: 'FILLED' };
        futuresOrder = { orderId: `TEST_CLOSE_FUTURES_${Date.now()}`, status: 'FILLED' };
      } else {
        // 2. Close both positions simultaneously
        [spotOrder, futuresOrder] = await Promise.all([
          // Close spot (opposite of entry)
          this.client.order({
            symbol,
            side: position.isLongSpot ? 'SELL' : 'BUY', // Opposite of entry
            type: 'MARKET',
            quantity: position.spot.quantity
          }),
          // Close futures (opposite of entry)
          this.client.futuresOrder({
            symbol,
            side: position.isLongSpot ? 'BUY' : 'SELL', // Opposite of entry
            type: 'MARKET',
            quantity: position.futures.quantity
          })
        ]);
      }

      // 3. Calculate P&L
      const spotPnl = position.isLongSpot
        ? (prices.spot - position.spot.entryPrice) * position.spot.quantity
        : (position.spot.entryPrice - prices.spot) * position.spot.quantity;

      const futuresPnl = position.isLongSpot
        ? (position.futures.entryPrice - prices.futures) * position.futures.quantity
        : (prices.futures - position.futures.entryPrice) * position.futures.quantity;

      const totalPnl = spotPnl + futuresPnl + position.fundingEarned;
      const pnlPercent = (totalPnl / position.positionSizeUSDT) * 100;

      // 4. Calculate duration
      const durationMs = Date.now() - position.openTime;
      const durationHours = durationMs / (1000 * 60 * 60);
      const duration = `${Math.floor(durationHours)}h ${Math.floor((durationHours % 1) * 60)}m`;

      const closedPosition = {
        ...position,
        closeTime: Date.now(),
        closeReason: reason,
        exitPrice: {
          spot: prices.spot,
          futures: prices.futures
        },
        pnl: {
          spot: spotPnl,
          futures: futuresPnl,
          funding: position.fundingEarned,
          total: totalPnl,
          percent: pnlPercent
        },
        duration,
        durationHours
      };

      // 5. Remove from active positions
      this.activePositions.delete(symbol);
      this.orderHistory.push({
        type: 'CLOSE',
        timestamp: Date.now(),
        ...closedPosition
      });

      console.log(`✅ Position closed for ${symbol}`);
      console.log(`   💰 P&L: $${totalPnl.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`);
      console.log(`   📊 Breakdown:`);
      console.log(`      Spot: $${spotPnl.toFixed(2)}`);
      console.log(`      Futures: $${futuresPnl.toFixed(2)}`);
      console.log(`      Funding: $${position.fundingEarned.toFixed(2)}`);

      return closedPosition;

    } catch (error) {
      console.error(`❌ Lỗi close position ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Update funding earned cho active positions
   * Gọi hàm này sau mỗi funding period (8h)
   */
  updateFundingEarned(symbol, fundingRateReceived) {
    const position = this.activePositions.get(symbol);
    if (!position) return;

    // Funding earned = funding rate * position size
    // Nếu long spot + short futures: nhận funding khi rate > 0
    // Nếu short spot + long futures: nhận funding khi rate < 0
    const shouldReceiveFunding = 
      (position.isLongSpot && fundingRateReceived > 0) ||
      (!position.isLongSpot && fundingRateReceived < 0);

    if (shouldReceiveFunding) {
      const fundingAmount = Math.abs(fundingRateReceived) * position.positionSizeUSDT;
      position.fundingEarned += fundingAmount;
      position.fundingCount++;

      console.log(`💰 Funding earned for ${symbol}: $${fundingAmount.toFixed(2)}`);
      console.log(`   Total funding: $${position.fundingEarned.toFixed(2)} (${position.fundingCount} periods)`);
    }
  }

  /**
   * Check và rebalance positions nếu cần
   */
  async checkRebalance(symbol) {
    const position = this.activePositions.get(symbol);
    if (!position) return;

    // Get current prices
    const prices = await this.getCurrentPrices(symbol);
    if (!prices) return;

    // Calculate current value of each side
    const spotValue = prices.spot * position.spot.quantity;
    const futuresValue = prices.futures * position.futures.quantity;

    // Calculate delta (difference in %)
    const delta = Math.abs(spotValue - futuresValue) / position.positionSizeUSDT;

    if (delta > config.strategy.rebalanceThreshold) {
      console.log(`⚠️  ${symbol} needs rebalancing: Delta ${(delta * 100).toFixed(2)}%`);
      // TODO: Implement rebalancing logic
      // For now, just log
    }
  }

  /**
   * Get all active positions
   */
  getActivePositions() {
    return Array.from(this.activePositions.values());
  }

  /**
   * Get position by symbol
   */
  getPosition(symbol) {
    return this.activePositions.get(symbol);
  }

  /**
   * Get order history
   */
  getOrderHistory() {
    return this.orderHistory;
  }
}

module.exports = TradeExecutor;
