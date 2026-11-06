# TRADEGRID

**Real-time Virtual Stock Exchange and Educational Trading Simulator**

* **Repository:** [https://github.com/Saravana65/TRADEGRID](https://github.com/Saravana65/TRADEGRID)
* **Default Branch:** `main`
* **Architecture:** Modular Monolith
* **Current Status:** **Phase 1 Foundation Complete** (Runnable Monorepo, Auth, Database, 10 UI Views, Tests, Docker)

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

## 4. Phase 1 Implementation Summary

### Implemented in Phase 1
* [x] **Monorepo Architecture:** npm workspaces linking `@tradegrid/shared-types` and `@tradegrid/validation` to frontend and backend apps.
* [x] **Backend Modular Monolith:** Layered architecture (`Controllers` -> `Services` -> `Repositories`).
* [x] **Argon2id & JWT Authentication:** 
  * `POST /api/v1/auth/register` (Trader registration with validation)
  * `POST /api/v1/auth/login` (Credential verification against Argon2id hash)
  * `POST /api/v1/auth/refresh` (Automatic refresh token rotation)
  * `POST /api/v1/auth/logout` (Session revocation)
  * `GET /api/v1/auth/me` (Protected identity endpoint)
  * `GET /api/v1/health` (Operational health check with DB status)
* [x] **Role-Based Authorization:** `TRADER` and `ADMIN` roles enforced via route middleware.
* [x] **MySQL 8 Schema & Migrations:** `users` and `user_sessions` tables with indexes and cascading deletes.
* [x] **Frontend Trading Terminal (10 Core Views):**
  1. `Login` (`/login`): Terminal-styled access with quick demo fill buttons.
  2. `Registration` (`/register`): Trader signup with live password validation.
  3. `Dashboard` (`/`): Portfolio summary, cash balance, active listings, gainers/losers preview, simulated news ticker.
  4. `Markets` (`/markets`): Simulated equity universe with search and sector filtering.
  5. `Portfolio` (`/portfolio`): Stock holdings, average cost, unrealized P&L, cash reserves.
  6. `Watchlist` (`/watchlist`): Tracked tickers with add/remove controls.
  7. `Simulated News` (`/news`): Synthetic catalyst newsfeed with mandatory disclaimers and impact scores.
  8. `Trading Terminal` (`/trade`): Candlestick chart preview, order entry desk (Buy/Sell, Limit/Market), live order book depth.
  9. `Transaction History` (`/history`): Matched execution prints and double-entry cash ledger audit trail.
  10. `Admin Dashboard` (`/admin`): Exchange circuit breaker (Emergency Halt/Resume), user registry management, market shock simulator.
* [x] **Docker Infrastructure:** Multi-stage builds for Backend and Frontend (Nginx SPA) with MySQL 8 healthchecks.
* [x] **Automated Testing Suite:** 17 comprehensive unit and integration tests passing in Vitest.

### Planned for Later Phases
* [ ] **Phase 2:** Continuous in-memory limit order book matching engine, real-time WebSocket ticks, synthetic market simulation pricing engine, cash balance debit/credit execution.
* [ ] **Phase 3:** Automated panic-selling/momentum bots, admin news injection engine, multiplayer competitions, global chat rooms.
* [ ] **Phase 4:** TimescaleDB historical analytics, Python AI market assistant, Prometheus/Grafana monitoring.

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
