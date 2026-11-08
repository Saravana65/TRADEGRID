# TRADEGRID — Official User Onboarding & Trader Manual

Welcome to **TRADEGRID**, an institutional-grade virtual trading simulator and quantitative research platform designed for students, quantitative researchers, and active traders.

---

## 1. MANDATORY REGULATORY & VIRTUAL TRADING DISCLAIMER

> [!IMPORTANT]
> **100% VIRTUAL SIMULATION — ZERO MONETARY VALUE**  
> TRADEGRID is strictly a financial education and quantitative simulation environment. All currency balances (including the initial \$100,000 grant), orders, executions, trades, and portfolio positions are completely fictional and hold **zero real-world cash or monetary value**.
> 
> TRADEGRID does not connect to real brokerage accounts, does not accept customer fiat deposits or withdrawals, and does not route orders to live financial exchanges. All trading is strictly simulated ($0 / ₹0 financial cost).

---

## 2. Platform Architecture Overview

TRADEGRID is architected as an event-driven modular monolith engineered to deliver institutional execution speed on zero additional paid cloud infrastructure:

- **Order Matching Engine**: In-memory, price-time priority limit order books processing orders with sub-100ms latency.
- **Double-Entry Ledger**: Authoritative multi-currency financial accounting guaranteeing mathematical balance across every trade:
  $$\text{Total Debits} \equiv \text{Total Credits}$$
- **Real-Time WebSocket Streams**: Monotonically sequenced Socket.IO feeds broadcasting L2 order book depth, trade executions, portfolio updates, and chat messages.
- **Quantitative Strategy Studio**: Domain-Specific Language (DSL) parser, backtesting engine, and automated background trading runner.
- **Multiplayer Competitions & Gamification**: Real-time tournament leaderboards, dynamic XP progression, and 25 server-verified trader achievements.

---

## 3. Step-by-Step Trader Journey

### Step 1: Account Creation & Initial Capital Grant
- Register with your username, email, and a secure password.
- Upon registration, your virtual account is immediately funded with **\$100,000.00 virtual USD** via a balanced system issuance transaction:
  - **Debit**: User Virtual Cash Account (+\$100,000)
  - **Credit**: System Equity Issuance Account (+\$100,000)
- You can inspect your real-time wallet balance and double-entry ledger statements at `GET /api/v1/wallet/summary`.

### Step 2: Exploring Instruments & Provenance Tags
TRADEGRID supports two distinct classes of instruments, each clearly tagged with provable data provenance:
1. **Simulated Instruments** (`SIMULATED`):
   - Example tickers: `TGRID` (TradeGrid Systems), `SOLARIS` (Clean Energy), `NEXUS` (Cloud Infrastructure), `AERO`, `BIOGEN`.
   - Continuous price simulation driven by autonomous market-making bots and liquidity generators.
2. **Indian Equities Reference Catalog** (`REAL` / `HISTORICAL`):
   - Top NSE/BSE symbols: `NSE:RELIANCE` (₹0.05 tick size), `NSE:TCS`, `NSE:INFY`, `NSE:HDFCBANK`, `NSE:ICICIBANK`.
   - Integrated with Indian trading session rules (IST 09:15 - 15:30) and strict anti-lookahead protection.

### Step 3: Placing Virtual Orders
Submit virtual orders via the Order Management System (OMS):
- **Limit Orders**: Specify quantity and limit price (`timeInForce: 'GTC' | 'IOC'`). Cash or shares are pre-trade reserved.
- **Market Orders**: Executed immediately against resting counter-party orders in the matching engine.
- **Risk Invariants**:
  - Buying power is strictly validated against uncommitted cash.
  - Short sales are validated against existing portfolio holdings.
  - Open limit orders can be cancelled anytime with instant release of reserved capital.

### Step 4: Real-Time Market Depth & Live Feeds
Connect to Socket.IO (`/socket.io`) to stream real-time market data:
- `orderbook:depth_update`: Incremental L2 order book updates with sequence tracking.
- `trade:tape_update`: Real-time public trade prints.
- `portfolio:updated`: Instant portfolio PnL and position updates on personal executions.

### Step 5: Quantitative Strategy Scripting (DSL)
Create algorithmic strategies in the Strategy Studio using TRADEGRID DSL:

```dsl
strategy "Moving Average Crossover"
description "9/21 EMA crossover strategy on 15m candles"
instrument "TGRID"
timeframe "15m"

indicator fast = EMA(close, 9)
indicator slow = EMA(close, 21)
indicator rsi14 = RSI(close, 14)

entry:
    fast crosses_above slow and rsi14 < 70

exit:
    fast crosses_below slow or rsi14 > 80

risk:
    stop_loss = 2%
    take_profit = 6%
    max_position_size = 15%
```

- **Backtest Engine**: Evaluate strategies over historical candles with zero look-ahead bias, computing Sharpe Ratio, Sortino Ratio, Maximum Drawdown, and Win Rate.
- **Background Runner**: Activate strategies as background automated jobs that process live candle ticks, respect strict daily loss limits, and trip circuit breakers on consecutive anomalies.

### Step 6: Multiplayer Competitions & Trader Achievements
- **Competitions**: Enter timed trading tournaments with isolated virtual portfolios. Track your rank in real-time on leaderboards.
- **Achievements & Badges**: Unlock badges by hitting real milestones (First Trade, Century Trader, Quant Prodigy, Risk Manager). Earn XP to rise from *Novice* to *Grandmaster*.

### Step 7: Social Trader Chat & Mentions
- **Global Trader Chat**: Exchange ideas and market sentiment with fellow virtual traders.
- **Symbol Rooms**: Dedicated chat channels for individual symbols (e.g., `#TGRID`, `#RELIANCE`).
- **Direct Messaging**: 1-on-1 private messaging with unread notification badges.

---

## 4. Onboarding Proficiency Checklist

Track your progress through the platform:
- [x] Account Created & Virtual Wallet Grant Claimed (\$100,000 USD)
- [ ] Mandatory Virtual Trading Disclaimer Acknowledged
- [ ] First Market Quote & L2 Order Book Inspected
- [ ] First Virtual Limit Order Placed
- [ ] First Trade Execution & Portfolio Position Settled
- [ ] First Quantitative Strategy Backtested
- [ ] First Multiplayer Trading Tournament Joined
- [ ] First Trader Achievement Unlocked

---

## 5. Technical Support & Beta Feedback

If you experience bugs, UI glitches, or performance issues during the controlled beta:
- Use the in-app feedback dialog or submit via `POST /api/v1/beta/feedback`.
- Include browser information and reproduction steps.
- All feedback is reviewed directly by the development engineering team.
