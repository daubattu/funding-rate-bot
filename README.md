# 💰 Funding Rate Arbitrage Bot

Bot tự động **arbitrage funding rate** trên Binance - chiến lược delta neutral với rủi ro thấp, lợi nhuận ổn định.

## 🎯 Chiến lược

**Funding Rate Arbitrage (Delta Neutral Hedging)**

- **Long Spot + Short Futures** khi funding rate > 0 (longs pay shorts)
- **Short Spot + Long Futures** khi funding rate < 0 (shorts pay longs)
- Vị thế hedge 100% → Không có rủi ro giá
- Lợi nhuận từ funding rate (mỗi 8h)
- APR thực tế: 10-50%+ (tùy thị trường)

## ✅ Tính năng

- **Auto Scanner**: Tự động quét 100+ coins, tìm funding rate cao nhất
- **Smart Executor**: Tự động mở/đóng vị thế hedge trên spot + futures
- **Risk Management**: 
  - Delta neutral hedging
  - Auto rebalance khi lệch quá 1%
  - Take profit khi funding tích lũy đạt target
  - Stop loss khẩn cấp 2% (nếu hedge bị phá vỡ)
- **Realtime Monitoring**: Theo dõi funding rate 24/7
- **Telegram Alerts**: Thông báo mọi giao dịch và P&L
- **Position Manager**: Quản lý nhiều positions đồng thời

## 📋 Yêu cầu

- Node.js v18+
- Binance Account với API keys (quyền Spot + Futures trading)
- Telegram Bot (cho notifications)
- Vốn tối thiểu: $200 (khuyến nghị $1000+)

## 🚀 Cài đặt

### 1. Clone và cài dependencies

```bash
cd funding-rate-bot
npm install
```

### 2. Cấu hình API Keys

Copy `.env.example` thành `.env`:

```bash
cp .env.example .env
```

Chỉnh sửa `.env`:

```env
# Binance API Keys (BẮT BUỘC)
BINANCE_API_KEY=your_api_key_here
BINANCE_API_SECRET=your_api_secret_here

# Telegram Bot (BẮT BUỘC)
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=@your_channel_or_id

# Trading Config
FUNDING_RATE_THRESHOLD=0.001  # 0.1% per 8h minimum
MIN_POSITION_SIZE_USDT=100
MAX_POSITION_SIZE_USDT=10000
MAX_ACTIVE_POSITIONS=5

# Risk Management  
TAKE_PROFIT_FUNDING=0.005     # Take profit at 0.5% funding
REBALANCE_THRESHOLD=0.01      # Rebalance if delta > 1%
```

### 3. Tạo Binance API Keys

1. Vào https://www.binance.com/en/my/settings/api-management
2. Tạo API key mới
3. **Quan trọng**: Enable cả **Spot** và **Futures** trading
4. **Whitelist IP** nếu có thể (bảo mật)
5. **KHÔNG** enable Withdrawal

### 4. Chạy bot

```bash
npm start
```

## 📊 Cách hoạt động

### 1. Scanning (Mỗi 60 giây)
Bot quét tất cả perpetual futures trên Binance:
- Lấy funding rate hiện tại
- Lọc coins có volume > $10M/24h
- Tìm funding rate >= 0.1% per 8h
- Sort theo funding rate cao nhất

### 2. Auto Trading
Khi tìm thấy opportunity:
- Tính toán position size phù hợp
- Mở vị thế ĐỒNG THỜI:
  - Spot: BUY/SELL coin
  - Futures: SELL/BUY coin (ngược lại)
- Vị thế hoàn toàn hedge → Delta = 0

### 3. Position Management
- Monitor funding rate realtime
- Nhận funding mỗi 8h
- Auto rebalance nếu cần
- Close khi:
  - Funding tích lũy đạt target (0.5%)
  - Funding rate đảo chiều
  - Emergency stop loss

## 📝 Ví dụ Trade

**Scenario: BTC funding rate = +0.15% per 8h**

```
🎯 Opening Position: BTCUSDT

📊 Action: LONG spot + SHORT futures
💰 Position Size: $1000

Spot Order:
   BUY 0.0146 BTC @ $68,500 = $1000

Futures Order:
   SELL 0.0146 BTC @ $68,520 = $1000 (SHORT)

💵 Funding: +0.15% per 8h = +$1.50 every 8h
📈 Expected APR: 16.4% (if maintained)

After 7 days (21 funding periods):
   Funding earned: 21 × $1.50 = $31.50
   ROI: 3.15%
   Annualized: ~164%
```

