# TRADEGRID

Real-time virtual stock exchange and trading simulator (college project).

**Repository:** [https://github.com/Saravana65/TRADEGRID](https://github.com/Saravana65/TRADEGRID)  
**Local clone:** connected to `origin` at `https://github.com/Saravana65/TRADEGRID.git`  
**Default branch:** `main`  
**Project status:** documentation and Phase 1 architecture blueprint; **no application source code yet**

## Purpose

TRADEGRID is intended as an educational platform for learning how a stock market works by simulating:

- Dynamic market movements
- Automated order matching
- Virtual stock trading
- Portfolio management
- Live market analytics
- Admin-controlled market events

That description comes from the GitHub repository “About” text. It describes **planned product goals**, not verified running software.

## Current repository contents

As of the local clone (3 November 2026):

| Item | Status |
|------|--------|
| Git remote | Configured (`origin` → GitHub) |
| Commits on `main` | None (empty repository warning on clone) |
| Source code | None |
| Frontend / backend | None |
| Database / SQL | None |
| Dependency manifests | None (`package.json`, `requirements.txt`, `pom.xml`, etc. not present) |
| Application configuration | None |

This workspace contains Git metadata and Markdown documentation (setup + Phase 1 architecture). There is still no runnable frontend, backend, or database schema in the tree.

## Features

### Planned (from repository description)

These are **not implemented** in this clone:

- Dynamic market movements
- Automated order matching
- Virtual stock trading
- Portfolio management
- Live market analytics
- Admin-controlled market events

### Implemented

None. There is no application code to run or test.

## Technology stack

**Implemented in code:** none (no manifests yet).

**Proposed for implementation** (Phase 1 blueprint; waiting for approval):

- Frontend: React, TypeScript, Vite, Tailwind CSS, TradingView Lightweight Charts, Zustand
- Backend: Java 17, Spring Boot, Spring Security, JDBC/JdbcTemplate, REST, WebSockets
- Database: MySQL 8, Flyway
- Tools: Maven, GitHub, Docker Compose

See [docs/TECH_STACK.md](docs/TECH_STACK.md).

## Architecture overview

**Implemented:** none.

**Proposed:** a modular Spring Boot monolith, MySQL as source of truth, separate **market simulation** and **order matching** engines, plus two UIs (admin panel and trader terminal). Virtual money only.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)

## Setup

There is nothing to install or run except Git and a documentation viewer.

1. Clone (already done in this workspace):

   ```bash
   git clone https://github.com/Saravana65/TRADEGRID.git
   cd TRADEGRID
   ```

2. Confirm the remote:

   ```bash
   git remote -v
   ```

Expected:

```text
origin  https://github.com/Saravana65/TRADEGRID.git (fetch)
origin  https://github.com/Saravana65/TRADEGRID.git (push)
```

Full notes: [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)

## Documentation

| Document | Contents |
|----------|----------|
| [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | Project goals and scope |
| [docs/TECH_STACK.md](docs/TECH_STACK.md) | Languages and tools (none verified in code) |
| [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) | Folder layout |
| [docs/DATABASE_DOCUMENTATION.md](docs/DATABASE_DOCUMENTATION.md) | Database (none present) |
| [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) | Local clone and future run steps |
| [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md) | Completed vs pending work |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modular monolith, modules, UIs |
| [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) | Proposed MySQL schema |
| [docs/MARKET_ENGINE.md](docs/MARKET_ENGINE.md) | Hybrid simulation (not random charts) |
| [docs/MATCHING_ENGINE.md](docs/MATCHING_ENGINE.md) | Order book, matching, money safety |
| [docs/API_DESIGN.md](docs/API_DESIGN.md) | Proposed REST and WebSocket contracts |
| [docs/SECURITY.md](docs/SECURITY.md) | Roles, auth, audit |
| [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) | Matcher, cash, concurrency tests |
| [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md) | Phased implementation |

## Honesty about authorship

This is a BTech student project. The GitHub repository was empty at first clone. Documentation in this phase describes **repository state**, not a claim that a full exchange engine was independently written. Future application code may include libraries or scripts from external sources; those should be credited when they are added.

## License

No `LICENSE` file is present in the repository.
