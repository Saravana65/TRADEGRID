# TRADEGRID – Technology Stack

## Status

Two layers:

1. **Verified in the repository** — what files actually exist.
2. **Proposed (Phase 1)** — intended stack after you approve architecture. Not installed.

There is still **no** `pom.xml`, `package.json`, Dockerfile, or SQL in the tree. Nothing has been silently migrated; the repo was empty of application code.

## Verified in the repository

| Tool | Purpose |
|------|--------|
| Git | Version control |
| GitHub | `https://github.com/Saravana65/TRADEGRID.git` |
| Markdown | Documentation |

## Proposed stack (not in code yet)

### Frontend

| Technology | Purpose |
|------------|---------|
| React.js + TypeScript | Admin panel and trader terminal |
| Vite | Dev server and bundling |
| Tailwind CSS | Styling |
| TradingView Lightweight Charts | Display candles/lines from **server** bars |
| Zustand | UI state only (tabs, caches). Not source of truth for cash or fills |

### Backend

| Technology | Purpose |
|------------|---------|
| Java 17 | Language |
| Spring Boot | Modular monolith |
| Spring Security | AuthN/AuthZ |
| JDBC / JdbcTemplate | Explicit SQL |
| REST | Commands and queries |
| WebSockets | Quotes, depth, private fills |

### Database and ops

| Technology | Purpose |
|------------|---------|
| MySQL 8 | System of record |
| Flyway | Versioned migrations |
| Maven | Backend build |
| Docker Compose | Local MySQL (and later API) |

**Not proposed** (avoid unless a later need appears): Kafka, Redis, Kubernetes, extra microservices, ORM as the only way to touch money rows.

## Compatibility with existing implementation

**No existing implementation.** Adopting this stack does not replace another framework.

If application code is added from an external template, credit it and re-check this file.

## Secrets

No credentials are in Git. Future Compose/env names only (for example `MYSQL_PASSWORD`), never real passwords in docs.

## Related

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [SETUP_GUIDE.md](SETUP_GUIDE.md)
