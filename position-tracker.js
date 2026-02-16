class PositionTracker {
  constructor() {
    this.closedPositions = [];
    this.totalTrades = 0;
    this.totalProfit = 0;
    this.totalLoss = 0;
    this.totalFundingEarned = 0;
    this.winCount = 0;
    this.lossCount = 0;
  }

  /**
   * Record closed position
   */
  recordClosedPosition(position) {
    this.closedPositions.push({
      ...position,
      recordedAt: Date.now()
    });

    this.totalTrades++;
    
    const pnl = position.pnl.total;
    if (pnl > 0) {
      this.totalProfit += pnl;
      this.winCount++;
    } else {
      this.totalLoss += Math.abs(pnl);
      this.lossCount++;
    }

    this.totalFundingEarned += position.fundingEarned;
  }

  /**
   * Get statistics
   */
  getStats() {
    const winRate = this.totalTrades > 0 ? (this.winCount / this.totalTrades) * 100 : 0;
    const netProfit = this.totalProfit - this.totalLoss;
    const profitFactor = this.totalLoss > 0 ? this.totalProfit / this.totalLoss : this.totalProfit;

    return {
      totalTrades: this.totalTrades,
      winCount: this.winCount,
      lossCount: this.lossCount,
      winRate,
      totalProfit: this.totalProfit,
      totalLoss: this.totalLoss,
      netProfit,
      profitFactor,
      totalFundingEarned: this.totalFundingEarned,
      avgProfitPerTrade: this.totalTrades > 0 ? netProfit / this.totalTrades : 0
    };
  }

  /**
   * Get daily summary
   */
  getDailySummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const todayPositions = this.closedPositions.filter(
      p => p.closeTime >= todayTimestamp
    );

    const totalPnl = todayPositions.reduce((sum, p) => sum + p.pnl.total, 0);
    const totalFunding = todayPositions.reduce((sum, p) => sum + p.fundingEarned, 0);
    const wins = todayPositions.filter(p => p.pnl.total > 0).length;
    const winRate = todayPositions.length > 0 ? (wins / todayPositions.length) * 100 : 0;

    return {
      date: today,
      tradesCount: todayPositions.length,
      totalPnl,
      totalFunding,
      winRate,
      positions: todayPositions
    };
  }

  /**
   * Print statistics table
   */
  printStats() {
    const stats = this.getStats();
    
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                   📊 TRADING STATISTICS                   ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    
    console.log(`📈 Total Trades:       ${stats.totalTrades}`);
    console.log(`✅ Wins:               ${stats.winCount}`);
    console.log(`❌ Losses:             ${stats.lossCount}`);
    console.log(`🎯 Win Rate:           ${stats.winRate.toFixed(1)}%`);
    console.log('');
    console.log(`💰 Total Profit:       $${stats.totalProfit.toFixed(2)}`);
    console.log(`💸 Total Loss:         $${stats.totalLoss.toFixed(2)}`);
    console.log(`📊 Net Profit:         $${stats.netProfit.toFixed(2)}`);
    console.log(`⚖️  Profit Factor:     ${stats.profitFactor.toFixed(2)}`);
    console.log('');
    console.log(`💵 Funding Earned:     $${stats.totalFundingEarned.toFixed(2)}`);
    console.log(`📊 Avg Per Trade:      $${stats.avgProfitPerTrade.toFixed(2)}`);
    console.log('');
  }

  /**
   * Get recent positions
   */
  getRecentPositions(limit = 10) {
    return this.closedPositions
      .sort((a, b) => b.closeTime - a.closeTime)
      .slice(0, limit);
  }

  /**
   * Export to JSON
   */
  exportToJSON() {
    return {
      stats: this.getStats(),
      positions: this.closedPositions
    };
  }
}

module.exports = PositionTracker;
