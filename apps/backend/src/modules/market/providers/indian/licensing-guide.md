# TRADEGRID — Indian Market Data Licensing & Regulatory Compliance Guide

**Document Purpose:** Defines regulatory, licensing, and architectural compliance rules for integrating National Stock Exchange of India (NSE) and Bombay Stock Exchange (BSE) market data into the TRADEGRID virtual simulation platform.

---

## 1. Regulatory Context (SEBI Compliance Framework)

Under Securities and Exchange Board of India (SEBI) guidelines and circulars regarding virtual trading, financial education, and algorithmic trading simulators:

1. **Virtual Trading Invariant:**
   - TRADEGRID is strictly a virtual simulation, quantitative research, and paper-trading education platform.
   - Zero real-money accounts, real broker order routing, or monetary exchange transactions are supported or permitted.
   - Virtual wallet balances ($100,000 virtual grant) hold strictly zero monetary or redemption value.

2. **Deception & Misrepresentation Prevention:**
   - Platforms must never present simulated prices as "official live exchange data" without licensing.
   - All quotes, charts, and tape tickers must display their source provenance badge:
     - `SIMULATED`: Generated via deterministic liquidity engines and market-making bots.
     - `DELAYED`: Compliant delayed exchange feed (minimum 15-minute delay).
     - `LICENSED_LIVE`: Direct authorized exchange feed with verified redistribution license.
     - `HISTORICAL`: Historical EOD / intraday candle archive.

3. **Algorithm & Backtesting Safety:**
   - DSL strategies execute purely against virtual wallets, virtual order books, and in-memory matching engines.
   - Under no circumstances does the strategy runner transmit signals or orders to external broker APIs (e.g. Zerodha, Angel One, Upstox) or live exchange gateways.

---

## 2. National Stock Exchange (NSE) Market Data Policies

To redistribute real-time or delayed NSE data, organizations must execute an **NSE Market Data Redistribution Agreement**:

### Feed Levels
- **Level 1 (Snapshot / Ticker):**
  - Last Traded Price (LTP), change, volume, best bid/ask.
  - Suitable for overview dashboards and watchlists.
- **Level 2 (Market Depth / DOM):**
  - Top 5 bids and asks with order counts and quantities.
  - Required for realistic simulated order book matching.
- **Level 3 (Order by Order):**
  - Full tick-by-tick order stream; not required for TRADEGRID educational tier.

### Licensing Types
1. **Real-Time Data License:**
   - Incurs annual exchange fees and per-user monthly terminal royalties.
   - **TRADEGRID Default:** Real-time live feeds remain **strictly disabled** in default configurations ($0 budget guarantee).
2. **15-Minute Delayed Feed:**
   - Permitted under delayed redistribution agreements with lower licensing overhead.
   - Timestamp must explicitly show the delay and exchange timestamp.
3. **End-of-Day (EOD) Historical Data:**
   - Used for quantitative strategy backtesting and technical chart history.

---

## 3. Bombay Stock Exchange (BSE) Data Feed Agreement

- BSE requires execution of the **BSE Datafeed Agreement** for commercial or web redistribution.
- BSE securities are indexed by unique 6-digit Security Codes (e.g., `500325` for Reliance, `532540` for TCS).
- TRADEGRID provides bidirectional symbol translation between NSE tickers (`RELIANCE-EQ`) and BSE scrip codes (`500325`).

---

## 4. Platform Architectural Safeguards

1. **Default-Safe Provider Selection:**
   - If licensed credentials (`NSE_FEED_API_KEY`, `NSE_FEED_SECRET`, `NSE_LICENSE_ID`) are omitted or unvalidated, `ProductionIndianFeedAdapter` remains disabled.
   - The platform automatically routes all market data requests to `MockIndianFeedAdapter` or `SimulatedMarketDataProvider`.
2. **IST Timezone Discipline:**
   - All session decisions (Pre-open, Regular, Post-close, Market Holidays) are strictly evaluated against Indian Standard Time (IST, UTC+05:30).
3. **Tick Size & Lot Size Integrity:**
   - Equities adhere to standard ₹0.05 tick size.
   - Lot sizes and circuit limit bounds (±10% default) prevent unrealistic price jumps.
