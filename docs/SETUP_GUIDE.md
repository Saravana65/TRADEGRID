# TRADEGRID – Setup and Installation Guide

* **Project:** TRADEGRID Educational Stock Exchange Simulator
* **Architecture:** Modular Monolith in an NPM Monorepo
* **Current Phase:** Phase 1 Foundation

---

## 1. System Requirements

Before starting, ensure your host environment has the following tools installed:

| Tool | Minimum Version | Recommended | Verification Command |
|---|---|---|---|
| **Node.js** | v20.0.0 | v24.x | `node -v` |
| **npm** | v10.0.0 | v11.x | `npm -v` |
| **Docker** (Optional) | v24.0.0 | v29.x | `docker -v` |
| **Docker Compose** (Optional) | v2.20.0 | v5.x | `docker compose version` |

---

## 2. Environment Configuration

TRADEGRID separates application configuration and credentials into environment variables.
Never commit your local `.env` file into version control!

1. **Create your `.env` file from the provided template:**
   ```bash
   cp .env.example .env
   ```
   *(On Windows PowerShell: `Copy-Item .env.example .env`)*

2. **Inspect and adjust configuration parameters:**
   ```env
   # Server
   NODE_ENV=development
   PORT=5000

   # Client
   CLIENT_URL=http://localhost:5173
   VITE_API_URL=http://localhost:5000/api/v1

   # MySQL Database
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=tradegrid
   DB_USER=tradegrid_user
   DB_PASSWORD=tradegrid_secure_password
   DB_ROOT_PASSWORD=tradegrid_root_password

   # Cryptographic Secrets (Min 32 characters in production)
   JWT_ACCESS_SECRET=tradegrid_dev_access_secret_key_minimum_32_characters_long_12345
   JWT_REFRESH_SECRET=tradegrid_dev_refresh_secret_key_minimum_32_characters_long_67890
   JWT_ACCESS_EXPIRES_IN=15m
   JWT_REFRESH_EXPIRES_IN=7d
   ```

---

## 3. Method A: Local Development Setup (Fastest)

### Step 1: Install Dependencies
Run `npm install` from the monorepo root. NPM workspaces will automatically link `@tradegrid/shared-types` and `@tradegrid/validation` into both `apps/backend` and `apps/frontend`:
```bash
npm install
```

### Step 2: Build Shared Packages
Compile the TypeScript declaration files for the shared packages:
```bash
npm run build:packages
```

### Step 3: Run the Automated Test Suite
Verify that all unit and integration tests execute successfully:
```bash
npm test
```
*Expected result:* 17 tests passed across `tests/health.test.ts` and `tests/auth.test.ts`.

### Step 4: Run Database Migrations & Seeds (Optional / When MySQL is running)
If you have MySQL 8 running locally on port 3306:
```bash
# Run migrations (creates users and user_sessions tables)
npm run migrate:latest

# Seed initial admin and trader accounts
npm run seed:run
```

### Step 5: Launch Development Servers

You can launch both applications simultaneously in separate terminals:

* **Terminal 1: Backend API Service**
  ```bash
  npm run dev:backend
  ```
  * Running at: `http://localhost:5000`
  * Health check: `http://localhost:5000/api/v1/health`

* **Terminal 2: Frontend Trading Terminal**
  ```bash
  npm run dev:frontend
  ```
  * Running at: `http://localhost:5173`

---

## 4. Method B: Docker Compose Setup (Containerized)

To run the complete isolated stack including MySQL 8, Backend, and Frontend without installing local MySQL:

1. **Build and start all containers:**
   ```bash
   docker compose up --build
   ```

2. **Container Services:**
   * **Frontend Terminal (Nginx SPA):** `http://localhost:3000`
   * **Backend REST & WebSocket API:** `http://localhost:5000`
   * **MySQL 8 Database:** `localhost:3306`

3. **Stop the stack:**
   ```bash
   docker compose down
   ```
   *(To wipe database volumes: `docker compose down -v`)*

---

## 5. Development Credentials

When testing the authentication flow, you can register new accounts via `/register` or use the pre-configured demo credentials:

| Role | Email | Password | Access Level |
|---|---|---|---|
| **Administrator** | `admin@tradegrid.internal` | `Admin@12345` | Full access to exchange halts, user management, and catalyst injection |
| **Trader Demo** | `trader@tradegrid.internal` | `Trader@12345` | Trader terminal, order book, watchlist, and portfolio tracking |

---

## 6. Monorepo Script Reference

Run these commands from the root directory:

* `npm run build`: Compiles all packages and applications (`shared-types`, `validation`, `backend`, `frontend`).
* `npm run build:packages`: Builds only the shared TypeScript packages.
* `npm run build:backend`: Compiles backend TypeScript to `apps/backend/dist`.
* `npm run build:frontend`: Builds optimized production bundle for frontend via Vite.
* `npm run dev:backend`: Starts backend with `tsx` hot reload on changes.
* `npm run dev:frontend`: Starts Vite development server with instant HMR.
* `npm test`: Runs backend test suite via Vitest.
* `npm run migrate:latest`: Executes pending Knex database migrations.
* `npm run migrate:rollback`: Rolls back the last migration batch.
* `npm run seed:run`: Seeds default accounts into MySQL.

---

## 7. Troubleshooting

* **Issue: `Cannot find module '@tradegrid/shared-types'`**
  * *Solution:* Run `npm run build:packages` from the root directory so TypeScript generates the `dist/` declarations.
* **Issue: `EADDRINUSE: address already in use :::5000`**
  * *Solution:* Another process is listening on port 5000. Stop the existing process or change `PORT=5001` in your `.env`.
* **Issue: `Invalid credentials` error on login**
  * *Solution:* Ensure you use the exact seed password `Admin@12345` or `Trader@12345` (case-sensitive) or register a fresh user.
