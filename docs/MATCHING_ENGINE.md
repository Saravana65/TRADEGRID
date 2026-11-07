# TRADEGRID – Continuous Order Matching Engine & Settlement Architecture

**Status:** Live & Implemented (Phases 4B & 5A.1)  
**Implementation Modules:**
* Engine Core: `apps/backend/src/modules/matching/matching-engine.ts`
* Order Book Data Structure: `apps/backend/src/modules/matching/order-book.ts`
* Concurrency Queue: `apps/backend/src/modules/matching/matching-queue.ts`
* Atomic Settlement: `apps/backend/src/modules/matching/settlement.service.ts`
* Startup Recovery: `apps/backend/src/modules/matching/order-book-recovery.service.ts`
* Financial Math: `apps/backend/src/utils/math.ts`

---

## 1. Architectural Overview

The TRADEGRID matching engine is a deterministic, in-memory, price-time priority continuous matching system integrated with a double-entry ledger settlement service and a real-time Socket.IO distribution layer.

```
+---------------------------------------------------------------------------------------+
|                                    ORDER LIFECYCLE                                    |
+---------------------------------------------------------------------------------------+
  1. POST /api/v1/orders
           |
  2. OrderService.createOrder()
     +-- [DB Trx] Row-level lock wallet / position
     +-- Risk validation: OrderReservationService (uncommitted cash / shares)
     +-- Insert order (status = 'OPEN', idempotency_key)
     +-- COMMIT Database Transaction
     +-- Emit Socket.IO 'order:accepted' to private room user:<id>
           |
  3. InstrumentMatchingQueue.enqueue(instrumentId, matchTask)
     +-- Serial FIFO Promise queue per instrument
           |
  4. MatchingEngine.matchOrder()
     +-- Fetch in-memory OrderBook for instrument
     +-- Match against resting book (Price-Time Priority)
     +-- Prevent wash trading (buyOrder.userId === sellOrder.userId)
           |
  5. SettlementService.settleTrade()
     +-- [DB Trx] BEGIN
     |   +-- Insert 'trades' execution record
     |   +-- Post balanced double-entry 'TRADE_BUY' (DEBIT Seller, CREDIT Buyer)
     |   +-- Update materialized 'wallets.available_balance' (Exact Decimal Math)
     |   +-- Upsert buyer position (Weighted-average cost basis)
     |   +-- Upsert seller position (Deduct shares, record realized P&L)
     |   +-- Update buyer & seller order statuses and remaining quantities
     +-- [DB Trx] COMMIT
           | (Rollback Safety: If DB Trx fails, stop here: NO book mutation, NO false events)
           |
  6. Post-Commit Memory & Real-Time Sync
     +-- Mutate in-memory OrderBook (deduct executed quantities, remove filled)
     +-- Broadcast 'trade:tape_update' -> trades:<symbol>
     +-- Emit 'order:filled' / 'order:partially_filled' -> user:<buyerId>, user:<sellerId>
     +-- Emit 'portfolio:updated' -> user:<buyerId>, user:<sellerId>
     +-- Broadcast 'orderbook:depth_update' -> orderbook:<symbol>
     +-- Broadcast 'market:price_update' -> market:<symbol>
```

---

## 2. In-Memory Order Book Data Structure

For each tradable instrument, the engine maintains an independent `OrderBook`:
* **Bids (Buys):** Sorted in descending price order ($\text{Price}_1 > \text{Price}_2$). At identical price levels, sorted chronologically by timestamp (FIFO).
* **Asks (Sells):** Sorted in ascending price order ($\text{Price}_1 < \text{Price}_2$). At identical price levels, sorted chronologically by timestamp (FIFO).

### Price-Time Priority Invariant
* **Best Bid:** Highest price buy order resting in the book.
* **Best Ask:** Lowest price sell order resting in the book.
* **Execution Price:** Maker's resting limit price. The incoming taker order crosses at the price of the resting counterparty order.
* **Partial Fills:** Orders decrement their `remainingQuantity` across multiple fills until fully depleted (`status = 'FILLED'`).

---

## 3. Concurrency Model: Per-Instrument FIFO Matching Queue

To guarantee deterministic matching and prevent race conditions without introducing the latency or complexity of distributed locking:
* An in-process `InstrumentMatchingQueue` maintains a serialized promise-chain queue per `instrumentId`.
* All matching executions (`matchOrder`) and order cancellations (`cancelOrder`) for a given instrument are enqueued and processed strictly in FIFO order.
* Multiple instruments match concurrently in parallel on separate queues without contention.
* Guarantees that two concurrent taker orders for the same instrument will never race to fill the same resting maker order.

