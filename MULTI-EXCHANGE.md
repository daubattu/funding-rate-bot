# Multi-Exchange Support

Bot hiện hỗ trợ **nhiều sàn** để scan funding rates và trade:

## Supported Exchanges

- ✅ **Binance** - Sàn chính
- ✅ **BingX** - Sàn phụ (optional)
- 🔜 **Bybit**, **OKX**, **Gate.io** (coming soon)

## Setup BingX

### 1. Tạo API Keys trên BingX

1. Đăng nhập [BingX](https://bingx.com)
2. Vào **Account Settings** → **API Management**
3. Tạo API key mới với permissions:
   - ✅ **Enable Reading** (bắt buộc)
   - ✅ **Enable Spot & Margin Trading** (nếu trade spot)
   - ✅ **Enable Futures** (nếu trade futures)
   - ❌ **Withdrawals** (không cần)

4. Copy **API Key** và **Secret Key**

### 2. Cập nhật .env

```bash
# BingX API Keys
BINGX_API_KEY=your_actual_bingx_api_key
BINGX_API_SECRET=your_actual_bingx_secret_key

# Enabled Exchanges
ENABLED_EXCHANGES=binance,bingx
```

### 3. Test kết nối

```bash
npm start
```

Bot sẽ tự động:
- ✅ Initialize cả Binance và BingX
- ✅ Scan funding rates từ cả 2 sàn
- ✅ Merge và sort opportunities
- ✅ Trade trên sàn nào có opportunity tốt

## Nếu không có BingX API

Bot sẽ **tự động disable BingX** và chỉ dùng Binance:

```bash
# .env
BINGX_API_KEY=your_bingx_api_key_here  # Placeholder value
ENABLED_EXCHANGES=binance,bingx        # BingX sẽ tự skip
```

Output:
```
🏦 Initializing exchanges: binance, bingx
✅ binance: Initialized
⚠️  bingx: Skipped (not configured or disabled)
```

## Trading Logic

Bot sẽ:
1. **Scan** từ tất cả exchanges (parallel)
2. **Merge** opportunities từ các sàn
3. **Sort** theo funding rate cao nhất
4. **Trade** trên exchange tương ứng với mỗi opportunity

Example:
```
📊 TOP 10 HIGHEST POSITIVE FUNDING RATES:
1. 📈 BTCUSDT (BINANCE)
   Rate: 0.0150% per 8h | Annualized: 16.42%
   
2. 📈 ETHUSDT (BINGX)
   Rate: 0.0145% per 8h | Annualized: 15.87%
```

## Advanced: Thêm Exchange khác

Bot sử dụng **CCXT** library, support 100+ exchanges. Để thêm:

### 1. Update config.js

```javascript
exchanges: {
  binance: { ... },
  bingx: { ... },
  bybit: {
    apiKey: process.env.BYBIT_API_KEY,
    apiSecret: process.env.BYBIT_API_SECRET,
    enabled: process.env.BYBIT_API_KEY && process.env.BYBIT_API_KEY !== 'your_bybit_api_key_here'
  }
}
```

### 2. Update .env

```bash
BYBIT_API_KEY=your_api_key
BYBIT_API_SECRET=your_secret
ENABLED_EXCHANGES=binance,bingx,bybit
```

### 3. Restart bot

```bash
npm start
```

## Troubleshooting

### BingX không connect

- ✅ Check API key permissions
- ✅ Check IP whitelist (nếu có)
- ✅ Verify API key chưa expire

### Funding rates không khớp

- Mỗi sàn có **schedule riêng** cho funding:
  - Binance: 00:00, 08:00, 16:00 UTC (8h)
  - BingX: 00:00, 08:00, 16:00 UTC (8h)
  - Bybit: 00:00, 08:00, 16:00 UTC (8h)

### Volume filter

Bot filter theo `MIN_VOLUME_24H_USDT`, nhưng **mỗi sàn có volume khác nhau**:
- Binance: Volume cao nhất (thường $100M+)
- BingX: Volume thấp hơn (khoảng $10M+)

## Benefits of Multi-Exchange

✅ **Nhiều opportunities hơn** - Không bị giới hạn 1 sàn  
✅ **Diversification** - Phân tán risk  
✅ **Better rates** - Chọn sàn nào có funding rate tốt nhất  
✅ **Redundancy** - Nếu 1 sàn down, vẫn dùng được sàn khác

## Notes

⚠️ **Spot account limitations:**
- Chỉ trade khi funding rate **DƯƠNG** (+)
- Không thể SHORT spot (cần Margin Account)
- Cả Binance và BingX đều hỗ trợ Spot + Futures hedge

⚠️ **Minimum notional:**
- Binance: ~$5-10 USDT
- BingX: ~$5 USDT
- Configure `MIN_POSITION_SIZE_USDT` phù hợp

💡 **Recommended setup:**
- Start với **Binance only** để test
- Sau đó thêm BingX khi đã familiar
- Keep `MAX_ACTIVE_POSITIONS=1-2` lúc đầu
