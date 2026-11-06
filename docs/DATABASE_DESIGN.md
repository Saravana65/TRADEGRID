# TRADEGRID – Database Design & Double-Entry Ledger Schema

**Status:** Live & Implemented (Phases 1 & 2).  
**Database Engine:** MySQL 8 with InnoDB engine.  
**Migration Tool:** Knex.js migrations (`database/migrations/`).  
**Application Scope:** Educational virtual stock exchange simulator. Virtual money only. Zero real-money banking or brokerage integrations.

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

## 3. Entity-Relationship Model (Implemented Phases 1 & 2)

```mermaid
erDiagram
  users ||--o{ refresh_tokens : has
  users ||--|| wallets : owns
  users ||--o{ ledger_accounts : owns
  ledger_transactions ||--|{ ledger_entries : contains
  ledger_accounts ||--o{ ledger_entries : posts_to
  users ||--o{ ledger_transactions : creates

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
