# TRADEGRID – Development Roadmap

**Status:** Plan. Implementation starts only after you approve the Phase 1 report.

Do not build the whole exchange in one pass. Each slice should be mergeable and testable.

## Phase 0 — Done

- GitHub repo connected
- Setup documentation
- This architecture blueprint (Phase 1 docs)

## Phase 1 — Architecture (this work)

Documentation only. **No application runtime yet.**

Exit criteria: you approve stack, modules, schema, matcher rules, and open decisions listed in the Phase 1 report.

## Phase 2 — Skeleton (after approval)

1. Maven Spring Boot module + Flyway `V1` from [DATABASE_DESIGN.md](DATABASE_DESIGN.md) (tables needed for login + cash only can be a thinner `V1` if you prefer).
2. Docker Compose: MySQL 8.
3. React + Vite + Tailwind **trader** app that can show “API health”.
4. Spring Security login (one admin, one trader seeded via migration, **password from env**).

Exit: `docker compose up`, login works, no trading yet.

## Phase 3 — Vertical trading slice

One stock, two users, limit orders, matcher, ledger, WebSocket last price.

Exit: tests in [TESTING_STRATEGY.md](TESTING_STRATEGY.md) §9 pass.

## Phase 4 — Market simulation

Seeded ticks, synthetic depth, admin start/stop session.

Exit: last price moves from **trades**, admin can halt.

## Phase 5 — Order types and risk

Market, IOC, cancel; then stop / stop-limit; fees; watchlists.

## Phase 6 — Events and admin panel

Inject crash/rally/news; admin blotter; audit log UI.

## Phase 7 — Trader terminal UX

Lightweight Charts wired to `/bars` and WS; depth; P&amp;L; history.

## Phase 8 — Competitions and analytics

Contests, leaderboard from **server** portfolio values, extra analytics.

## Phase 9 — Hardening

Rate limits, Testcontainers CI, backup notes, load test the matcher for a class-sized cohort.

---

If time is short, **stop after Phase 5** and keep events/competitions as report “future work” rather than half-broken features.

## Suggested package order inside the backend

`common` → `user`/`auth` → `stock`/`exchange` → `portfolio` → `order`/`risk`/`matching` → `marketdata` → `market` (sim) → `event` → `admin` → `analytics` → `competition`.