---

## 4. Transaction Boundaries & Failure Isolation

### Problem Identified in Prior Architecture
Previously, `OrderService.createOrder` held an open database transaction across both order insertion and `matchingEngine.matchOrder`. Inside the matcher, `settlementService.settleTrade` opened an independent transaction trying to update the same orders and wallet rows, resulting in immediate InnoDB lock-wait timeouts and deadlocks against MySQL. Furthermore, if settlement threw an error, in-memory books were already mutated, leaving RAM and database permanently out of sync.

### Hardened Two-Phase Boundary
1. **Phase 1 (OMS Acceptance):**
   * Pre-trade risk validation and order insertion execute in a short-lived transaction.
   * Transaction commits to persistent storage.
   * `order:accepted` is emitted to the user's private channel.
2. **Phase 2 (Matching & Settlement):**
   * The committed order is handed off to `matchingEngine.matchOrder` via the instrument queue.
   * Matches execute in an isolated settlement transaction.
3. **Rollback Safety Guarantee:**
   * If `settlementService.settleTrade` fails or throws an exception, the settlement transaction completely rolls back.
   * The matching loop catches the error and stops matching for that incoming order.
   * In-memory order books are **NOT** mutated.
   * **Zero false trade events** are broadcast to WebSockets.

---

## 5. Exact Financial Precision (`FinancialMath`)

All financial computations in the matching engine, settlement service, order book depth, portfolio positions, and wallet updates use `FinancialMath` (wrapping `decimal.js` with 28-digit precision and `ROUND_HALF_UP`):

| Operation | Implementation | Invariant Guaranteed |
|---|---|---|
| Trade Amount | `FinancialMath.calcTradeAmount(price, qty)` | Exact rounding to 4 decimal places; zero IEEE 754 drift |
| Balance Debit/Credit | `FinancialMath.sub(bal, amt)`, `FinancialMath.add(bal, amt)` | Conservation of money across all partial fills |
| Weighted-Average Cost Basis | `FinancialMath.calcWeightedAverageCost(cQty, cAvg, newQty, execPrice)` | Accurate tax-lot and position cost accounting |
| Realized P&L | `FinancialMath.calcRealizedPnL(execPrice, costBasis, qty)` | Exact profit/loss calculation on share liquidation |
| Remaining Quantity | `FinancialMath.calcRemainingQuantity(total, filled)` | Exact zeroing without floating-point residual dust |

---

## 6. Deterministic Order Book Recovery from Database

Upon server startup (or crash recovery), the in-memory order books must be rebuilt accurately before taking incoming user traffic:
* `OrderBookRecoveryService.recoverAllBooks()` executes during `server.ts` initialization **prior** to `server.listen()`.
* Queries persistent storage for all active resting limit orders:
  ```sql
  SELECT * FROM orders 
  WHERE status IN ('OPEN', 'PARTIALLY_FILLED') 
    AND order_type = 'LIMIT'
  ORDER BY created_at ASC;
  ```
* Iterates through recovered records in chronological order and re-seeds bids and asks into each instrument's `OrderBook`.
* Emits initial `orderbook:depth_update` to establish the baseline sequence state.

---

## 7. Self-Trading / Wash Trading Prevention

To ensure market integrity and prevent artificial volume or self-collusion:
* If an incoming order crosses with a resting order owned by the **same user** (`buyOrder.userId === sellOrder.userId`), the engine immediately breaks out of the match loop.
* The orders are not matched against each other.
* The resting order remains intact in the book; the remainder of the incoming order rests or stays open without trading against self.

---

## 8. Order Cancellation Guarantees

* Cancellations are enqueued through `InstrumentMatchingQueue` to prevent in-flight matching race conditions.
* Orders in `FILLED` status cannot be cancelled (throws `ORDER_ALREADY_FILLED`).
* When an `OPEN` or `PARTIALLY_FILLED` order is cancelled:
  * Order status is updated to `CANCELLED` in the database.
  * In-memory book removes the order ID.
  * Committed cash (for BUY limit orders) or committed shares (for SELL limit orders) are immediately released and made available for subsequent orders.
  * `order:cancelled` and `orderbook:depth_update` events are broadcast.
