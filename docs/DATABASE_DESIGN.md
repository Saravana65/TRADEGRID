# TRADEGRID – Database Design & Double-Entry Ledger Schema

**Status:** Live & Implemented (Phases 1, 2, 3 & 4A).  
**Database Engine:** MySQL 8 with InnoDB engine.  
**Migration Tool:** Knex.js migrations (`database/migrations/`).  
**Application Scope:** Educational virtual stock exchange simulator. Virtual money only. Zero real-money banking or brokerage integrations. All fictional instruments explicitly marked SIMULATED; real instruments marked REAL with static reference pricing.

---

## 1. Accounting Principles & Financial Rules

| Principle | Technical Implementation | Architectural Rationale |
|-----------|--------------------------|-------------------------|
| **Fixed-Point Precision** | `DECIMAL(19,4)` | Binary floating point (`FLOAT`, `DOUBLE`) suffers from IEEE 754 precision inaccuracies (e.g. `0.1 + 0.2 != 0.3`). `DECIMAL(19,4)` provides 15 integral digits and 4 fractional digits, accommodating up to 999 trillion units down to 1/100th of a cent without rounding drift. |
| **Double-Entry Equality** | $\sum \text{Debits} == \sum \text{Credits}$ | Every economic movement must have balanced source and destination entries. No balance is created from thin air without an explicit counterparty equity or adjustment account. |
| **Ledger Immutability** | Insert-Only / Append-Only | Historical rows in `ledger_entries` and `ledger_transactions` are never updated or deleted. Errors are remediated via compensating transactions (e.g., administrative reversals). |
| **Materialized Balance Consistency** | `wallets.available_balance` | Stored as a row-level materialized cache for $O(1)$ fast reads, but mathematically verifiable at any time by summing the historical ledger entries for the user's ledger account. |
| **Pessimistic Row-Level Locking** | `SELECT ... FOR UPDATE` | Prevents race conditions and double-spending when concurrent requests occur (e.g., simultaneous trades or withdrawals). |
| **Idempotency Guard** | `ledger_transactions.idempotency_key` | Unique constraint guarantees that network retransmissions replay the original transaction without double-crediting or double-debiting. |

---

## 2. Double-Entry Chart of Accounts

In TRADEGRID, accounts follow standard financial asset and equity classification:

```
                      +-----------------------------+
                      |       CHART OF ACCOUNTS     |
                      +-----------------------------+
                                     |
           +-------------------------+-------------------------+
           |                                                   |
    [ ASSET ACCOUNTS ]                                 [ EQUITY ACCOUNTS ]
           |                                                   |
  +------------------+                              +-----------------------+
  |   USER_WALLET    |                              | SYSTEM_EQUITY_ISSUANCE|
  |  (User Balances) |                              |  (Virtual Cash Grants)|
  +------------------+                              +-----------------------+
           |                                                   |
           |                                        +-----------------------+
           |                                        |   SYSTEM_ADJUSTMENT   |
           |                                        |  (Clawbacks & Admin)  |
           |                                        +-----------------------+
           |                                                   |
           |                                        +-----------------------+
           |                                        |      SYSTEM_FEE       |
           |                                        |   (Transaction Fees)  |
           |                                        +-----------------------+
```

### Debit & Credit Conventions

