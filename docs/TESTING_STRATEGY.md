# TRADEGRID – Testing Strategy

**Status:** Plan only. No test sources exist yet.

Tests must prove **money safety** and **matcher correctness** before a pretty UI. Frontend tests come after the first vertical slice.

## 1. Layers

| Layer | Tool (proposed) | What |
|-------|-----------------|------|
| Unit | JUnit 5 + AssertJ | Matcher, BigDecimal fees, simulation tick math |
| Integration | Spring Boot test + Testcontainers MySQL (or a dedicated test schema) | Flyway, JdbcTemplate, transactions |
| API | MockMvc / REST Assured | AuthZ, validation |
| Concurrency | JUnit with thread pools | Two symbols, one wallet |
| Frontend | Vitest + React Testing Library (later) | Forms, not P&amp;L math |
| E2E | Playwright (later, optional) | Login → buy → see fill |

Do not use production MySQL for automated tests.

## 2. Matching engine

Fixtures: in-memory book, no clock.

| Case | Expect |
|------|--------|
| Limit buy crosses resting sell | Trade at resting price, both qty updated |
| Partial fill | Resting `PARTIAL`, incoming rest or fill |
| Price-time: two sells at 100 | Older sell trades first |
| Market buy, thin book | Fills available size; leftover cancelled (v1 policy) |
| FOK cannot fill fully | Zero trades, order rejected |
| IOC partial | Trades then cancel rest |
| Cancel after partial | Remaining released, filled stays |
| Duplicate `client_order_id` | One reservation |
| Halted symbol | Reject |

Assert trade tape JSON/lists **exactly** (price, qty, order ids).

## 3. Partial fills and portfolio

After buy 10, fill 4:

- `filled_quantity = 4`
- Cash reserved reduced for 4, leftover reserve remains
- Position qty = 4, avg_cost = fill price
- Ledger has `TRADE` + `FEE` rows
- Second fill of 6 → fully filled, reserve 0

Sell more than `quantity - qty_reserved` → no trade, no negative position.

## 4. Concurrent orders

| Scenario | Expect |
|----------|--------|
| Two threads buy the same last 1 share | Exactly one fill; one `INSUFFICIENT_SHARES` or empty book |
| Same user buys two symbols at once totaling more than cash | One or both reject such that `cash_available + cash_reserved` never exceeds starting cash + grants; never negative |
| Parallel cancels + fill | No over-release of cash |

Use real DB locks in integration tests, not only mocks.

## 5. Balances and P&amp;L

- Sum of `cash_ledger` amounts = `cash_available + cash_reserved` (reconciliation test).
- Unrealized P&amp;L = `(last - avg_cost) * qty` using `BigDecimal`.
- Fees reduce cash; positions do not include fee in share qty.

## 6. Market events

- Seeded tick sequence without events vs with `CRASH` → fair value lower and spread wider after N ticks.
- After `tau`, impact ≈ 0 (recovery).
- Events do not insert `trades` by themselves.
- Same seed + ticks → identical `fair_value` series.

## 7. AuthZ

| Call | User | Expect |
|------|------|--------|
| `POST /admin/events` | TRADER | 403 |
| `GET /orders/{someoneElse}` | TRADER | 404 or 403 (do not leak) |
| `POST /orders` | Anonymous | 401 |
| Login bad password | | 401, audit failure |

WebSocket: subscribe to another user’s queue must fail.

## 8. WebSocket market updates

- After a fill, subscriber to `/topic/trades/{symbol}` receives the print.
- Private fill appears on the owner queue only.
- After halt, quote stream may freeze; new order attempts fail on REST.

Can be integration tests with a STOMP client, deferred until WS is implemented.

## 9. Definition of done for the first trading slice

A slice is not done because the UI renders. It is done when:

1. Unit tests for matcher cases above pass.
2. Integration test: register, grant cash, limit buy vs limit sell, two users, balances match ledger.
3. Restart API, open orders still in the book (rebuild test).

See [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md).
