require('dotenv').config();

module.exports = {
  // Exchange APIs
  exchanges: {
    binance: {
      apiKey: process.env.BINANCE_API_KEY,
      apiSecret: process.env.BINANCE_API_SECRET,
      enabled: true
    },
    bingx: {
      apiKey: process.env.BINGX_API_KEY,
      apiSecret: process.env.BINGX_API_SECRET,
      enabled: process.env.BINGX_API_KEY && process.env.BINGX_API_KEY !== 'your_bingx_api_key_here'
    }
  },
  
  // Enabled exchanges (from .env)
  enabledExchanges: process.env.ENABLED_EXCHANGES 
    ? process.env.ENABLED_EXCHANGES.split(',').map(e => e.trim())
    : ['binance'],
    
  testnet: process.env.TESTNET === 'true',

  // Legacy binance config (for backward compatibility)
  binance: {
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    testnet: process.env.TESTNET === 'true',
    baseUrl: process.env.TESTNET === 'true' 
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com',
    spotBaseUrl: 'https://api.binance.com'
  },

  // Telegram
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
  },

  // Trading Strategy
  strategy: {
    fundingRateThreshold: parseFloat(process.env.FUNDING_RATE_THRESHOLD) || 0.001, // 0.1% per 8h
    minPositionSizeUSDT: parseFloat(process.env.MIN_POSITION_SIZE_USDT) || 100,
    maxPositionSizeUSDT: parseFloat(process.env.MAX_POSITION_SIZE_USDT) || 10000,
    maxActivePositions: parseInt(process.env.MAX_ACTIVE_POSITIONS) || 5,
    takeProfitFunding: parseFloat(process.env.TAKE_PROFIT_FUNDING) || 0.005, // 0.5%
    stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT) || 0.02, // 2%
    rebalanceThreshold: parseFloat(process.env.REBALANCE_THRESHOLD) || 0.01 // 1%
  },

  // Scanning
  scanning: {
    intervalSeconds: parseInt(process.env.SCAN_INTERVAL_SECONDS) || 60,
    minVolume24hUSDT: parseFloat(process.env.MIN_VOLUME_24H_USDT) || 10000000 // $10M
  },

  // Funding rate schedule (Binance: every 8h at 00:00, 08:00, 16:00 UTC)
  fundingSchedule: {
    intervalHours: 8,
    times: ['00:00', '08:00', '16:00'] // UTC
  }
};
