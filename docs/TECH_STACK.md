# TRADEGRID – Technology Stack

## 1. Status

* **Status:** Finalized & Implemented (Phase 1 Foundation Complete)
* **Architecture:** Modular Monolith in a Monorepo
* **Language Standard:** TypeScript (Strict Mode) across all packages

---

## 2. Technology Inventory

### A. Frontend Application (`apps/frontend`)

| Technology | Version | Purpose & Architectural Rationale |
|---|---|---|
| **React** | 18.3.1 | Declarative component model for high-frequency financial terminal views. |
| **TypeScript** | 5.7.2 | Enforces compile-time type safety; prevents undefined property accesses on market data. |
| **Vite** | 6.0.7 | Modern ESM build tool providing instant hot module replacement (HMR) and optimized rollup production bundles. |
| **Tailwind CSS** | 3.4.17 | Utility-first styling with custom financial terminal theme (deep slate, cyan accents, emerald gains, rose losses). |
| **React Router** | 7.1.1 | Client-side routing with authentication and role-based guards. |
| **Zustand** | 5.0.3 | Lightweight, unopinionated client state management for auth session and UI preferences without Redux boilerplate. |
| **Axios** | 1.7.9 | HTTP client configured with interceptors for automatic JWT Bearer injection and 401 refresh token rotation. |
| **TradingView Lightweight Charts** | 4.2.2 | High-performance HTML5 canvas financial chart engine for rendering candlestick OHLCV bars. |
| **Lucide React** | 0.469.0 | Clean, consistent iconography for terminal controls, trends, and security badges. |

### B. Backend Application (`apps/backend`)

| Technology | Version | Purpose & Architectural Rationale |
|---|---|---|
| **Node.js** | v24 | Modern JavaScript runtime with high-throughput asynchronous event loop. |
| **Express.js** | 4.21.2 | Minimalist, robust HTTP framework providing clean middleware pipeline organization. |
| **TypeScript** | 5.7.2 | Strict typing for domain entities, request handlers, repositories, and error types. |
| **Argon2** | 0.41.1 | State-of-the-art password hashing using the Argon2id algorithm (winner of the Password Hashing Competition); superior resistance to side-channel and GPU cracking. |
| **JSONWebToken** | 9.0.2 | Cryptographic JWT signing and verification for short-lived access tokens (15m TTL). |
| **Socket.IO** | 4.8.1 | Real-time bi-directional WebSocket transport with automatic fallback and channel multiplexing for live quotes. |
| **mysql2** | 3.11.5 | High-performance MySQL driver with connection pooling and prepared statement security. |
| **Knex.js** | 3.1.0 | SQL query builder and version-controlled migration runner for database evolution. |
| **Helmet** | 8.0.0 | Express security middleware that sets essential HTTP response headers. |
| **CORS** | 2.8.5 | Cross-Origin Resource Sharing control with strict client whitelist. |
| **Zod** | 3.24.1 | Schema declaration and validation library for type-safe environment variables and HTTP requests. |

### C. Shared Monorepo Packages (`packages/`)

| Package | Purpose |
|---|---|
| **`@tradegrid/shared-types`** | Single source of truth for domain models (`User`, `UserRole`, `AuthTokens`, `StockListing`, `ApiResponse`). Guarantees frontend and backend cannot drift out of sync. |
| **`@tradegrid/validation`** | Shared Zod validation schemas for registration, login, refresh tokens, and user updates. Enables both client-side pre-validation and server-side authoritative validation. |

### D. Database & Infrastructure (`database/` & `infrastructure/`)

| Technology | Role |
|---|---|
| **MySQL 8** | ACID-compliant relational database and system of record. InnoDB engine with foreign keys and row-level locking. |
| **DECIMAL(19,4)** | Used strictly for cash balances, prices, quantities, and P&L. Floating-point numbers are strictly forbidden for finance. |
| **Docker & Docker Compose** | Multi-stage container builds for Backend and Frontend (Nginx Alpine) with persistent MySQL volumes and health checks. |
| **Nginx Alpine** | Ultra-lightweight production web server for frontend SPA routing and static asset compression. |

### E. Testing Suite

| Technology | Role |
|---|---|
| **Vitest** | Fast unit and integration test runner executing directly against TypeScript without separate build steps. |
| **Supertest** | High-level HTTP assertion library for testing Express endpoints end-to-end. |

---

## 3. Rationale: Why Node.js + Express + TypeScript?

An earlier preliminary proposal suggested Java 17 and Spring Boot. After architectural evaluation, the project finalized on **Node.js + Express + TypeScript** for the following reasons:

1. **End-to-End TypeScript Unification:** Having TypeScript across frontend, backend, and shared packages eliminates serialization mismatches. Modifying a field in `@tradegrid/shared-types` immediately notifies both frontend components and backend services.
2. **Event-Driven Asynchronous Concurrency:** Financial market simulators handle thousands of WebSocket quote streams and lightweight REST calls. Node's single-threaded event loop with non-blocking I/O excels at handling high concurrency (target: 100+ simultaneous users) without multi-threaded memory bloat.
3. **Student Learning Velocity:** Express.js provides transparent, un-magical architecture. Every middleware, route handler, and error filter is explicitly visible and easy to debug without complex Spring dependency injection magic.
4. **Fast Test & Build Times:** TypeScript compilation with `tsx` and Vitest executes in milliseconds compared to heavy JVM warmup times.
5. **Future Polyglot Extensibility:** As the project expands into Phase 3 and Phase 4, Python FastAPI (for AI and market simulation) and Go (for the matching engine) can easily plug into this Node.js API gateway without impedance mismatch.

---

## 4. Planned Future Technologies (Post-Phase 1)

* **Python & NumPy/Pandas:** Continuous market simulation and sentiment diffusion curves (Phase 2).
* **Python FastAPI:** AI Market Assistant and automated conversational bots (Phase 3).
* **Redis:** In-memory caching for order book snapshots and distributed session tokens (Phase 3).
* **TimescaleDB:** Hypertable time-series storage for tick-by-tick historical chart data (Phase 4).
* **Redpanda:** Event streaming for high-throughput order flow audit trails (Phase 4).
* **Prometheus & Grafana:** System metric observability and matching latency tracking (Phase 4).
