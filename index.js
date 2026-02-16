const FundingMonitor = require('./funding-monitor');
const TradeExecutor = require('./trade-executor');
const TelegramNotifier = require('./telegram-notifier');
const config = require('./config');

class FundingRateBot {
  constructor() {
    this.fundingMonitor = new FundingMonitor();
    this.tradeExecutor = new TradeExecutor();
    this.telegram = new TelegramNotifier();
    
    this.setupEventListeners();
    this.setupScanOptimization();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Listen for funding rate opportunities
    this.fundingMonitor.on('opportunities', async (opportunities) => {
      await this.handleOpportunities(opportunities);
    });
  }

  /**
   * Setup scan optimization - skip scans when at max positions
   */
  setupScanOptimization() {
    this.fundingMonitor.setShouldSkipScanCallback(() => {
      const activePositions = this.tradeExecutor.getActivePositions();
      return activePositions.length >= config.strategy.maxActivePositions;
    });
  }

  /**
   * Handle opportunities
   */
  async handleOpportunities(opportunities) {
    console.log(`\n🎯 Processing ${opportunities.length} opportunities...`);

    // Send telegram notification
    await this.telegram.notifyOpportunities(opportunities);

    // Get current active positions
    const activePositions = this.tradeExecutor.getActivePositions();
    
    // Check if we can open more positions
    if (activePositions.length >= config.strategy.maxActivePositions) {
      console.log(`⚠️  Max positions reached (${config.strategy.maxActivePositions}). Skipping new trades.`);
      return;
    }

    // Filter opportunities: exclude symbols we already have
    const activeSymbols = new Set(activePositions.map(p => p.symbol));
    const newOpportunities = opportunities.filter(o => !activeSymbols.has(o.symbol));

    if (newOpportunities.length === 0) {
      console.log('⏳ No new opportunities (already have positions in top coins)');
      return;
    }

    // Calculate how many positions we can open
    const maxNew = config.strategy.maxActivePositions - activePositions.length;
    let successfullyOpened = 0;

    // Try to open positions, skip failed tokens and try next ones
    for (let i = 0; i < newOpportunities.length && successfullyOpened < maxNew; i++) {
      const opp = newOpportunities[i];
      
      try {
        console.log(`\n💼 Opening position for ${opp.symbol} (attempt ${i + 1}/${newOpportunities.length})...`);
        
        // Calculate position size (can be dynamic based on funding rate)
        const positionSize = Math.min(
          config.strategy.maxPositionSizeUSDT,
          Math.max(config.strategy.minPositionSizeUSDT, 1000) // Base size
        );

        // Open hedge position
        const position = await this.tradeExecutor.openHedgePosition(
          opp.symbol,
          opp.fundingRatePer8h,
          positionSize
        );

        if (position) {
          // Send telegram notification
          await this.telegram.notifyTrade({
            symbol: opp.symbol,
            action: position.isLongSpot ? 'LONG spot + SHORT futures' : 'SHORT spot + LONG futures',
            quantity: position.spot.quantity,
            spotPrice: position.spot.entryPrice,
            futuresPrice: position.futures.entryPrice,
            fundingRate: opp.fundingRatePer8h
          });

          console.log(`✅ Successfully opened position for ${opp.symbol} on ${opp.exchange.toUpperCase()}`);
          successfullyOpened++;
          
          // Wait 2s between successful trades to avoid rate limits
          if (successfullyOpened < maxNew && i < newOpportunities.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } else {
          console.log(`⏭️  ${opp.symbol} returned null, trying next opportunity...\n`);
        }

      } catch (error) {
        console.error(`❌ Failed to open position for ${opp.symbol} on ${opp.exchange}:`, error.message);
        console.log(`⏭️  Skipping ${opp.symbol}, moving to next opportunity...\n`);
        await this.telegram.notifyError(`Failed to open ${opp.symbol} on ${opp.exchange}: ${error.message}`);
        // Continue to next token (loop will continue automatically)
      }
    }

    if (successfullyOpened > 0) {
      console.log(`\n✅ Successfully opened ${successfullyOpened}/${maxNew} new positions`);
    } else {
      console.log(`\n⚠️  Failed to open any positions. All attempted tokens had issues.`);
    }
  }

  /**
   * Monitor and manage active positions
   */
  async managePositions() {
    const activePositions = this.tradeExecutor.getActivePositions();
    
    if (activePositions.length === 0) {
      return;
    }

    console.log(`\n📊 Managing ${activePositions.length} active positions...`);

    for (const position of activePositions) {
      try {
        // 1. Calculate current P&L to check stop loss
        const currentPrices = await this.tradeExecutor.getCurrentPrices(position.symbol);
        if (currentPrices) {
          const spotPnl = position.isLongSpot
            ? (currentPrices.spot - position.spot.entryPrice) * position.spot.quantity
            : (position.spot.entryPrice - currentPrices.spot) * position.spot.quantity;

          const futuresPnl = position.isLongSpot
            ? (position.futures.entryPrice - currentPrices.futures) * position.futures.quantity
            : (currentPrices.futures - position.futures.entryPrice) * position.futures.quantity;

          const currentPnl = spotPnl + futuresPnl + position.fundingEarned;
          const currentPnlPercent = (currentPnl / position.positionSizeUSDT);

          // Stop loss: Close if losing more than threshold
          if (currentPnlPercent < -config.strategy.stopLossPercent) {
            console.log(`🛑 ${position.symbol} hit stop loss! Current loss: ${(currentPnlPercent * 100).toFixed(2)}%`);
            const closed = await this.tradeExecutor.closeHedgePosition(
              position.symbol,
              `Stop loss triggered: ${(currentPnlPercent * 100).toFixed(2)}% loss`
            );

            if (closed) {
              await this.telegram.notifyClose({
                symbol: closed.symbol,
                entryPrice: closed.spot.entryPrice,
                exitPrice: closed.exitPrice.spot,
                fundingEarned: closed.fundingEarned,
                pnl: closed.pnl.total,
                pnlPercent: closed.pnl.percent,
                duration: closed.duration
              });

              console.log('⏩ Position closed. Triggering immediate scan for new opportunities...');
              setTimeout(() => this.fundingMonitor.scanOpportunities(true), 3000);
            }
            continue;
          }
        }

        // 2. Check take profit based on accumulated funding
        const fundingEarnedPercent = position.fundingEarned / position.positionSizeUSDT;

        // Take profit if accumulated funding > threshold
        if (fundingEarnedPercent >= config.strategy.takeProfitFunding) {
          console.log(`🎯 ${position.symbol} reached take profit target`);
          const closed = await this.tradeExecutor.closeHedgePosition(
            position.symbol,
            `Take profit: ${(fundingEarnedPercent * 100).toFixed(2)}% funding earned`
          );

          if (closed) {
            await this.telegram.notifyClose({
              symbol: closed.symbol,
              entryPrice: closed.spot.entryPrice,
              exitPrice: closed.exitPrice.spot,
              fundingEarned: closed.fundingEarned,
              pnl: closed.pnl.total,
              pnlPercent: closed.pnl.percent,
              duration: closed.duration
            });

            // Trigger immediate scan for new opportunities
            console.log('⏩ Position closed. Triggering immediate scan for new opportunities...');
            setTimeout(() => this.fundingMonitor.scanOpportunities(true), 3000);
          }
          continue;
        }

        // 3. Check rebalance
        await this.tradeExecutor.checkRebalance(position.symbol);

        // 4. Get latest funding rate and check for unfavorable conditions
        const latestFunding = this.fundingMonitor.getFundingRate(position.symbol);
        
        if (latestFunding) {
          const currentRate = latestFunding.fundingRatePer8h;
          
          // Early warning: Close if funding rate drops too low (before it reverses)
          const EARLY_EXIT_THRESHOLD = config.strategy.fundingRateThreshold * 0.5; // 50% of entry threshold
          const isTooLow = Math.abs(currentRate) < EARLY_EXIT_THRESHOLD;
          
          // Check if already reversed sign
          const rateChangedSign = 
            (position.isLongSpot && currentRate < 0) ||
            (!position.isLongSpot && currentRate > 0);

          // Check if funding rate is declining rapidly (approaching reversal)
          const isApproachingReversal = 
            (position.isLongSpot && currentRate < EARLY_EXIT_THRESHOLD) ||
            (!position.isLongSpot && currentRate > -EARLY_EXIT_THRESHOLD);

          let shouldClose = false;
          let reason = '';

          if (rateChangedSign) {
            shouldClose = true;
            reason = `Funding rate reversed sign (now ${(currentRate * 100).toFixed(4)}%)`;
            console.log(`⚠️  ${position.symbol} funding rate REVERSED! Closing immediately.`);
          } else if (isApproachingReversal) {
            shouldClose = true;
            reason = `Funding rate too low (${(currentRate * 100).toFixed(4)}%), risk of reversal`;
            console.log(`⚠️  ${position.symbol} funding rate approaching reversal. Closing to avoid loss.`);
          }

          if (shouldClose) {
            const closed = await this.tradeExecutor.closeHedgePosition(
              position.symbol,
              reason
            );

            if (closed) {
              await this.telegram.notifyClose({
                symbol: closed.symbol,
                entryPrice: closed.spot.entryPrice,
                exitPrice: closed.exitPrice.spot,
                fundingEarned: closed.fundingEarned,
                pnl: closed.pnl.total,
                pnlPercent: closed.pnl.percent,
                duration: closed.duration
              });

              // Trigger immediate scan for new opportunities
              console.log('⏩ Position closed. Triggering immediate scan for new opportunities...');
              setTimeout(() => this.fundingMonitor.scanOpportunities(true), 3000);
            }
          }
        }

      } catch (error) {
        console.error(`❌ Error managing position ${position.symbol}:`, error.message);
      }
    }
  }

  /**
   * Start the bot
   */
  async start() {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║       🤖 FUNDING RATE ARBITRAGE BOT - STARTING...        ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    // Check API keys
    if (!config.binance.apiKey || !config.binance.apiSecret) {
      console.error('❌ ERROR: Binance API keys not configured!');
      console.log('💡 Please set BINANCE_API_KEY and BINANCE_API_SECRET in .env file\n');
      process.exit(1);
    }

    // Check balance
    console.log('💰 Checking account balance...');
    const balance = await this.tradeExecutor.getBalance();
    if (balance) {
      console.log('📊 Balance:');
      console.log(`   Spot USDT: $${balance.spot.total.toFixed(2)} (Available: $${balance.spot.free.toFixed(2)})`);
      console.log(`   Futures USDT: $${balance.futures.available.toFixed(2)}`);
      console.log('');
    }

    // Send startup notification
    await this.telegram.sendMessage(`🚀 <b>Funding Rate Bot Started</b>\n⏰ ${new Date().toLocaleString('vi-VN')}`);

    // Start monitoring (fetch valid symbols first)
    await this.fundingMonitor.start();

    // Start position management loop (every 2 minutes for faster response)
    setInterval(async () => {
      await this.managePositions();
    }, 2 * 60 * 1000); // Changed from 5 to 2 minutes

    console.log('✅ Bot is running...\n');
    console.log('📊 Monitoring funding rates and managing positions');
    console.log('📱 Telegram notifications enabled');
    console.log('⏱️  Position check interval: 2 minutes');
    console.log('🔴 Press Ctrl+C to stop\n');
  }

  /**
   * Stop the bot
   */
  stop() {
    console.log('\n⏹️  Stopping bot...');
    this.fundingMonitor.stop();
    console.log('✅ Bot stopped\n');
  }
}

// Main execution
const bot = new FundingRateBot();

bot.start().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  bot.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  bot.stop();
  process.exit(0);
});

module.exports = FundingRateBot;
