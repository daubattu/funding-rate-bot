# Funding Rate Arbitrage Bot - Quick Start

## Setup (5 minutes)

### 1. Install
```bash
npm install
```

### 2. Configure
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Get API Keys

**Binance:**
1. Go to https://www.binance.com/en/my/settings/api-management
2. Create new API key
3. Enable **Spot Trading** + **Futures Trading**
4. Copy API Key + Secret to `.env`

**Telegram:**
1. Message @BotFather on Telegram
2. Create new bot: `/newbot`
3. Copy bot token to `.env`
4. Get your chat ID from @userinfobot
5. Add to `.env`

### 4. Run
```bash
npm start
```

## How It Works

1. **Scan**: Bot scans funding rates every 60s
2. **Alert**: Notifies you of high funding rates
3. **Trade**: Auto opens hedge positions (spot + futures)
4. **Earn**: Collects funding every 8h
5. **Close**: Auto closes at target profit

## Safety

- Start with small position ($100-500)
- Bot uses delta-neutral hedging (no price risk)
- All trades are reversible
- Can stop anytime (Ctrl+C)

## Expected Returns

- **Conservative**: 10-20% APR
- **Moderate**: 20-40% APR  
- **Aggressive**: 40-100%+ APR

Depends on market conditions and funding rates.

## Support

If bot not working:
1. Check API keys have trading permission
2. Check balance in both spot & futures wallet
3. Check Telegram bot is configured
4. Read full README.md

Good luck! 🚀