**Auto Close khi:**
- Funding tích lũy: $5 (0.5%) ✅
- Hoặc funding rate < 0.05%
- Hoặc manual close

## 🎨 Telegram Alerts

Bot sẽ gửi thông báo:

**Opportunities Found:**
```
🎯 FUNDING RATE OPPORTUNITIES
⏰ 16/02/2026, 10:30:00

1. 📈 BTCUSDT
   💰 Rate: 0.1500% per 8h
   📊 Annualized: 16.4% APR
   🎯 Action: LONG spot + SHORT futures
   📈 Volume: $45.2M

2. 📈 ETHUSDT
   💰 Rate: 0.1200% per 8h
   ...
```

**Trade Executed:**
```
🤖 TRADE EXECUTED
⏰ 16/02/2026, 10:35:00

💎 BTCUSDT
📊 Action: LONG spot + SHORT futures
💰 Quantity: 0.0146
📈 Spot Price: $68,500
📉 Futures Price: $68,520
💵 Funding Rate: 0.1500% per 8h
🎯 Expected APR: 16.4%
```

**Position Closed:**
```
🟢 POSITION CLOSED
⏰ 16/02/2026, 18:00:00

💎 BTCUSDT
📍 Entry: $68,500
🎯 Exit: $68,480
💰 Funding Earned: $5.25
🟢 Total P&L: $5.10 (+0.51%)
⏱️  Duration: 7h 25m
```

## ⚠️ Risk Management

### Rủi ro chính
1. **Execution Risk**: Giá thay đổi giữa 2 lệnh (spot & futures)
   - **Giải pháp**: Execute ĐỒNG THỜI
   
2. **Funding Rate Reversal**: Funding đảo chiều
   - **Giải pháp**: Auto close khi funding < 0

3. **Liquidation Risk**: Margin không đủ (futures)
   - **Giải pháp**: Position size nhỏ, margin dư thừa

4. **Exchange Risk**: Binance down/hack
   - **Giải pháp**: Không để quá nhiều tiền, withdraw thường xuyên

### Best Practices
- Bắt đầu với position size nhỏ ($100-500)
- Test trên testnet trước
- Monitor bot thường xuyên (đặc biệt 3 ngày đầu)
- Không dùng >50% vốn
- Withdraw lợi nhuận định kỳ

## 🛠️ Troubleshooting

### Bot không mở positions?

- Kiểm tra API keys có quyền trading chưa
- Kiểm tra balance đủ không (cả spot & futures)
- Kiểm tra funding rate threshold (có thể tăng để test)

### Lỗi "Insufficient balance"?

- Cần có USDT ở cả spot VÀ futures wallet
- Chuyển một nửa vốn sang futures wallet

### Positions không close?

- Kiểm tra take profit threshold
- Manual close: Sửa code hoặc close trực tiếp trên Binance

### Alert không gửi Telegram?

- Kiểm tra bot token và chat ID
- Bot phải là admin của channel (nếu dùng channel)

## 📚 Dependencies

- `binance-api-node`: Binance API client
- `axios`: HTTP requests
- `ws`: WebSocket cho realtime data
- `node-telegram-bot-api`: Telegram integration
- `chalk`: Terminal colors
- `cli-table3`: Pretty tables

## 🔧 Advanced

### Test Mode

Set `TESTNET=true` trong `.env` để test mà không execute trades thật.

### Custom Strategy

Sửa trong `config.js`:
- `fundingRateThreshold`: Threshold tối thiểu
- `takeProfitFunding`: Target lợi nhuận
- `maxActivePositions`: Số positions tối đa

### Backtest

```bash
npm run backtest
```

(Feature đang phát triển)

## ⚠️ Disclaimer

- Bot này mang tính chất học tập và nghiên cứu
- Crypto trading có rủi ro cao
- Không phải lời khuyên tài chính
- Test kỹ trước khi dùng tiền thật
- Chỉ dùng số tiền bạn có thể mất
- Tác giả không chịu trách nhiệm về losses

## 📄 License

MIT License

---

**Made with ❤️ for the crypto arbitrage community**

DYOR - Do Your Own Research 🚀
