# TRADEGRID — Changelog & Milestone Release Notes

All notable changes to the TRADEGRID platform are documented in this file.
The project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0-rc.1] - 2026-11-09
### Release Candidate 1 — Production Hardening & Beta Launch

#### Summary
TRADEGRID reaches **Release Candidate 1** following 12 complete, sequentially verified development phases. The system is an institutional-grade, zero-cost ($0 / ₹0 paid cloud infrastructure), event-driven virtual trading and quantitative research platform designed for 100 concurrent users.

---

### Phase 12: Controlled Beta Launch & Release Management
- **Controlled Beta Environment (`Phase 12A`)**:
  - Implemented `BetaEnvironmentService` with configurable feature flags: `VIRTUAL_TRADING_ONLY` (immutable safety invariant), `INDIAN_EQUITIES_ENABLED`, `STRATEGY_STUDIO_ENABLED`, `BACKGROUND_RUNNERS_ENABLED`, `COMPETITIONS_ENABLED`, `ACHIEVEMENTS_ENABLED`, `GLOBAL_CHAT_ENABLED`, and `BETA_FEEDBACK_ENABLED`.
  - Added deterministic hash-based user cohort percentage rollout.
  - Added `/api/v1/beta/status` and `/api/v1/beta/feedback` telemetry endpoints.
- **User Onboarding & Documentation (`Phase 12B`)**:
  - Authored comprehensive `docs/ONBOARDING_GUIDE.md` covering the 7-step trader journey.
  - Added `/api/v1/onboarding/guide`, `/api/v1/onboarding/checklist`, and `/api/v1/onboarding/acknowledge-disclaimer`.
- **Multi-Account Beta Verification (`Phase 12C`)**:
  - Completed end-to-end integration tests across 5 distinct trader personas (`alpha_maker`, `beta_taker`, `gamma_quant`, `delta_gamer`, `epsilon_social`).
  - Verified 100% mathematical double-entry balance with 0 discrepancies across all accounts.
- **Release Candidate Packaging (`Phase 12D`)**:
  - Version bump to `1.0.0-rc.1` across monorepo workspace packages.
  - Full production build verification.

---

### Phase 11: Production Infrastructure & Hardening
- **Production Architecture (`Phase 11A`)**:
  - Created `docker-compose.production.yml` with strict CPU/memory quotas and healthchecks.
  - Hardened Dockerfile with non-root unprivileged user `tradegrid`.
  - Production Nginx reverse proxy configuration supporting WebSocket upgrades and SPA fallback.
  - Implemented `InProcessCacheService` for $0 zero-external-cost caching with TTL.
- **Database & Background Infrastructure Hardening (`Phase 11B`)**:
  - Configured Knex connection pool (min 5, max 25, 10s acquire timeout, 30s idle timeout).
  - Implemented `withDeadlockRetry` with randomized exponential backoff and jitter on MySQL 1213/1205 errors.
  - Implemented `withTransactionTimeout` preventing lock exhaustion.
  - Implemented `HardenedJobQueue` with backpressure rejection (`QUEUE_CAPACITY_EXCEEDED`), 3-attempt exponential retry, Dead Letter Queue (DLQ), and graceful shutdown drain.
- **Security & Secrets Hardening (`Phase 11C`)**:
  - Implemented `validateProductionSecrets` checking secret lengths (>= 32 chars), rejecting dev strings, enforcing strong DB passwords and strict CORS origins.
  - Implemented tiered rate limiting in `rate-limiter.middleware.ts` (auth 5/min, orders 30/min, market 120/min, general 60/min) returning 429 and `Retry-After`.
  - Enforced refresh token rotation and family revocation on replay.
- **Monitoring, Backups & Disaster Recovery (`Phase 11D`)**:
  - Structured JSON logging with recursive PII sanitization in `logger.ts`.
  - Added `/health/liveness` and `/health/readiness` endpoints.
  - Automated database backup scripts (`backup-database.ts`, `backup-database.sh`) with `--single-transaction`, `--quick`, gzip compression, and 7-day retention.
  - Created `DISASTER_RECOVERY.md` runbook with RTO < 15 min and RPO < 24 hr.
- **Load & Performance Verification (`Phase 11E`)**:
  - Simulated 100 concurrent users across 4 personas (40 traders, 30 viewers, 20 quants, 10 runners).
  - Benchmark results: order placement p95 = 72.07ms (< 100ms SLA), market query p95 = 25.63ms (< 50ms SLA), DSL parsing p95 = 1.05ms (< 50ms SLA), memory growth = 3.20MB (< 100MB SLA), 0 ledger errors across all 100 accounts ($0 infrastructure cost).

---

### Phase 10: Indian Market Data Integration (NSE / BSE)
- **Market Data Provider Architecture (`Phase 10A`)**:
  - Pluggable `IMarketDataProvider` interface supporting `SimulatedMarketDataProvider`, `LicensedIndianMarketDataProvider`, and `HistoricalMarketDataProvider`.
  - Explicit data provenance tagging (`source: 'SIMULATED' | 'LICENSED_LIVE' | 'DELAYED' | 'HISTORICAL'`).
  - Automated fallback switching to simulator upon provider outage.
