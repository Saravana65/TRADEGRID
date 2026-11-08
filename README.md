# TRADEGRID

**Real-time Virtual Stock Exchange and Educational Trading Simulator**

* **Repository:** [https://github.com/Saravana65/TRADEGRID](https://github.com/Saravana65/TRADEGRID)
* **Default Branch:** `main`
* **Architecture:** Modular Monolith
* **Current Status:** **Phase 8 Trader Achievements and Gamification Complete** (267 Passing Tests, Server-Authoritative Gamification Engine, 19 Badges across 4 Categories, 100 XP/Level Math, Live WebSocket Unlocks, Strict Financial & Privacy Isolation, Hall of Fame Leaderboard, TradingView Lightweight Charts v4, SMA/EMA/Bollinger/VWAP Overlays, RSI/MACD/Stochastic Oscillators, Derived Volume Profile, 100-User Concurrency Verified)

---

## 1. Project Vision

TRADEGRID is an educational hybrid stock market simulator designed for students and aspiring traders to understand market mechanics, order matching, sentiment shocks, and risk management in a controlled environment.

### Core Principles
1. **Virtual Money Only:** No connection to real-world brokerages or banking rails. All accounts start with virtual paper currency (e.g. $100,000.00).
2. **Explicit Simulated Labels:** Synthetic news, simulated earnings, and generated ticker data are strictly labelled as simulated for educational purposes.
3. **Double-Entry Financial Integrity:** The backend is the sole authority for cash and holdings. Balances are derived from an immutable, append-only `cash_ledger` and row-level locked transactions.

---

## 2. Technology Stack (Finalized)

| Layer | Technologies | Rationale |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Zustand, Axios, React Router 7 | Sub-millisecond UI reactivity, dark financial terminal design, strictly typed API contracts |
| **Backend** | Node.js (v24), Express.js, TypeScript, Socket.IO, Zod | Fast event loop, unified language across monorepo, robust modular monolith design |
| **Security & Auth** | Argon2id, JWT (Access 15m), Refresh Token Rotation (7d), RBAC | Modern memory-hard password hashing, theft-resistant rotating refresh tokens |
| **Database** | MySQL 8, `mysql2`, Knex migrations & seeds | ACID transactions, foreign keys, row locking, `DECIMAL(19,4)` financial values |
| **Testing** | Vitest, Supertest | Fast in-memory unit and HTTP integration test execution |
| **Infrastructure** | Docker, Docker Compose, Nginx (Alpine) | Containerized multi-stage builds with persistent volumes and health checks |

---

## 3. Monorepo Structure

```text
TRADEGRID/
├── apps/
│   ├── frontend/             # React + Vite + Tailwind CSS Trading Terminal
│   └── backend/              # Node.js + Express + TypeScript Modular Monolith
├── packages/
│   ├── shared-types/         # Domain TypeScript types & interfaces
│   └── validation/           # Shared Zod validation schemas
├── database/
│   ├── migrations/           # Version-controlled Knex migrations (users, sessions)
│   └── seeds/                # Initial seeds (Admin & Demo Trader accounts)
├── infrastructure/
│   └── docker/               # Dockerfiles, Nginx conf & Docker Compose setup
├── docs/                     # Architecture, security, database & API documentation
├── scripts/                  # Cross-platform developer launch scripts
├── docker-compose.yml        # Root compose configuration
├── package.json              # Monorepo workspaces manifest
└── tsconfig.base.json        # Base TypeScript strict configuration
```

---

## 4. Implementation Summary & Development Phases

### Implemented Phases
* [x] **Phase 1 — Application Foundation:** Monorepo architecture, Express + TypeScript modular monolith, Argon2id & JWT auth, MySQL 8 Knex migrations, 10-view React financial terminal frontend, Docker Compose.
* [x] **Phase 2 — Virtual Wallet & Double-Entry Ledger:** Balanced journal transactions ($\sum \text{Debits} == \sum \text{Credits}$), row-level locking (`SELECT ... FOR UPDATE`), idempotency guards, materialized wallet balance reconciliation, administrative credit/debit desk.
* [x] **Phase 3 — Instruments & Market Data Subsystem:** Dual-provenance equity universe (`REAL` vs `SIMULATED`), multi-interval OHLCV candles (`1m` to `1d`), Lightweight Charts integration, market overview breadth.
* [x] **Phase 4A — Order Management System (OMS):** Limit and Market orders, pre-trade buying power risk checks, idempotency, order lifecycle state machine, cancellation rules, frontend order desk.
* [x] **Phase 4B — Continuous Matching Engine & Atomic Settlement:** In-memory order books with Price-Time priority (FIFO), partial and multi-counterparty fills, atomic settlement in MySQL updating ledger, wallet balances, positions (weighted average cost basis), and realized P&L.
* [x] **Phase 5A — Real-Time WebSocket Infrastructure:** Socket.IO relay integrated with HTTP server, JWT handshake authentication, room isolation (`market:*`, `orderbook:*`, `trades:*`, `user:*`), 100-client concurrent streaming benchmark.
* [x] **Phase 5A.1 — Financial Reliability & Integration Hardening:**
  * **Decoupled Transaction Boundaries:** Phase 1 order acceptance commits to database before handoff to matching; settlement operates in isolated atomic transaction.
  * **Rollback Safety & Post-Commit Publishing:** Zero false trade events emitted or corrupted in-memory book state if settlement transaction rolls back.
  * **Exact Decimal Math:** Complete elimination of IEEE-754 binary floating-point drift across OMS, matching engine, settlement, order book, positions, and ledger via `FinancialMath` (`decimal.js` with 28-digit precision, `ROUND_HALF_UP`).
  * **Per-Instrument FIFO Matching Queue:** Serialized order execution and cancellation per instrument ID (`InstrumentMatchingQueue`), eliminating race conditions without distributed locks.
  * **Deterministic Order Book Recovery:** Server bootstrap actively rebuilds in-memory limit order books from persistent MySQL (`status IN ('OPEN', 'PARTIALLY_FILLED')`) before listening.
  * **Risk Reservation Hardening:** Strict uncommitted cash verification for BUY orders and uncommitted share verification for SELL orders.
* [x] **Phase 5B — Autonomous Market-Making Bots & Simulated Liquidity Generators:**
  * **System-Owned Bot Accounts:** Isolated accounts (`role: 'BOT'`, locked password hash) with zero interactive login permissions.
  * **Double-Entry Capital Accounting:** Virtual trading funds funded strictly via balanced ledger entries from `SYSTEM_EQUITY_ISSUANCE`.
  * **Genuine Order Lifecycle:** Bots submit limit orders via `OrderService.createOrder()` using identical queues, matching, settlement, and Socket.IO events as human traders. Zero fake trades or RAM book bypasses.
  * **4 Strategy Profiles:** `CONSERVATIVE_MM` (wide spread, small clips), `BALANCED_MM` (medium spread, continuous presence), `AGGRESSIVE_LP` (tight spread, high volume), `RANDOM_LIQUIDITY` (bounded spread/size jitter).
  * **Avellaneda-Stoikov Inventory Skewing:** Quotes adjusted dynamically based on held vs max inventory to discourage accumulation and liquidate excess positions.
  * **Multi-Tiered Risk Guard:** Daily loss limit circuit breaker, order quantity clamping, order notional limits, inventory caps, and total exposure controls.
  * **Admin REST & Realtime APIs:** 9 admin endpoints under `/api/v1/admin/bots/*` and protected `admin:bots` WebSocket channel with guest/trader rejection.
  * **Frontend Admin Bot Cockpit:** Interactive bot fleet dashboard, aggregate metrics cards, bot registration modal, emergency kill switch, and execution logs modal.
  * **Terminal Visual Indicator:** Discrete `[BOT]` badge indicators displayed on bot orders and trade executions.

* [x] **Phase 5C — Simulated News Catalyst Engine:**
  * **Mandatory Simulated News Guardrails:** Strict disclaimers across API payloads and UI (`"SIMULATED NEWS — NOT REAL FINANCIAL NEWS"`).
  * **Mathematical Catalyst Decay Model:** Real-time decaying composite impact ($\text{impact}(t) = \text{sentiment} \times \text{severity} \times \text{relevance} \times \text{decayFactor}(t)$).
  * **Relevance Scope Weighting:** Symbol (1.0), Sector (0.7), Market (0.4) relevance scaling.
  * **Zero Financial Manipulation Invariant:** Absolutely zero direct price overwrites, fake trades, fake orders, or wallet balance alterations.
  * **Autonomous Bot Integration:** Active catalysts dynamically skew reservation prices ($P_{res}$) and expand quote spreads on Avellaneda-Stoikov market makers to realistically price risk.
  * **Lifecycle State Machine & Auto-Publishing:** Full `DRAFT` -> `SCHEDULED` -> `PUBLISHED` -> `ACTIVE` -> `EXPIRED` lifecycle with background scheduler.
  * **Admin REST & Socket.IO Streaming:** Public `/api/v1/news` and protected `/api/v1/admin/news` endpoints; public `news` and admin `admin:news` WebSocket channels.
  * **Frontend Admin News Cockpit & Wire:** Interactive admin catalyst management tab, live news page with search/filters, and terminal active catalyst alert banners.

* [x] **Phase 5D — Multiplayer Trading Competitions & Real-Time Leaderboards:**
  * **Strict Account & Portfolio Isolation:** Migration `009_create_competitions_tables.ts` introducing `competitions`, `competition_participants`, `competition_accounts`, `competition_positions`, `competition_orders`, `competition_trades`, and `competition_leaderboard_snapshots`. Human user virtual wallets (`wallets`) and regular portfolio positions remain strictly isolated and zero-polluted.
  * **Server-Authoritative Leaderboard Engine:** Real-time portfolio valuation: $\text{Portfolio Value} = \text{Available Cash} + \text{Reserved Cash} + \sum (\text{Qty} \times \text{Price})$, and Total Return %: $\frac{\text{Value} - \text{StartCapital}}{\text{StartCapital}} \times 100$.
  * **Deterministic Tie-Breakers:** 1. Total Return % (descending), 2. Realized PnL (descending), 3. Trade Count (descending), 4. Joined Timestamp (ascending).
  * **Scoped Order Book Matching & Settlement:** In-memory order books isolated per `${competitionId}:${instrumentId}` with Price-Time FIFO matching, wash-sale / self-trading prevention, and atomic settlement across competition accounts and positions.
  * **Competition Lifecycle Automation:** `CompetitionScheduler` automatically managing `DRAFT` -> `UPCOMING` -> `ACTIVE` -> `COMPLETED`, taking frozen snapshots, and auto-cancelling under-enrolled leagues.
  * **Private Arenas & Access Control:** Public and Private competitions (requiring join codes), capacity constraints, and strict Socket.IO room authorization for private tournament channels (`competition:${id}`).
  * **Frontend Tournament Arena:** Responsive `CompetitionsPage.tsx` and `CompetitionDetailPage.tsx` featuring real-time podium, isolated order entry terminal, open orders desk, execution tape, and champion award banner.
  * **High-Concurrency Load Benchmark:** Verified 100 simultaneous connected clients streaming live competition leaderboard updates with zero packet loss.

* [x] **Phase 5E — Global Trader Chat, Symbol Discussion Rooms, Social Mentions & Direct Messaging:**
  * **Relational Chat Schema:** Migration `010_create_chat_tables.ts` establishing 8 tables (`chat_rooms`, `chat_conversations`, `chat_conversation_participants`, `chat_messages`, `chat_message_mentions`, `chat_notifications`, `chat_user_blocks`, `chat_reports`) with foreign key constraints, cascade rules, and composite indexes.
  * **Global & Symbol-Specific Chat Rooms:** Authenticated real-time chat with cursor pagination (`before`, `limit`), room validation ensuring only catalog-registered equity symbols (`symbol-reliance`, `symbol-tcs`, etc.) can host discussion channels.
  * **Private Direct Messaging (1-on-1):** Canonical user ordering (`user1_id < user2_id`) with `UNIQUE(user1_id, user2_id)` constraint guaranteeing a single conversation instance between pairs of traders. Server-side Socket.IO room authorization strictly blocks non-participants.
  * **Social Mentions & Notifications:** Automated extraction of `@username` tags, verification against user directory, mention record creation (`chat_message_mentions`), and immediate in-app notifications (`chat_notifications`). Unmatched handles treated harmlessly as plain text.
  * **Safety, Blocking & Abuse Moderation:** Bi-directional user blocking (`chat_user_blocks`), community reporting (`chat_reports`), and an administrative moderation workflow with report review, dismissal, and message soft-deletion (`is_deleted = true`).
  * **Security & Financial Integrity:** In-memory sliding rate limiter (30 msgs/min), strict HTML entity escaping protecting against stored XSS, and zero raw SQL queries. Zero modification or disruption to wallet balances, double-entry ledger, matching engine, or competition state.
  * **Frontend Trader Chat Terminal:** Interactive responsive terminal UI (`ChatPage.tsx`) featuring Global Chat, Stock Discussions, Direct Messages, Notifications, and Blocked Users tabs. Features include cursor pagination, `@username` autocomplete dropdown, typing indicators, read receipts, and action modals for Start DM and Report Message. Accessible from primary sidebar navigation.
  * **High-Concurrency Load Benchmark:** Verified 100 simultaneous connected WebSocket clients broadcasting and receiving messages in global chat with 100% packet delivery rate.

* [x] **Phase 6 — AI Trading Insights & Strategy Backtesting Engine:**
  * **Quantitative Research Schema:** Migration `011_create_backtesting_and_insights_tables.ts` establishing `backtest_runs`, `backtest_trades`, `backtest_equity_snapshots`, and `quantitative_signals` with cascading foreign keys and indexes.
  * **Mathematical Indicators Suite:** Pure, deterministic implementations of SMA, EMA, RSI (Wilder's smoothing), MACD (12/26/9), Bollinger Bands (20-period with sample standard deviation), and Donchian Breakout Channels.
  * **Server-Authoritative Backtesting:** Strict anti-lookahead bias enforcement. Simulates variable position sizing (`FIXED_PERCENT`, `FIXED_QUANTITY`, `FIXED_AMOUNT`), execution slippage, commissions/fees, and Stop-Loss / Take-Profit exit rules.
  * **6 Algorithmic Strategies:** Simple Moving Average Crossover, Exponential Moving Average Crossover, RSI Momentum & Mean Reversion, MACD Trend, Bollinger Bands Reversion, and Donchian Breakout.
  * **Financial Metrics Analytics:** Annualized Sharpe Ratio, Annualized Sortino Ratio, Maximum Drawdown %, Total Return %, Benchmark Comparison, CAGR %, Win Rate %, and Profit Factor.
  * **Quantitative Signal Generator:** Rule-based scanner evaluating active market instruments, outputting BUY, SELL, or HOLD ratings, confidence scores (-100 to +100), strength meters, and plain-English technical condition explanations.
  * **Portfolio Risk & Health Insights:** Read-only analysis of authentic trader holdings: asset and sector allocations, Herfindahl-Hirschman Index (HHI), max single-stock concentration weight %, and automated risk warnings (`CONCENTRATION`, `SECTOR_EXPOSURE`, `CASH_DRAG`).
  * **Provider-Independent AI Commentary:** Deterministic quantitative reasoning engine generating backtest post-mortems, portfolio health reviews, and strategy comparisons without requiring external paid API keys.
  * **Frontend Quantitative Terminal:** Interactive responsive terminal at `/research` featuring Backtester (with parameter controls, equity curves, metrics cards, and trade logs), Live Signals Scanner, Portfolio Health Analyzer, and Multi-Strategy Comparison Matrix.

* [x] **Phase 7 — Advanced Technical Charting & Indicator Studio:**
  * **TradingView Lightweight Charts v4:** Seamless charting switching between Candlestick, Line, and Area series, integrated Volume histogram, dynamic overlay series (SMA, EMA, Bollinger Bands, VWAP), and separate sub-chart oscillator panels (RSI, Stochastic).
  * **Derived Volume Profile Engine:** Algorithmic OHLCV volume partitioning across configurable price bins (12 to 48 bins), Point of Control (POC) peak bin detection, and Value Area (VAH and VAL) enclosing $\ge 70\%$ of total volume with explicit transparency disclaimers.
  * **Server-Authoritative Workspace Persistence:** Multi-user isolation in `user_chart_preferences` with `UNIQUE(user_id, symbol)`. Restful endpoints for saving, querying, and resetting workspace preferences.
  * **Live WebSocket Feed:** Direct streaming from `market:price_update` channel keeping active candles dynamically updated in real time.
  * **Frontend Charting Studio:** Dedicated full-screen workstation at `/chart` (`AdvancedTradingChart.tsx`) with instant instrument switcher, interval picker (`1m` to `1d`), indicator configurator modal, and Volume Profile HUD.

* [x] **Phase 8 — Trader Achievements and Gamification:**
  * **Master Achievement Schema:** Migration `013_create_achievements_tables.ts` establishing `achievement_definitions`, `user_achievements`, `achievement_progress`, and `user_achievement_stats` with composite indexes and cascade rules.
  * **Server-Authoritative Idempotent Unlocking:** `UNIQUE(user_id, achievement_code)` constraint and anti-double-credit engine logic guarantees that repeat calls return `null` without duplicating gamification points or unlock records.
  * **Level Progression Mathematics:** Strict mathematical leveling: 100 points per level ($\text{Level} = \lfloor \text{Points} / 100 \rfloor + 1$). Dynamic title advancement: *Novice Trader*, *Apprentice*, *Junior Trader*, *Intermediate Trader*, *Senior Trader*, *Lead Trader*, *Principal Trader*, *Master Trader*, and *Grandmaster*.
  * **19 Badges Across 4 Core Categories:** Comprehensive coverage of **Trading Execution** (*First Execution*, *Active Flow*, *Seasoned Trader*, *Centurion Flow*, *Sector Diversified*), **Quant & Backtesting** (*Pioneering Quant*, *Strategy Explorer*, *Systematic Tester*, *Quant Laboratory*, *Risk Conscious*), **Multiplayer Arena** (*Contender*, *Arena Combatant*, *Leaderboard Elite*, *Tournament Veteran*, *Grand Champion*), and **Learning & Community** (*Chart Artisan*, *Technical Analyst*, *Prudent Investor*, *Community Voice*).
  * **Strict Financial Invariant:** Non-monetary points strictly isolated from virtual cash, order margins, buying power, and trade execution. $0 budget objective maintained.
  * **Real-Time WebSocket Delivery:** Instant unlock events streamed to `user:${userId}` room via `achievement:unlocked` channel, triggering animated celebratory toasts in the UI.
  * **Action Hook Integration:** Automatic hooks tied to trade settlement, backtesting execution, competition participation/ranking, charting workspace saves, portfolio reviews, and social chat.
  * **Frontend Achievement Center:** Dedicated page at `/achievements` (`AchievementsPage.tsx`) with Level progression hero card, category filters, animated badge grid with locked/unlocked progress bars, real-time unlock celebration banner, and Global Hall of Fame leaderboard.
  * **Dashboard Showcase Widget:** Embedded status widget on `DashboardPage.tsx` with user level, dynamic title, XP progress bar, and recently unlocked badge pills.

* [x] **Phase 9A — Custom User Strategy Scripting (DSL) & Validation Engine:**
  * **Strategy Database Schema:** Migration `014_create_user_strategies_tables.ts` introducing `user_strategies` and `strategy_versions` with user-scoped isolation, cascading foreign keys, and unique versioning constraints.
  * **Declarative Strategy DSL:** Structured line-oriented language supporting `strategy`, `description`, `instrument`, `timeframe`, `indicator`, `entry:`, `exit:`, and `risk:` configuration blocks.
  * **Lexer & Scanner Architecture:** 1-indexed line/column tracking tokenizer supporting comments (`//`, `#`), strings, floats, percentages (`%`), multi-character comparison/cross operators (`crosses_above`, `crosses_below`), and prototype pollution guards (`__proto__`, `constructor`, `prototype`).
  * **Recursive-Descent AST Parser:** Precedence-climbing expression parser generating pure AST representations with strict node count bounds (`MAX_AST_NODES = 500`) to defeat denial-of-service attempts.
  * **Static Semantic Validator & Type Checker:** Server-authoritative rules engine verifying declared indicator functions (`SMA`, `EMA`, `RSI`, `MACD`, `BollingerBands`, `VWAP`), parameter validation, type checking, risk parameter bounds, and blocking all unsafe identifiers (`eval`, `process`, `require`, `window`).
  * **Strategy Management REST APIs:** Complete CRUD suite under `/api/v1/strategies`: validation endpoint, creation, listing, updating, deletion, duplication, and full version history snapshots.
  * **Strict User Ownership Isolation:** User B cannot read, modify, duplicate, or delete User A's private strategies (`403 FORBIDDEN_STRATEGY_ACCESS`).
  * **Financial Isolation Safety Invariant:** DSL validation and strategy definitions are strictly analytical; zero modification to wallets, cash ledger, or live order matching.

* [x] **Phase 9B — Sandboxed Strategy Execution Engine:**
  * **Strategy Executions Schema:** Migration `015_create_strategy_executions_tables.ts` persisting execution runs, state machine progression, generated signals, and runtime diagnostics.
  * **Sandboxed AST Interpreter:** Pure AST evaluator with zero `eval()`, zero `new Function()`, zero filesystem/OS access. Safely computes arithmetic (zero-division guarded), boolean short-circuiting, and bar-to-bar crossing operations (`crosses_above`, `crosses_below`).
  * **Chronological Bar-by-Bar Sequential Engine:** Pre-computes declared indicators (`SMA`, `EMA`, `RSI`, `MACD`, `BollingerBands`, `VWAP`), enforces indicator lookback warmup periods, and generates alternating `BUY`/`SELL` signals.
  * **Anti-Lookahead Bias Guarantee:** Strictly evaluates bar $t$ using only historical data available at $\le t$. Truncation prefix verification proves identical signal output between partial and full histories.
  * **Execution Bounds & Timeout Protection:** Hard bounds against denial of service: maximum bar limits (10,000 candles) and strict execution timeout (5000ms), transitioning runaway executions to `TIMED_OUT`.
  * **Execution REST APIs:** `POST /api/v1/strategies/:id/execute`, `GET /api/v1/strategies/:id/executions`, `GET /api/v1/strategies/executions/:executionId`, and `POST /api/v1/strategies/executions/:executionId/cancel`.
  * **Strict Financial Invariant:** Purely analytical signals; zero modification to virtual cash, wallets, ledger transactions, or live order books. $0 budget objective maintained.

* [x] **Phase 9C — Strategy Studio UI & Visual Strategy Builder:**
  * **Dedicated Strategy Studio Page (`StrategyStudioPage.tsx`):** Responsive dark-theme dashboard, interactive visual block editor, live DSL code previewer, version history inspector, and simulation execution results.
  * **Visual Rule Builder:** Form-driven rule configuration allowing traders to declare indicators (`SMA`, `EMA`, `RSI`, `MACD`, `BollingerBands`, `VWAP`), configure series sources, assemble multi-condition entry/exit blocks (`and`, `or`, `crosses_above`, `crosses_below`), and establish stop-loss/take-profit risk guardrails.
  * **Dual-Mode Studio:** Seamless switching between visual block builder and advanced raw TradeGrid DSL editor with live bidirectional synchronization.
  * **Server-Authoritative Validation:** On-demand AST syntax and semantic validation with exact line and column diagnostic highlights.
  * **Historical Simulation Runner:** Direct studio execution triggering sandboxed backtest runs with chronological signal tables, performance metrics, and historical run logs.
  * **Navigation Integration:** Mounted at `/strategies` with dedicated sidebar navigation item in `Sidebar.tsx`.

* [x] **Phase 9D — Background Strategy Runner & Automated Virtual Trading:**
  * **Database Architecture:** Migration `016_create_automated_strategy_jobs_tables.ts` establishing `automated_strategy_jobs` and `automated_strategy_orders` audit tables.
  * **In-Process Scheduler (`AutomatedStrategyScheduler`):** Autonomous background tick loop evaluating active runner jobs against market candles with per-job in-memory execution locks (`runningJobLocks`), candle timestamp deduplication, and crash recovery. $0 external infrastructure budget (zero mandatory Redis dependency).
  * **Virtual Order Placement via OMS:** Generated signals (`BUY`, `SELL`) route directly through TradeGrid's `OrderService.createOrder()`. Strictly virtual capital reservation (`wallets`), double-entry ledger transactions (`cash_ledger_entries`), and matching engine settlement. Strictly zero real-money broker execution or live exchange routing.
  * **Server-Side Risk Guardrails:** Configurable limits enforcing `maxOrderNotional`, `maxPositionSize`, and `maxOpenOrders` prior to virtual order submission.
  * **Automated Circuit Breaker:** Consecutive failure tracker auto-stopping erroring jobs into `FAILED` status upon reaching 3 consecutive failures.
  * **Emergency Kill Switch:** `POST /api/v1/strategies/automated/kill-switch` immediately halts all active runner jobs and cancels open virtual orders for the user.
  * **Socket.IO Real-Time Push:** User-targeted WebSocket emissions for job lifecycle, signal generation, risk alerts, and order submissions.
  * **Runner REST APIs:** Job activation (`POST /jobs`), listing (`GET /jobs`), details (`GET /jobs/:jobId`), pause (`POST /jobs/:jobId/pause`), resume (`POST /jobs/:jobId/resume`), stop (`POST /jobs/:jobId/stop`), and kill switch (`POST /kill-switch`).
  * **Strict User Ownership Isolation:** User B cannot inspect, pause, resume, or terminate User A's background runner jobs (`403 FORBIDDEN_JOB_ACCESS`).

### Automated Testing Suite
* **339 automated unit, integration, and load tests** passing in Vitest with **100% pass rate** across 20 test suites:
  * `tests/health.test.ts` (3 tests)
  * `tests/auth.test.ts` (14 tests)
  * `tests/wallet.test.ts` (16 tests)
  * `tests/instruments.test.ts` (15 tests)
  * `tests/market.test.ts` (12 tests)
  * `tests/orders.test.ts` (21 tests)
  * `tests/matching.test.ts` (16 tests)
  * `tests/websocket.test.ts` (15 tests, including 100-client load benchmark)
  * `tests/reliability.test.ts` (13 tests verifying Phase 5A.1 reliability invariants)
  * `tests/bots.test.ts` (19 tests, verifying Phase 5B bot lifecycle, inventory skewing, risk controls, admin APIs, and 100-socket multi-bot load benchmark)
  * `tests/news.test.ts` (21 tests, verifying Phase 5C news schemas, disclaimers, RBAC, lifecycle, decay math, scope weighting, bot integration, financial invariants, real-time events, and 100-client load benchmark)
  * `tests/competitions.test.ts` (20 tests, verifying Phase 5D competition lifecycle, participant enrollment, private join codes, capacity limits, isolated trading, matching, wash prevention, server-authoritative rankings, tie-breakers, post-completion freeze, WebSocket authorization, and 100-client load benchmark)
  * `tests/chat.test.ts` (24 tests, verifying Phase 5E chat rooms, symbol validation, DMs, @mentions, notifications, rate limiting, XSS sanitization, blocking, reporting, admin moderation, and 100-client load benchmark)
  * `tests/backtest.test.ts` (26 tests, verifying Phase 6 indicator mathematics, strategy reproducibility, anti-lookahead bias, slippage/commission, Sharpe/Sortino ratios, drawdown math, signals scanner, portfolio HHI, and AI commentary)
  * `tests/charting.test.ts` (16 tests, verifying Phase 7 VWAP, Stochastic, Bollinger Bands, Volume Profile POC/VAH/VAL, user chart workspace isolation, reset defaults, and 100-user concurrency benchmark)
  * `tests/achievements.test.ts` (16 tests, verifying Phase 8 master definitions, server-authoritative idempotent unlocking, anti-double-credit guarantees, 100 pts/level math, title evolution, user isolation, public showcase privacy, global leaderboard, action triggers, and 100-user concurrency benchmark)
  * `tests/strategies.test.ts` (30 tests, verifying Phase 9A DSL lexer, parser, static validator, REST APIs, user ownership isolation, and 100-user load benchmark)
  * `tests/strategy-execution.test.ts` (19 tests, verifying Phase 9B AST evaluator, deterministic signals, anti-lookahead bias, timeout protection, REST APIs, user ownership isolation, and 100 concurrent executions benchmark)
  * `tests/strategy-studio.test.ts` (10 tests, verifying Phase 9C visual builder DSL generation, indicator configuration, Studio CRUD lifecycle, version auto-snapshots, duplication, cascading deletion, and simulation integration)
  * `tests/automated-strategy-runner.test.ts` (13 tests, verifying Phase 9D background strategy activation, job lifecycle, scheduler ticks, candle idempotency, virtual order submission via OMS, risk limits cap, 3-failure circuit breaker, emergency kill switch, user ownership isolation, and 100 concurrent automated jobs stress benchmark)

---

## 5. Quick Start Guide

### Prerequisites
* **Node.js:** v20+ (v24 recommended)
* **npm:** v10+
* **Docker & Docker Compose** (Optional, for containerized run)

### Method A: Local Development (Recommended)

1. **Clone and enter workspace:**
   ```bash
   git clone https://github.com/Saravana65/TRADEGRID.git
   cd TRADEGRID
   ```

2. **Configure environment:**
   ```bash
   # Copy template to .env
   cp .env.example .env
   ```

3. **Install dependencies and build packages:**
   ```bash
   npm install
   npm run build:packages
   ```

4. **Run the Automated Test Suite:**
   ```bash
   npm test
   ```

5. **Start Development Servers:**
   * **Terminal 1 (Backend API):**
     ```bash
     npm run dev:backend
     ```
     Runs on `http://localhost:5000` (Health check: `http://localhost:5000/api/v1/health`)
   * **Terminal 2 (Frontend Terminal):**
     ```bash
     npm run dev:frontend
     ```
     Runs on `http://localhost:5173`

---

### Method B: Docker Compose

```bash
docker compose up --build
```
* Frontend Terminal: `http://localhost:3000`
* Backend API: `http://localhost:5000`
* MySQL Database: `localhost:3306`

---

## 6. Seed Credentials (Development)

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@tradegrid.internal` | `Admin@12345` |
| **Trader** | `trader@tradegrid.internal` | `Trader@12345` |

---

## 7. Documentation Directory

Detailed specifications and architectural guides:
* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Modular Monolith Architecture & Module Contracts
* [docs/TECH_STACK.md](docs/TECH_STACK.md) — Finalized Technology Stack Decisions & Rationale
* [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) — Complete Monorepo Directory Layout
* [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) — Relational MySQL Schema & Ledger Rules
* [docs/API_DESIGN.md](docs/API_DESIGN.md) — REST & WebSocket API Specification
* [docs/SECURITY.md](docs/SECURITY.md) — Authentication, Argon2id, RBAC & Protection Controls
* [docs/MATCHING_ENGINE.md](docs/MATCHING_ENGINE.md) — Order Book Design & Concurrency Model
* [docs/MARKET_ENGINE.md](docs/MARKET_ENGINE.md) — Hybrid Market Simulation & Volatility Model
* [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md) — Completed vs Pending Roadmap Checklist
* [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) — Step-by-Step Developer Setup Manual
