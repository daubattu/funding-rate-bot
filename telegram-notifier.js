const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');

class TelegramNotifier {
  constructor() {
    this.bot = null;
    this.chatId = config.telegram.chatId;
    this.enabled = config.telegram.enabled;
    
    if (this.enabled) {
      try {
        this.bot = new TelegramBot(config.telegram.botToken, { polling: false });
        console.log('✅ Telegram Bot initialized');
      } catch (error) {
        console.error('❌ Lỗi khởi tạo Telegram bot:', error.message);
        this.enabled = false;
      }
    } else {
      console.warn('⚠️  Telegram notifications DISABLED (missing credentials)');
    }
  }

  /**
   * Gửi tin nhắn
   */
  async sendMessage(message) {
    if (!this.enabled || !this.bot) {
      console.log('⚠️  Telegram disabled, skipping message');
      return false;
    }

    try {
      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
      return true;
    } catch (error) {
      console.error('❌ Lỗi gửi Telegram:', error.message);
      return false;
    }
  }

  /**
   * Format opportunity alert
   */
  formatOpportunityAlert(opportunities) {
    const top5 = opportunities.slice(0, 5);
    
    let message = `🎯 <b>FUNDING RATE OPPORTUNITIES</b>\n`;
    message += `⏰ ${new Date().toLocaleString('vi-VN')}\n\n`;

    top5.forEach((opp, i) => {
      const arrow = opp.fundingRatePer8h > 0 ? '📈' : '📉';
      const action = opp.fundingRatePer8h > 0 ? 'LONG spot + SHORT futures' : 'SHORT spot + LONG futures';
      const annualizedPercent = (opp.fundingRateAnnualized * 100).toFixed(1);
      
      message += `${i + 1}. ${arrow} <b>${opp.symbol}</b>\n`;
      message += `   💰 Rate: <b>${opp.fundingRatePercent}%</b> per 8h\n`;
      message += `   📊 Annualized: <b>${annualizedPercent}%</b> APR\n`;
      message += `   🎯 Action: ${action}\n`;
      message += `   📈 Volume: $${(opp.volume24hUSDT / 1000000).toFixed(1)}M\n`;
      message += `\n`;
    });

    if (opportunities.length > 5) {
      message += `📋 ... and ${opportunities.length - 5} more opportunities\n`;
    }

    return message.trim();
  }

  /**
   * Format trade execution alert
   */
  formatTradeAlert(trade) {
    const { symbol, action, quantity, spotPrice, futuresPrice, fundingRate } = trade;
    
    let message = `🤖 <b>TRADE EXECUTED</b>\n`;
    message += `⏰ ${new Date().toLocaleString('vi-VN')}\n\n`;
    message += `💎 <b>${symbol}</b>\n`;
    message += `📊 Action: ${action}\n`;
    message += `💰 Quantity: ${quantity}\n`;
    message += `📈 Spot Price: $${spotPrice}\n`;
    message += `📉 Futures Price: $${futuresPrice}\n`;
    message += `💵 Funding Rate: ${(fundingRate * 100).toFixed(4)}% per 8h\n`;
    message += `🎯 Expected APR: ${(fundingRate * 365 * 24 / 8 * 100).toFixed(1)}%\n`;

    return message.trim();
  }

  /**
   * Format position close alert
   */
  formatCloseAlert(position) {
    const { symbol, entryPrice, exitPrice, fundingEarned, pnl, pnlPercent, duration } = position;
    const pnlIcon = pnl >= 0 ? '🟢' : '🔴';
    
    let message = `${pnlIcon} <b>POSITION CLOSED</b>\n`;
    message += `⏰ ${new Date().toLocaleString('vi-VN')}\n\n`;
    message += `💎 <b>${symbol}</b>\n`;
    message += `📍 Entry: $${entryPrice}\n`;
    message += `🎯 Exit: $${exitPrice}\n`;
    message += `💰 Funding Earned: $${fundingEarned.toFixed(2)}\n`;
    message += `${pnlIcon} Total P&L: $${pnl.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)\n`;
    message += `⏱️  Duration: ${duration}\n`;

    return message.trim();
  }

  /**
   * Format daily summary
   */
  formatDailySummary(summary) {
    const { totalPnl, totalFunding, tradesCount, winRate, activePositions } = summary;
    const pnlIcon = totalPnl >= 0 ? '🟢' : '🔴';
    
    let message = `📊 <b>DAILY SUMMARY</b>\n`;
    message += `📅 ${new Date().toLocaleDateString('vi-VN')}\n\n`;
    message += `${pnlIcon} Total P&L: $${totalPnl.toFixed(2)}\n`;
    message += `💰 Funding Earned: $${totalFunding.toFixed(2)}\n`;
    message += `📈 Trades: ${tradesCount}\n`;
    message += `🎯 Win Rate: ${winRate.toFixed(1)}%\n`;
    message += `📊 Active Positions: ${activePositions}\n`;

    return message.trim();
  }

  /**
   * Send opportunity alert
   */
  async notifyOpportunities(opportunities) {
    const message = this.formatOpportunityAlert(opportunities);
    return await this.sendMessage(message);
  }

  /**
   * Send trade execution alert
   */
  async notifyTrade(trade) {
    const message = this.formatTradeAlert(trade);
    return await this.sendMessage(message);
  }

  /**
   * Send position close alert
   */
  async notifyClose(position) {
    const message = this.formatCloseAlert(position);
    return await this.sendMessage(message);
  }

  /**
   * Send daily summary
   */
  async notifyDailySummary(summary) {
    const message = this.formatDailySummary(summary);
    return await this.sendMessage(message);
  }

  /**
   * Send error alert
   */
  async notifyError(error) {
    const message = `❌ <b>ERROR</b>\n${error}`;
    return await this.sendMessage(message);
  }
}

module.exports = TelegramNotifier;