- **Indian Market Feed Adapter (`Phase 10B`)**:
  - `IndianSymbolMapper` supporting NSE/BSE symbol mapping (e.g., `RELIANCE` -> `NSE:RELIANCE-EQ`), ₹0.05 tick size, and standard lot sizes.
  - `IndianTradingHoursService` enforcing IST trading sessions (09:15 - 15:30) and exchange holidays.
  - Published comprehensive `licensing-guide.md` adhering to SEBI/NSE regulations.
- **Historical Market Data & Candle Engine (`Phase 10C`)**:
  - `CandleEngine` with fixed-precision arithmetic (1m base aggregated to 5m, 15m, 1h, 1d).
  - BigInt volume summation, gap forward-fill interpolation with 0 volume, and anti-lookahead filtering.
- **Real-Time Streaming & Stream Recovery (`Phase 10D`)**:
  - `MarketDataStreamManager` with exponential backoff and jitter.
  - Heartbeat watchdog (5s interval, 15s timeout), sequence gap detection, and deduplication.

---

### Phase 9: Custom User Strategy Scripting (DSL) & Studio
- **Custom DSL Grammar & Parser (`Phase 9A`)**:
  - Domain-Specific Language for quantitative trading strategies.
  - Lexer, tokenizer, recursive descent parser, and AST validation engine.
  - Built-in indicators: SMA, EMA, RSI, MACD, Bollinger Bands, Stochastic, VWAP.
  - Anti-injection security validation rejecting prototype pollution and unsafe identifiers.
- **Sandboxed Strategy Execution Engine (`Phase 9B`)**:
  - Isolated evaluation loop with strict execution time limits and anti-lookahead guarantee.
- **Strategy Studio UI & Visual Builder (`Phase 9C`)**:
  - Interactive visual rule builder compiling to DSL scripts.
- **Background Strategy Runner (`Phase 9D`)**:
  - Automated virtual trading jobs processing real-time candle ticks with daily loss limits and circuit breakers.

---

### Phase 8: Trader Achievements & Gamification Engine
- 25 server-authoritative achievements across Trading, Backtesting, Competitions, and Learning.
- Monotonic XP progression system with 6 trader titles (Novice to Grandmaster).
- Real-time achievement unlock event broadcasting over WebSocket.

---

### Phase 7: Advanced Technical Charting
- TradingView Lightweight Charts integration with custom indicators (SMA, EMA, RSI, MACD, Bollinger Bands).
- Derived Volume Profile Engine calculating Point of Control (POC), Value Area High (VAH), and Value Area Low (VAL).
- Server-authoritative chart preference persistence per user.

---

### Phase 6: AI Trading Insights & Quantitative Backtesting Engine
- Quantitative backtesting engine computing Sharpe Ratio, Sortino Ratio, Max Drawdown, CAGR, and Win Rate.
- Anti-lookahead bias guarantee: bar-by-bar chronological execution.
- Deterministic contextual AI insights provider operating at $0 cost without external paid LLM APIs.

---

### Phase 5: Multiplayer Competitions, Bots & Social Infrastructure
- **Real-Time WebSocket Engine (`Phase 5A`)**: Sequence tracking, private user rooms, and L2 depth broadcasting.
- **Autonomous Market-Making Bots (`Phase 5B`)**: Inventory-aware spread skewing and simulated liquidity.
- **Portfolio & Realized PnL Engine (`Phase 5C`)**: Weighted average cost accounting and portfolio valuation.
- **Multiplayer Trading Competitions (`Phase 5D`)**: Timed tournaments with isolated virtual portfolios and real-time leaderboards.
- **Social Trader Chat & Direct Messaging (`Phase 5E`)**: Global room, symbol discussion rooms, @mentions, and 1-on-1 private messaging.

---

### Phase 4: Order Management System & Matching Engine
- In-memory price-time priority continuous limit order books.
- Immediate or Cancel (IOC) and Good 'Til Cancelled (GTC) order handling.
- Atomic trade settlement pipeline with position updates and cash settlement.

---

### Phase 3: Instrument Catalog & Indian Equities Reference Data
- Multi-exchange instruments table supporting NSE, BSE, and TRADEGRID SIMULATED tickers.
- Market status transitions, tick size validation, and sector classification.

---

### Phase 2: Double-Entry Virtual Wallet & Ledger Subsystem
- Authoritative multi-currency double-entry ledger.
- System issuance, fee, and user wallet accounts.
- Balanced transaction invariant strictly enforced: total credits = total debits.

---

### Phase 1: Core System Architecture & Authentication
- Modular monolith backend architecture (Express, TypeScript, Knex, MySQL).
- Argon2id password hashing and JWT access/refresh token rotation.
- Role-Based Access Control (TRADER, ADMIN).
