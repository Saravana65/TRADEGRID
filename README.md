# TRADEGRID

**Real-time Virtual Stock Exchange and Educational Trading Simulator**

* **Repository:** [https://github.com/Saravana65/TRADEGRID](https://github.com/Saravana65/TRADEGRID)
* **Default Branch:** `main`
* **Architecture:** Modular Monolith
* **Current Status:** **Phase 5A.1 Realtime Integration & Financial Reliability Hardening Complete** (125 Passing Tests, Socket.IO Real-time Pipeline, FIFO Matching Queue, Exact Decimal Financial Math, Deterministic Order Book Recovery)

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

### Automated Testing Suite
* **125 automated unit, integration, and load tests** passing in Vitest with **100% pass rate** across 9 test suites:
  * `tests/health.test.ts` (3 tests)
  * `tests/auth.test.ts` (14 tests)
  * `tests/wallet.test.ts` (15 tests)
  * `tests/instruments.test.ts` (15 tests)
  * `tests/market.test.ts` (12 tests)
  * `tests/orders.test.ts` (22 tests)
  * `tests/matching.test.ts` (16 tests)
  * `tests/websocket.test.ts` (15 tests, including 100-client load benchmark)
  * `tests/reliability.test.ts` (13 tests verifying Phase 5A.1 reliability invariants)

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
