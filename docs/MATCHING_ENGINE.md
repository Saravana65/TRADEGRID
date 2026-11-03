# TRADEGRID – Order Matching Engine (Design)

**Status:** Design only. No matcher code is in the repository.

The matching engine is **not** the market simulator. It only maintains a **centralized order book per stock** and pairs compatible orders using **price-time priority**.

## 1. Centralized order book

For each `stock_id`:

- **Bids (buys):** highest price first; at the same price, earliest `accepted_at` first.
- **Asks (sells):** lowest price first; at the same price, earliest `accepted_at` first.

In memory: two sorted maps (price → FIFO queue of orders).  
On disk: `orders` rows with remaining quantity. RAM is rebuilt from `status IN ('ACCEPTED','PARTIAL')` at startup.

Simulation liquidity orders sit in the **same book** but are tagged `source = SIMULATION` so analytics can separate them.

## 2. Price-time priority

When a new order can trade:

1. Walk the opposite side from best price toward worse.
2. At a price level, take the oldest order first.
3. Repeat until the incoming order is filled, the book is exhausted, or prices no longer cross.

**Crossing:**

- Incoming **buy limit** at P matches asks with price **≤ P**.
- Incoming **sell limit** at P matches bids with price **≥ P**.
- Incoming **market** buy takes best asks until filled or book empty (then leftover handling).
- Execution price = **resting order’s price** (maker price). That is the usual student-exchange rule and is easy to audit.

## 3. Order types

| Type | Behavior |
|------|----------|
| `MARKET` | Trade immediately against the book. Unfilled remainder: reject leftover (`IOC`-like) unless you later approve `MARKET` converting to limit. **Proposal: leftover cancelled** so users are not surprised. |
| `LIMIT` | Trade what crosses; remainder rests unless `TIF=IOC` or `FOK`. |
| `STOP` | Hidden until last trade price (or bid/ask, document one rule) crosses `stop_price`; then becomes `MARKET`. |
| `STOP_LIMIT` | Same trigger; then becomes `LIMIT` at `limit_price`. |

**Time in force (proposed)**

| TIF | Meaning |
|-----|---------|
| `GTC` | Rest until filled, cancelled, or stock halted/delisted policy |
| `DAY` | Cancel remaining at session close |
| `IOC` | Fill now, cancel rest |
| `FOK` | Fill entire quantity now or reject with no trades |

Stop orders live in a **stop book** (not visible in depth) until triggered, then enter the live book.

## 4. Partial execution

Example: buy 10 @ 100, sell 4 @ 99 already resting.

- Trade 4 @ 99.
- Buy remains 6 @ 100 on the bid book (`PARTIAL`).
- Sell becomes `FILLED`.

Each slice is a `trades` row. `orders.filled_quantity` increases atomically with the trade.

## 5. Cancellation and rejection

**Cancel** allowed only for remaining quantity (`ACCEPTED` or `PARTIAL`). Releases reserved cash or reserved shares in the same transaction.

**Reject at the gate** (never reaches the book) when:

- Session not `OPEN` (or not in allowed pre-open if you add auctions later)
- Stock `HALTED` / `DELISTED`
- Quantity not a multiple of `lot_size`
- Price not on `tick_size` (limit/stop)
- Duplicate `client_order_id`
- Risk checks fail (below)

Return a clear error code (see [API_DESIGN.md](API_DESIGN.md)).

## 6. Fees

Configurable in `exchange_settings` as **basis points** on notional (`price * qty`), snapshotted onto the order at accept so changing fees mid-day does not rewrite history.

Debit fees on each fill from the payer (proposal: **taker** pays; maker 0 — simple for v1). **Needs your approval.**

Fee math: `BigDecimal` notional × bps / 10000, scale 4, `HALF_UP`.

## 7. Validation and reservation (no double spend)

**Buy**

1. Lock `accounts` row (`SELECT FOR UPDATE`).
2. Required cash ≈ worst-case: for limit, `limit_price * qty + max fee`; for market, use a **price band cap** (e.g. last * 1.05 or best ask walk) so market buys cannot reserve infinite cash.
3. If `cash_available < required` → reject `INSUFFICIENT_FUNDS`.
4. Move cash to `cash_reserved` (ledger `RESERVE`).

**Sell**

1. Lock `positions` row.
2. If `quantity - qty_reserved < sell qty` → reject `INSUFFICIENT_SHARES`.
3. Increase `qty_reserved`.

**Proposal: no short selling in v1** (`allow_short = false`). Selling without shares always rejects.

On fill, convert reserve to actual debit/credit. On cancel, `RELEASE` reserve.

## 8. Safe concurrent trading

Two hazards: (a) two threads matching the **same symbol**, (b) one user trading **two symbols** sharing one cash account.

**Per-symbol single thread:** each stock has a serial executor (or a striped lock). All accepts, cancels, and stop triggers for that symbol run in that queue. This prevents duplicate matches of the same resting order.

**Per-user cash lock:** even with serial symbols, user U can buy stock A and B in parallel. Always lock the `accounts` row (and position rows) inside the DB transaction, in a **fixed order** (account id, then stock id) to avoid deadlocks.

**Idempotency:** `client_order_id` unique per user. Retried HTTP posts return the original order, not a second reservation.

**No duplicate trades:** a resting order is removed from the in-memory queue as soon as remaining qty hits 0; DB `filled_quantity` is the guard if the process restarts mid-crash (on recovery, remaining = qty - filled).

**Negative balances:** rejected by reservation checks + `CHECK` constraints + tests. Matcher never decrements cash without a ledger row.

## 9. Processing an incoming order (algorithm)

```text
validate tick/lot/session/auth
begin transaction
  lock account [and position if sell]
  risk + reserve
  insert order ACCEPTED
commit reservation   -- or keep one long transaction through matching; see decision

enqueue on symbol thread:
  while remaining > 0 and book crosses:
    take FIFO at best opposite price
    trade_qty = min(incoming.remaining, resting.remaining)
    persist trade + ledger + positions + order updates (one transaction)
    publish websocket
  if remaining > 0 and TIF allows rest:
    insert into bid/ask map
  else:
    cancel remainder, release unused reserve
```

**Decision:** one DB transaction for reserve+all fills vs reserve commit then per-fill commits. Per-fill commits show partial progress on crash; a single transaction is simpler. **Proposal for v1: one transaction per incoming order covering all fills of that order.**

## 10. Halt / pause

Exchange or stock halt: stop matching, reject new orders (or accept cancels only). Resting orders remain unless you choose cancel-on-halt (proposal: **leave resting, reject new**).

## 11. What this engine does not do

- It does not pick the next “random chart price.”
- It does not apply crash multipliers to last price; that is [MARKET_ENGINE.md](MARKET_ENGINE.md).
- It does not trust the frontend quantity or “estimated balance.”

## 12. Test hooks

Deterministic matching: no `Math.random` inside the matcher. Feed orders in a list; expect exact trade tape. See [TESTING_STRATEGY.md](TESTING_STRATEGY.md).
