# TRADEGRID – API Design (Proposed)

**Status:** Proposed contract. **No controllers exist yet.** Paths below are a blueprint so frontend and backend can grow together.

Base URL (dev): `http://localhost:8080/api`  
WebSocket (dev): `ws://localhost:8080/ws`

All timestamps ISO-8601 UTC. Money and prices as **strings** in JSON (e.g. `"1523.2500"`) so JavaScript numbers cannot round them.

## 1. Conventions

| Topic | Rule |
|-------|------|
| Auth | `Authorization: Bearer <token>` after login (JWT **or** session cookie — see [SECURITY.md](SECURITY.md); **needs approval**) |
| Errors | `{ "code": "INSUFFICIENT_FUNDS", "message": "...", "details": {} }` |
| Idempotency | Header `Idempotency-Key` on `POST /orders` |
| Pagination | `?cursor=` or `?page=&size=` on lists |
| Roles | `TRADER`, `ADMIN` |

## 2. Authentication

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/auth/register` | Public (or admin-only if you lock registration) | Create trader |
| POST | `/auth/login` | Public | Issue token/session |
| POST | `/auth/logout` | Auth | Invalidate |
| GET | `/auth/me` | Auth | Current user + roles |

## 3. Users (admin)

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/admin/users` | ADMIN | List / filter |
| PATCH | `/admin/users/{id}` | ADMIN | Suspend / activate |
| POST | `/admin/users/{id}/grant-cash` | ADMIN | Virtual grant (ledger `GRANT`) |

## 4. Exchange and stocks

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/stocks` | Auth | List active listings |
| GET | `/stocks/{symbol}` | Auth | Detail + session flags |
| GET | `/exchange/session` | Auth | Global session status |
| POST | `/admin/exchange/session/start` | ADMIN | Open trading |
| POST | `/admin/exchange/session/halt` | ADMIN | Pause matching |
| POST | `/admin/exchange/session/resume` | ADMIN | Resume |
| POST | `/admin/exchange/session/close` | ADMIN | Close |
| POST | `/admin/stocks` | ADMIN | Create listing |
| PATCH | `/admin/stocks/{symbol}` | ADMIN | Tick, lot, halt one name, baseline |

## 5. Market data (read)

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/market/{symbol}/quote` | Auth | Bid/ask/last |
| GET | `/market/{symbol}/depth` | Auth | Aggregated book |
| GET | `/market/{symbol}/bars?tf=1m` | Auth | OHLCV |
| GET | `/market/{symbol}/trades` | Auth | Recent prints |

## 6. Orders (trader)

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/orders` | TRADER | Place order |
| DELETE | `/orders/{id}` | TRADER | Cancel remaining |
| GET | `/orders` | TRADER | Own orders |
| GET | `/orders/{id}` | TRADER | Status |

Example place-order body:

```json
{
  "clientOrderId": "ui-uuid-1",
  "symbol": "TGRID",
  "side": "BUY",
  "type": "LIMIT",
  "tif": "GTC",
  "quantity": "10.0000",
  "limitPrice": "100.0000",
  "stopPrice": null
}
```

Example responses: `201` with order snapshot; `400` with `INVALID_TICK`; `409` duplicate idempotency; `422` `INSUFFICIENT_FUNDS`.

## 7. Portfolio and analytics

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/portfolio` | TRADER | Cash + positions + unrealized P&amp;L |
| GET | `/portfolio/ledger` | TRADER | Cash movements |
| GET | `/analytics/me` | TRADER | Realized P&amp;L, win/loss counts |
| GET | `/admin/analytics/market` | ADMIN | Volume, participants |
| GET | `/admin/orders` | ADMIN | Cross-user order blotter |
| GET | `/admin/trades` | ADMIN | Tape |

Unrealized P&amp;L is computed server-side from `avg_cost` and last price. The UI must not calculate official P&amp;L.

## 8. Watchlists, events, competitions

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET/POST/DELETE | `/watchlists` … | TRADER | Watchlists |
| GET | `/events` | Auth | Visible news/events |
| POST | `/admin/events` | ADMIN | Inject crash/rally/news |
| GET/POST | `/competitions` | Auth / ADMIN | Contests |
| POST | `/competitions/{id}/join` | TRADER | Join |

## 9. WebSocket topics (proposed STOMP)

| Topic | Payload | Who |
|-------|---------|-----|
| `/topic/session` | Session status | All authed |
| `/topic/quotes/{symbol}` | Quote | Authed |
| `/topic/depth/{symbol}` | Depth | Authed |
| `/topic/trades/{symbol}` | Public prints (no account ids) | Authed |
| `/user/queue/fills` | Private fills | Owner |
| `/user/queue/orders` | Private order status | Owner |
| `/user/queue/portfolio` | Cash/position snapshot | Owner |
| `/topic/events` | Market events | Authed |

Handshake requires the same auth as REST. Subscribe only to symbols the user is allowed to see (all listings in v1). Admins may use extra `/topic/admin/...` if needed.

## 10. Error codes (initial set)

`UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `INVALID_TICK`, `INVALID_LOT`, `SESSION_CLOSED`, `SYMBOL_HALTED`, `INSUFFICIENT_FUNDS`, `INSUFFICIENT_SHARES`, `ORDER_NOT_FOUND`, `ORDER_NOT_CANCELABLE`, `DUPLICATE_ORDER`, `RATE_LIMITED`, `INTERNAL_ERROR`.

## 11. Out of scope for this document

- Exact HTTP status mapping in Spring `@ControllerAdvice` (to be implemented later).
- OpenAPI file generation (add when the first controller exists).

This file is **not** a claim that endpoints already respond.
