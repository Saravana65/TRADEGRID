# TRADEGRID – Project Structure

* **Status:** Phase 1 Monorepo Established
* **Workspaces:** `apps/*`, `packages/*`

---

## 1. Directory Tree

```text
TRADEGRID/
├── .env.example                     # Environment configuration template
├── .gitignore                       # Git ignore rules for node_modules, dist, envs
├── docker-compose.yml               # Root Docker Compose orchestrator
├── package.json                     # Monorepo workspaces configuration & scripts
├── tsconfig.base.json               # Root TypeScript strict configuration
│
├── apps/
│   ├── backend/                     # Node.js + Express + TypeScript Modular Monolith
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── app.ts               # Express application initialization & middleware
│   │   │   ├── server.ts            # HTTP server entrypoint & graceful shutdown
│   │   │   ├── config/
│   │   │   │   └── env.ts           # Type-safe environment validation via Zod
│   │   │   ├── database/
│   │   │   │   ├── connection.ts    # Knex & mysql2 connection pool manager
│   │   │   │   └── knexfile.ts      # Knex configuration for dev, test & prod
│   │   │   ├── events/
│   │   │   │   └── event-emitter.ts # In-memory domain event bus
│   │   │   ├── middleware/
│   │   │   │   ├── auth.middleware.ts     # JWT Bearer token verification
│   │   │   │   ├── error.middleware.ts    # Centralized error handler
│   │   │   │   ├── role.middleware.ts     # RBAC guard (TRADER vs ADMIN)
│   │   │   │   └── validate.middleware.ts # Zod request validation middleware
│   │   │   ├── modules/
│   │   │   │   ├── auth/            # Auth Controller, Service, Session Repo, Router
│   │   │   │   ├── users/           # User Controller, User Repo, Admin Router
│   │   │   │   ├── wallet/          # [Phase 2] Cash ledger placeholder
│   │   │   │   ├── market/          # [Phase 2] Simulation engine placeholder
│   │   │   │   ├── trading/         # [Phase 2] Order management placeholder
│   │   │   │   ├── portfolio/       # [Phase 2] Holdings & P&L placeholder
│   │   │   │   ├── watchlist/       # [Phase 2] Watchlist placeholder
│   │   │   │   ├── news/            # [Phase 2] Simulated news placeholder
│   │   │   │   ├── competitions/    # [Phase 3] Tournaments placeholder
│   │   │   │   ├── chat/            # [Phase 3] Global chat placeholder
│   │   │   │   └── admin/           # Administrative controls & circuit breakers
│   │   │   ├── utils/
│   │   │   │   ├── argon2.ts        # Argon2id password hashing
│   │   │   │   ├── jwt.ts           # JWT token generation, verification & hash
│   │   │   │   ├── logger.ts        # Structured console logger
│   │   │   │   └── response.ts      # Standardized JSON response helpers
│   │   │   └── websocket/
│   │   │       └── socket.ts        # Socket.IO connection and channel rooms
│   │   └── tests/                   # Vitest & Supertest automated test suite
│   │       ├── auth.test.ts         # Authentication, refresh, & RBAC tests
│   │       ├── health.test.ts       # Health check tests
│   │       └── mocks/
│   │           └── in-memory-repositories.ts # Fast, non-flaky test repos
│   │
│   └── frontend/                    # React 18 + Vite + Tailwind CSS Trading Terminal
│       ├── index.html               # SPA HTML entrypoint
│       ├── package.json
│       ├── postcss.config.js
│       ├── tailwind.config.js       # Dark financial terminal theme
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── src/
│           ├── App.tsx              # Router setup with public and protected routes
│           ├── main.tsx             # React root mount
│           ├── index.css            # Tailwind directives & terminal scrollbars
│           ├── components/
│           │   ├── common/          # Badge, Button, Card, Input, StatCard, Table
│           │   └── layout/          # Navbar, Sidebar, AppLayout
│           ├── pages/               # 10 Financial terminal views
│           │   ├── AdminDashboardPage.tsx
│           │   ├── DashboardPage.tsx
│           │   ├── LoginPage.tsx
│           │   ├── MarketsPage.tsx
│           │   ├── NewsPage.tsx
│           │   ├── NotFoundPage.tsx
│           │   ├── PortfolioPage.tsx
│           │   ├── RegisterPage.tsx
│           │   ├── TradingTerminalPage.tsx
│           │   └── TransactionHistoryPage.tsx
│           ├── services/
│           │   ├── api.ts           # Axios client with auto-refresh interceptors
│           │   └── auth.service.ts  # Auth API client calls
│           ├── store/
│           │   ├── authStore.ts     # Zustand authentication store
│           │   └── uiStore.ts       # Zustand UI, cash balance & status store
│           └── utils/
│               └── formatters.ts    # Currency, percentage, and date formatters
│
├── packages/
│   ├── shared-types/                # Shared TypeScript models (@tradegrid/shared-types)
│   └── validation/                  # Shared Zod validation schemas (@tradegrid/validation)
│
├── database/
│   ├── migrations/                  # Version-controlled Knex migrations
│   │   ├── 001_create_users_table.ts
│   │   └── 002_create_user_sessions_table.ts
│   └── seeds/                       # Development seeds (admin & demo user)
│       └── 001_seed_initial_users.ts
│
├── infrastructure/
│   └── docker/                      # Production container definitions
│       ├── Dockerfile.backend       # Multi-stage Node.js 24 Alpine runner
│       ├── Dockerfile.frontend      # Multi-stage Nginx 1.27 Alpine SPA server
│       ├── docker-compose.yml       # Stack definition with MySQL 8 healthchecks
│       └── nginx.conf               # Nginx reverse proxy & SPA router conf
│
├── docs/                            # Complete system design documentation
└── scripts/                         # Cross-platform startup scripts (run-dev.ps1, run-dev.sh)
```

---

## 2. Monorepo Workspaces (`package.json`)

NPM workspaces allow packages to depend on one another locally via symlinks without publishing to a remote registry:

```json
{
  "workspaces": [
    "packages/*",
    "apps/*"
  ]
}
```

* `@tradegrid/shared-types`: Consumed by both backend and frontend.
* `@tradegrid/validation`: Consumed by both backend for server-side payload parsing and frontend for client-side forms.