| Account Type | Category | Increases On | Decreases On | Normal Balance |
|--------------|----------|--------------|--------------|----------------|
| `USER_WALLET` | Asset | **DEBIT** (+ Cash in user's possession) | **CREDIT** (- Cash spent or withdrawn) | Debit (Positive) |
| `SYSTEM_EQUITY_ISSUANCE` | Equity | **DEBIT** (Capital retraction) | **CREDIT** (Issuance of virtual capital grant) | Credit |
| `SYSTEM_ADJUSTMENT` | Equity / Offset | **DEBIT** (Clawback offset) | **CREDIT** (Adjustment offset) | Balanced |
| `SYSTEM_FEE` | Revenue | **DEBIT** (Fee waiver/refund) | **CREDIT** (Fee collection) | Credit |

### Example Journal Entries

#### A. Initial Signup Virtual Grant ($100,000.00 USD)
```
DEBIT   USER_WALLET (User #2)                 $100,000.0000   (Asset Increases)
CREDIT  SYSTEM_EQUITY_ISSUANCE (System)       $100,000.0000   (Equity Increases)
Total Debits: $100,000.0000 == Total Credits: $100,000.0000 (BALANCED)
```

#### B. Administrative Clawback / Debit ($5,000.00 USD)
```
DEBIT   SYSTEM_ADJUSTMENT (System)             $5,000.0000   (Offset Debit)
CREDIT  USER_WALLET (User #2)                  $5,000.0000   (Asset Decreases)
Total Debits: $5,000.0000 == Total Credits: $5,000.0000 (BALANCED)
```

---

## 3. Entity-Relationship Model (Implemented Phases 1, 2 & 3)

```mermaid
erDiagram
  users ||--o{ refresh_tokens : has
  users ||--|| wallets : owns
  users ||--o{ ledger_accounts : owns
  ledger_transactions ||--|{ ledger_entries : contains
  ledger_accounts ||--o{ ledger_entries : posts_to
  users ||--o{ ledger_transactions : creates
  users ||--o{ orders : places
  instruments ||--|| market_quotes : has_quote
  instruments ||--o{ market_candles : aggregates_candles
  instruments ||--o{ orders : traded_in

  users {
    int id PK
    string email UK
    string username UK
    string password_hash
    string role
    string status
    timestamp created_at
    timestamp updated_at
  }

  wallets {
    int id PK
    int user_id FK,UK
    string currency
    decimal available_balance "DECIMAL(19,4)"
    timestamp created_at
    timestamp updated_at
  }

  ledger_accounts {
    int id PK
    string account_type
    int owner_user_id FK,nullable
    string currency
    timestamp created_at
    timestamp updated_at
  }

  ledger_transactions {
    int id PK
    string transaction_reference UK
    string transaction_type
    string description
    string idempotency_key UK,nullable
    int created_by FK,nullable
    timestamp created_at
  }

  ledger_entries {
    int id PK
    int ledger_transaction_id FK
    int account_id FK
    string entry_type "DEBIT or CREDIT"
    decimal amount "DECIMAL(19,4)"
    timestamp created_at
  }

  instruments {
    int id PK
    string symbol "INDEX(symbol, exchange) UK"
    string name
    string exchange
    string sector
    string instrument_type
    string currency
    string market_status
    string data_classification "REAL or SIMULATED"
    timestamp created_at
    timestamp updated_at
  }

  market_quotes {
    int id PK
    int instrument_id FK,UK
    decimal last_price "DECIMAL(18,4)"
    decimal previous_close "DECIMAL(18,4)"
    decimal open "DECIMAL(18,4)"
    decimal high "DECIMAL(18,4)"
    decimal low "DECIMAL(18,4)"
    bigint volume
    decimal change_amount "DECIMAL(18,4)"
    decimal change_percent "DECIMAL(18,4)"
    string data_source
    string data_classification "REAL or SIMULATED"
    timestamp timestamp
    timestamp created_at
    timestamp updated_at
  }

  market_candles {
    bigint id PK
    int instrument_id FK
    string interval "1m, 5m, 15m, 1h, 1d"
    timestamp timestamp
    decimal open "DECIMAL(18,4)"
    decimal high "DECIMAL(18,4)"
    decimal low "DECIMAL(18,4)"
    decimal close "DECIMAL(18,4)"
    bigint volume
    timestamp created_at
  }

  orders {
    int id PK
    int user_id FK
    int instrument_id FK
    string side "BUY or SELL"
    string order_type "MARKET or LIMIT"
    decimal quantity "DECIMAL(18,4)"
    decimal remaining_quantity "DECIMAL(18,4)"
    decimal limit_price "DECIMAL(18,4), nullable"
    string status "PENDING, OPEN, PARTIALLY_FILLED, FILLED, CANCELLED, REJECTED"
    string idempotency_key UK,nullable
    timestamp created_at
    timestamp updated_at
  }
```

---

## 4. Implemented Table Schema (Knex Migrations)

### 4.1 `users` Table
- **File:** `database/migrations/001_create_users_table.ts`
- **Engine:** InnoDB, UTF8MB4

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT UNSIGNED | PK, AUTO_INCREMENT | Unique identifier for user |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE, INDEX | User login email |
| `username` | VARCHAR(50) | NOT NULL, UNIQUE, INDEX | Unique trader handle |
| `password_hash` | VARCHAR(255) | NOT NULL | Argon2id cryptographic hash |
| `role` | ENUM('TRADER','ADMIN') | NOT NULL, DEFAULT 'TRADER' | Authorization role |
| `status` | ENUM('ACTIVE','SUSPENDED')| NOT NULL, DEFAULT 'ACTIVE' | Account state |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Registration timestamp |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE | Last profile update |

### 4.2 `refresh_tokens` Table
- **File:** `database/migrations/002_create_refresh_tokens_table.ts`
- **Engine:** InnoDB, UTF8MB4

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT UNSIGNED | PK, AUTO_INCREMENT | Token record identifier |
| `user_id` | INT UNSIGNED | NOT NULL, FK(`users.id`) ON DELETE CASCADE | Target user |
| `token_hash` | VARCHAR(64) | NOT NULL, UNIQUE, INDEX | SHA-256 hash of refresh token |
| `expires_at` | TIMESTAMP | NOT NULL | Absolute expiration (7 days) |
| `is_revoked` | BOOLEAN | NOT NULL, DEFAULT FALSE | Revocation status flag |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Issuance timestamp |

### 4.3 `ledger_accounts` Table
- **File:** `database/migrations/003_create_wallet_and_ledger_tables.ts`
- **Engine:** InnoDB, UTF8MB4

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT UNSIGNED | PK, AUTO_INCREMENT | Account identifier |
| `account_type` | ENUM('USER_WALLET', 'SYSTEM_EQUITY_ISSUANCE', 'SYSTEM_ADJUSTMENT', 'SYSTEM_FEE') | NOT NULL | Classification type |
| `owner_user_id` | INT UNSIGNED | NULLABLE, FK(`users.id`) ON DELETE RESTRICT | Owning trader ID (NULL for system accounts) |
| `currency` | VARCHAR(3) | NOT NULL, DEFAULT 'USD' | ISO currency code |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Account creation |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE | Last update |

- **Indexes:**
  - Unique composite index: `(account_type, owner_user_id, currency)`
  - Index: `(owner_user_id)`

### 4.4 `wallets` Table
- **File:** `database/migrations/003_create_wallet_and_ledger_tables.ts`
- **Engine:** InnoDB, UTF8MB4

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT UNSIGNED | PK, AUTO_INCREMENT | Wallet record ID |
| `user_id` | INT UNSIGNED | NOT NULL, UNIQUE, FK(`users.id`) ON DELETE RESTRICT | Owning trader (1:1 constraint) |
| `currency` | VARCHAR(3) | NOT NULL, DEFAULT 'USD' | Trading currency |
| `available_balance` | DECIMAL(19,4) | NOT NULL, DEFAULT 0.0000 | Materialized cash balance |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE | Last transaction update |

- **Indexes & Constraints:**
  - `UNIQUE (user_id)`
  - `CHECK (available_balance >= 0.0000)` (Application-enforced + MySQL check where supported)

### 4.5 `ledger_transactions` Table
- **File:** `database/migrations/003_create_wallet_and_ledger_tables.ts`
- **Engine:** InnoDB, UTF8MB4

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT UNSIGNED | PK, AUTO_INCREMENT | Journal transaction ID |
| `transaction_reference` | VARCHAR(64) | NOT NULL, UNIQUE, INDEX | Unique business reference (e.g. `GRNT-2-1718...`) |
| `transaction_type` | ENUM('INITIAL_SIGNUP_GRANT', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'SYSTEM_ADJUSTMENT', 'TRADE_BUY', 'TRADE_SELL', 'FEE') | NOT NULL | Business operation type |
| `description` | VARCHAR(255) | NOT NULL | Regulatory / audit trail explanation |
| `idempotency_key` | VARCHAR(128) | NULLABLE, UNIQUE, INDEX | Client or caller idempotency key |
| `created_by` | INT UNSIGNED | NULLABLE, FK(`users.id`) ON DELETE SET NULL | Admin or system user who authorized the entry |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Append-only execution time |

- **Indexes:**
  - `UNIQUE (transaction_reference)`
  - `UNIQUE (idempotency_key)`
  - `INDEX (created_at)`
  - `INDEX (transaction_type)`

### 4.6 `ledger_entries` Table
- **File:** `database/migrations/003_create_wallet_and_ledger_tables.ts`
- **Engine:** InnoDB, UTF8MB4

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT UNSIGNED | PK, AUTO_INCREMENT | Entry line ID |
| `ledger_transaction_id` | INT UNSIGNED | NOT NULL, FK(`ledger_transactions.id`) ON DELETE CASCADE | Parent journal transaction |
| `account_id` | INT UNSIGNED | NOT NULL, FK(`ledger_accounts.id`) ON DELETE RESTRICT | Account credited or debited |
| `entry_type` | ENUM('DEBIT', 'CREDIT') | NOT NULL | Double-entry movement type |
| `amount` | DECIMAL(19,4) | NOT NULL | Magnitude of the line item (always positive) |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Line insertion time |

- **Indexes & Constraints:**
  - `INDEX (ledger_transaction_id)`
  - `INDEX (account_id, created_at)`
  - `CHECK (amount > 0.0000)`

### 4.7 `instruments` Table
- **File:** `database/migrations/004_create_instruments_and_market_data_tables.ts`
- **Engine:** InnoDB, UTF8MB4

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT UNSIGNED | PK, AUTO_INCREMENT | Unique Instrument ID |
| `symbol` | VARCHAR(16) | NOT NULL | Ticker symbol (e.g. `RELIANCE`, `TGRID`) |
| `name` | VARCHAR(128) | NOT NULL | Full entity or company name |
| `exchange` | VARCHAR(16) | NOT NULL | Exchange identifier (`NSE`, `BSE`, `TRADEGRID`) |
| `sector` | VARCHAR(64) | NOT NULL | Industry sector (e.g. `Technology`, `Energy`) |
| `instrument_type`| ENUM('EQUITY','INDEX','ETF','CRYPTO') | NOT NULL, DEFAULT 'EQUITY' | Asset class |
| `currency` | VARCHAR(3) | NOT NULL, DEFAULT 'INR' | Trading quote currency |
| `market_status` | ENUM('ACTIVE','HALTED','CLOSED','DELISTED') | NOT NULL, DEFAULT 'ACTIVE' | Operational trading status |
| `data_classification` | ENUM('REAL','SIMULATED') | NOT NULL | Regulatory data provenance flag |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Registration timestamp |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE | Last update timestamp |

- **Indexes & Unique Constraints:**
  - `UNIQUE (symbol, exchange)` (Guarantees symbols are unique per exchange; allows identical symbol across different venues)
  - `INDEX (symbol)`
  - `INDEX (exchange)`
  - `INDEX (sector)`
  - `INDEX (market_status)`
  - `INDEX (data_classification)`

### 4.8 `market_quotes` Table
- **File:** `database/migrations/004_create_instruments_and_market_data_tables.ts`
- **Engine:** InnoDB, UTF8MB4

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT UNSIGNED | PK, AUTO_INCREMENT | Quote record identifier |
| `instrument_id` | INT UNSIGNED | NOT NULL, UNIQUE, FK(`instruments.id`) ON DELETE CASCADE | Target instrument (1:1 latest snapshot) |
| `last_price` | DECIMAL(18,4) | NOT NULL | Most recent transaction / reference price |
| `previous_close`| DECIMAL(18,4) | NOT NULL | Closing price from prior trading session |
| `open` | DECIMAL(18,4) | NOT NULL | Session opening price |
| `high` | DECIMAL(18,4) | NOT NULL | Session intraday high |
| `low` | DECIMAL(18,4) | NOT NULL | Session intraday low |
| `volume` | BIGINT UNSIGNED | NOT NULL, DEFAULT 0 | Cumulative trading session volume |
| `change_amount` | DECIMAL(18,4) | NOT NULL | Absolute change: `last_price - previous_close` |
| `change_percent`| DECIMAL(18,4) | NOT NULL | Percentage change: `(change_amount / previous_close) * 100` |
| `data_source` | VARCHAR(64) | NOT NULL | Origin provider (`FIXTURE_PROVIDER`, `NSE_REFERENCE`, etc.) |
| `data_classification` | ENUM('REAL','SIMULATED') | NOT NULL | Transparency classification tag |
| `timestamp` | TIMESTAMP | NOT NULL | Timestamp of quote quote update |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Row insertion time |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE | Row modification time |

- **Indexes & Constraints:**
  - `UNIQUE (instrument_id)`
  - `INDEX (data_classification)`
  - `INDEX (timestamp)`

### 4.9 `market_candles` Table
- **File:** `database/migrations/004_create_instruments_and_market_data_tables.ts`
- **Engine:** InnoDB, UTF8MB4

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | BIGINT UNSIGNED | PK, AUTO_INCREMENT | Historical candle bar identifier |
| `instrument_id` | INT UNSIGNED | NOT NULL, FK(`instruments.id`) ON DELETE CASCADE | Associated instrument |
| `interval` | ENUM('1m','5m','15m','1h','1d') | NOT NULL | Time bucket resolution |
| `timestamp` | TIMESTAMP | NOT NULL | Start timestamp of bar interval |
| `open` | DECIMAL(18,4) | NOT NULL | Bar open price |
| `high` | DECIMAL(18,4) | NOT NULL | Bar high price ($\ge \max(open, close)$) |
| `low` | DECIMAL(18,4) | NOT NULL | Bar low price ($\le \min(open, close)$) |
| `close` | DECIMAL(18,4) | NOT NULL | Bar close price |
| `volume` | BIGINT UNSIGNED | NOT NULL, DEFAULT 0 | Volume executed within interval bucket |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record creation time |

- **Indexes & Constraints:**
  - `UNIQUE (instrument_id, interval, timestamp)` (Prevents duplicate interval bars)
  - `INDEX (instrument_id, interval, timestamp)` (Optimized for range queries: `WHERE instrument_id = ? AND interval = ? AND timestamp BETWEEN ? AND ?`)

### 4.10 `orders` Table
- **File:** `database/migrations/005_create_orders_table.ts`
- **Engine:** InnoDB, UTF8MB4

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT UNSIGNED | PK, AUTO_INCREMENT | Unique Order identifier |
| `user_id` | INT UNSIGNED | NOT NULL, FK(`users.id`) ON DELETE RESTRICT | Account owner |
| `instrument_id` | INT UNSIGNED | NOT NULL, FK(`instruments.id`) ON DELETE RESTRICT | Target tradable asset |
| `side` | ENUM('BUY','SELL') | NOT NULL | Order direction |
| `order_type` | ENUM('MARKET','LIMIT') | NOT NULL | Execution instruction |
| `quantity` | DECIMAL(18,4) | NOT NULL | Total shares ordered |
| `remaining_quantity`| DECIMAL(18,4) | NOT NULL | Shares remaining to be filled |
| `limit_price` | DECIMAL(18,4) | NULLABLE | Execution limit price (null for market) |
| `status` | ENUM('PENDING','OPEN','PARTIALLY_FILLED','FILLED','CANCELLED','REJECTED') | NOT NULL, DEFAULT 'OPEN' | Lifecycle state |
| `idempotency_key`| VARCHAR(128) | NULLABLE, UNIQUE | Client idempotency guard |
| `created_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Submission timestamp |
| `updated_at` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE | Last transition timestamp |

- **Indexes & Constraints:**
  - `UNIQUE (idempotency_key)`
  - `INDEX (user_id, status)` (Optimized for user's open orders & history)
  - `INDEX (instrument_id, status)` (Optimized for order book matching queries)
  - `INDEX (status)`
  - `INDEX (created_at)`

---

## 5. System Accounts Pre-Seeded in Migration

To enable double-entry accounting from the first transaction, Migration 003 pre-populates default system counterparties:

| Account Type | Description |
|--------------|-------------|
| `SYSTEM_EQUITY_ISSUANCE` | Source equity account for new user registration virtual grants ($100,000 demo capital) |
| `SYSTEM_ADJUSTMENT` | Counterparty account for admin virtual funds credits, clawbacks, and adjustments |
| `SYSTEM_FEE` | Repository account for future market and trading fees (Phase 3+) |

---

## 6. Concurrency & Integrity Assurance

### Atomic Transaction Sequence
Balance mutations are wrapped in a strict MySQL transaction:

```sql
START TRANSACTION;

-- 1. Acquire exclusive pessimistic lock on the target wallet row
SELECT * FROM wallets WHERE user_id = ? FOR UPDATE;

-- 2. Verify sufficient funds if debiting:
-- IF available_balance < requested_amount THEN ROLLBACK and RAISE 422;

-- 3. Insert parent ledger transaction with unique reference & idempotency key
INSERT INTO ledger_transactions (transaction_reference, transaction_type, description, idempotency_key, created_by)
VALUES (?, ?, ?, ?, ?);

-- 4. Insert balanced double-entry lines (DEBIT + CREDIT)
INSERT INTO ledger_entries (ledger_transaction_id, account_id, entry_type, amount) VALUES (?, ?, 'DEBIT', ?);
INSERT INTO ledger_entries (ledger_transaction_id, account_id, entry_type, amount) VALUES (?, ?, 'CREDIT', ?);

-- 5. Update materialized wallet balance
UPDATE wallets SET available_balance = ? WHERE user_id = ?;

COMMIT;
```

If any failure occurs (deadlock, network timeout, constraint violation), the entire transaction rolls back cleanly, maintaining 100% financial integrity.

---

## 7. Market Data Provenance & Integrity Safeguards

1. **Strict Data Segregation:**
   - Real market instruments (`data_classification: 'REAL'`) represent actual enterprise entities (e.g. NSE blue chips) and receive static reference catalog prices. They **never** receive fabricated random live fills or misleading simulated ticks.
   - Fictional instruments (`data_classification: 'SIMULATED'`) represent TradeGrid simulation universe companies and are powered by algorithmic fixture generators.
2. **Mathematical OHLCV Consistency:**
   Every candle bar strictly enforces:
   $$\text{high} \ge \max(\text{open}, \text{close}) \quad \text{and} \quad \text{low} \le \min(\text{open}, \text{close})$$
3. **Fixed-Point Arithmetic:**
   All market prices and changes are persisted as `DECIMAL(18,4)`. Floating-point representations (`FLOAT`, `DOUBLE`) are strictly forbidden across storage and JSON transmission layers.

---

## 8. Order Management System (OMS) Lifecycle & State Machine

```mermaid
stateDiagram-v2
  [*] --> PENDING : Submit Request
  PENDING --> REJECTED : Validation / Purchasing Power Failure
  PENDING --> OPEN : Accepted by OMS
  OPEN --> PARTIALLY_FILLED : Partial Match (Phase 4B)
  PARTIALLY_FILLED --> PARTIALLY_FILLED : Additional Partial Fill (Phase 4B)
  PARTIALLY_FILLED --> FILLED : Complete Fill (Phase 4B)
  OPEN --> FILLED : Complete Fill (Phase 4B)
  OPEN --> CANCELLED : Trader Cancellation (DELETE /orders/:id)
  PARTIALLY_FILLED --> CANCELLED : Trader Cancellation of Unfilled Remainder
  CANCELLED --> [*]
  FILLED --> [*]
  REJECTED --> [*]
```

### Safe Status Transitions:
| Transition | Allowed | Rationale |
|---|---|---|
| `PENDING` $\to$ `OPEN` | Yes | Pre-trade risk checks pass; order placed in OMS. |
| `PENDING` $\to$ `REJECTED` | Yes | Invalid instrument, halted trading, or insufficient purchasing power. |
| `OPEN` $\to$ `PARTIALLY_FILLED` | Yes | Matcher executes trade for partial remaining quantity. |
| `PARTIALLY_FILLED` $\to$ `FILLED` | Yes | Final execution depletes remaining order quantity. |
| `OPEN` $\to$ `FILLED` | Yes | Single execution completely fills entire order quantity. |
| `OPEN` $\to$ `CANCELLED` | Yes | Trader manually cancels active resting order. |
| `PARTIALLY_FILLED` $\to$ `CANCELLED` | Yes | Trader manually cancels unfilled remainder. |
| `FILLED` $\to$ `CANCELLED` | **FORBIDDEN (400)** | Fully executed orders cannot be reversed or cancelled. |
| `CANCELLED` $\to$ `CANCELLED`| **FORBIDDEN (400)** | Rejects duplicate cancellation attempts. |

---

## 9. Trades & Portfolio Positions Schema (Implemented Phase 4B & 5A.1)

### 9.1 `trades` Table
Records matched executions between buyer and seller orders:
* `id` (BIGINT, PK, Auto-increment)
* `trade_reference` (VARCHAR(64), Unique) — e.g. `TRD-11-1794026691385-eb00ef6f`
* `buy_order_id` (BIGINT, FK -> `orders.id`)
* `sell_order_id` (BIGINT, FK -> `orders.id`)
* `instrument_id` (INT, FK -> `instruments.id`)
* `buyer_id` (INT, FK -> `users.id`)
* `seller_id` (INT, FK -> `users.id`)
* `price` (DECIMAL(18,4)) — Maker execution price
* `quantity` (DECIMAL(18,4)) — Filled share quantity
* `trade_amount` (DECIMAL(19,4)) — Total nominal cash consideration
* `buyer_fee` (DECIMAL(18,4), default 0.0000)
* `seller_fee` (DECIMAL(18,4), default 0.0000)
* `status` (ENUM: `SETTLED`, `FAILED`, `REVERSED`)
* `settlement_transaction_id` (BIGINT, FK -> `ledger_transactions.id`)
* `created_at` (TIMESTAMP)

### 9.2 `portfolio_positions` Table
Tracks cumulative equity inventory and weighted-average cost basis per trader:
* `id` (BIGINT, PK, Auto-increment)
* `user_id` (INT, FK -> `users.id`)
* `instrument_id` (INT, FK -> `instruments.id`)
* `quantity` (DECIMAL(18,4)) — Total owned shares
* `available_shares` (DECIMAL(18,4)) — Uncommitted shares available to sell
* `reserved_shares` (DECIMAL(18,4)) — Shares tied up in resting SELL limit orders
* `average_buy_price` (DECIMAL(18,4)) — Weighted average entry price
* `realized_pnl` (DECIMAL(19,4)) — Realized profit or loss upon liquidation
* `updated_at` (TIMESTAMP)
* Composite Unique Index: `UNIQUE(user_id, instrument_id)`

---

## 10. Financial Reliability & Decimal Precision Controls

1. **Elimination of Binary Floating Point Arithmetic:**
   All monetary and share calculations use `FinancialMath` with `decimal.js` (28-digit precision, `ROUND_HALF_UP`). Zero `Number(a) * Number(b)` operations exist in financial paths.
2. **Pre-Trade Risk & Buying Power Isolation:**
   * **BUY:** `available_balance - committed_buy_cash >= required_order_value`
   * **SELL:** `portfolio_position.available_shares >= required_sell_quantity`
3. **Double-Entry Settlement Invariant:**
   For every trade:
   ```
   DEBIT  USER_WALLET (Seller)      +$trade_amount   (Proceeds received)
   CREDIT USER_WALLET (Buyer)       -$trade_amount   (Cash paid for shares)
   Total Debits == Total Credits (Zero discrepancy)
   ```
4. **Deterministic In-Memory Restoration:**
   On server bootstrap, `OrderBookRecoveryService` executes `SELECT * FROM orders WHERE status IN ('OPEN', 'PARTIALLY_FILLED')` to populate books before opening traffic.
