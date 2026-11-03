# TRADEGRID – Security Design

**Status:** Policy for implementation. No Spring Security config exists in the repo yet.

Virtual cash is still sensitive: cheating, scraping admin controls, or forging fills would ruin the classroom exchange.

## 1. Roles

| Role | Capabilities |
|------|----------------|
| `TRADER` | Own orders, own portfolio, public market data, watchlists, join competitions |
| `ADMIN` | Sessions, listings, events, user suspend, grants, global blotter, analytics |

No anonymous trading. Public register/login only if you enable self-signup (**decision**).

Spring: `hasRole('ADMIN')` on `/api/admin/**`. Trader endpoints check resource ownership (`order.user_id == auth.id`).

## 2. Authentication

**Proposal (needs approval):** HTTP-only secure cookie session **or** JWT access token (short TTL) + refresh token.

For a college Docker setup on localhost, **session cookies** with CSRF tokens are simpler and avoid storing JWTs in `localStorage`. If the frontend is on another origin, JWT in memory + refresh cookie is common.

Passwords: BCrypt via Spring Security. Never log passwords or tokens.

## 3. Admin-only endpoints

Everything under `/api/admin/**` plus session start/stop and cash grants. UI routes in the admin Vite app still must not be the only control — **API enforces** the role.

## 4. Input validation

- Bean Validation on DTOs (`@NotNull`, `@Positive`, `@Pattern` for symbol).
- Tick and lot checks in Order Management (not only UI).
- JSON numbers for money rejected; use strings parsed to `BigDecimal`.
- Max JSON size; max quantity/notional from `risk_limits`.
- SQL via JdbcTemplate **parameter binding only** (no string-concat SQL).

## 5. WebSocket authorization

- Authenticate at handshake (same session/JWT).
- Reject subscribe to another user’s `/user/queue/**`.
- Do not broadcast another student’s positions on public topics.
- Disconnect on role loss / suspend.

## 6. API errors

- Map domain exceptions to the error envelope in [API_DESIGN.md](API_DESIGN.md).
- `INTERNAL_ERROR` must not include stack traces to clients.
- Log correlation id server-side.

## 7. Audit logging

Write `audit_logs` for:

- Login success/failure (no password)
- Admin session halt/open
- Stock create/halt
- Event inject
- Cash grant
- Role changes

Trading already has `orders` / `trades` / `cash_ledger`. Do not skip ledger in favor of audit-only.

## 8. Database rollback

- Matching + settlement in transactions; on exception, full rollback of that order’s fill batch.
- Flyway: forward-only migrations; no `DROP TABLE` in production-like scripts.
- Backup story for class demo: `mysqldump` before live contests (**operational**, not code).

Do **not** run destructive SQL against student data to “reset” without an explicit admin tool that grants starting cash through the ledger.

## 9. Other controls

| Topic | Approach |
|-------|----------|
| CORS | Allow only the trader and admin origins |
| Rate limits | Per-user order caps (e.g. N orders/second) to protect the matcher |
| Secrets | `.env` / Compose env; never commit passwords |
| HTTPS | Required if exposed beyond localhost |
| XSS | React default escaping; no `dangerouslySetInnerHTML` for news bodies unless sanitized |
| CSRF | If cookie session: Spring CSRF; if Bearer-only JWT: CSRF less relevant |

## 10. Threats in a class project

Students may try to:

- Replay `POST /orders` → **idempotency keys**
- Edit Zustand cash → **server ignores client balances**
- Call admin APIs from the browser → **role checks**
- Spam market orders → **risk notional + rate limit**

## Related

- [TESTING_STRATEGY.md](TESTING_STRATEGY.md)
- [API_DESIGN.md](API_DESIGN.md)
