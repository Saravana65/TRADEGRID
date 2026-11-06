# TRADEGRID – API Design & Contract Specification

**Status:** Live & Implemented (Phases 1, 2 & 3).  
**Base URL:** `http://localhost:5000/api/v1`  
**WebSocket Relay:** `http://localhost:5000` (Socket.IO namespace `/market`)  
**Format:** JSON with strict UTF-8 encoding. All monetary numbers and prices transmitted as strings to avoid floating-point truncation.

---

## 1. Global API Standards

### Standard Success Envelope
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully",
  "timestamp": "2026-11-06T12:00:00.000Z"
}
```

### Standard Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Insufficient virtual funds. Available: $100000.0000, Requested: $150000.0000",
    "details": null
  },
  "timestamp": "2026-11-06T12:00:00.000Z"
}
```

### Authentication Header
Protected endpoints require:
```http
Authorization: Bearer <access_jwt_token>
```

---

## 2. Authentication Endpoints (`/api/v1/auth`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `POST` | `/api/v1/auth/register` | Public | Register trader account and automatically initialize virtual wallet with $100,000 initial grant. |
| `POST` | `/api/v1/auth/login` | Public | Authenticate user via Argon2id hash verification and issue access & refresh tokens. |
| `POST` | `/api/v1/auth/refresh` | Public | Rotate refresh token and issue a fresh 15-minute access token. |
| `POST` | `/api/v1/auth/logout` | Authenticated | Revoke refresh token and terminate session. |
| `GET`  | `/api/v1/auth/me` | Authenticated | Fetch current authenticated user profile and role (`TRADER` or `ADMIN`). |

---

## 3. Virtual Wallet & Ledger Endpoints (`/api/v1/wallet`)

### 3.1 Get Wallet Summary
- **Endpoint:** `GET /api/v1/wallet`
- **Access:** Authenticated (`TRADER` or `ADMIN`)
- **Description:** Returns the user's materialized available cash balance, currency, cumulative debits/credits, and mathematical reconciliation status with the ledger.

**Response Example (200 OK):**
```json
{
  "success": true,
  "data": {
    "walletId": 2,
    "userId": 2,
    "currency": "USD",
    "availableBalance": "100000.0000",
    "totalCredited": "100000.0000",
    "totalDebited": "0.0000",
    "isConsistentWithLedger": true,
    "updatedAt": "2026-11-06T12:00:00.000Z"
  },
  "message": "Wallet summary retrieved successfully",
  "timestamp": "2026-11-06T12:00:00.000Z"
}
```

---

### 3.2 List Wallet Transactions
- **Endpoint:** `GET /api/v1/wallet/transactions`
- **Access:** Authenticated (`TRADER` or `ADMIN`)
- **Query Parameters:**
  - `page` (integer, optional, default: `1`): Current page index
  - `limit` (integer, optional, default: `20`, max: `100`): Items per page
  - `type` (string, optional): Filter by `INITIAL_SIGNUP_GRANT`, `ADMIN_CREDIT`, `ADMIN_DEBIT`, `SYSTEM_ADJUSTMENT`, `TRADE_BUY`, `TRADE_SELL`, `FEE`
  - `startDate` (ISO string, optional): Inclusive start date
  - `endDate` (ISO string, optional): Inclusive end date

**Response Example (200 OK):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "transactionReference": "GRNT-2-1718910000000-a1b2c3d4",
        "transactionType": "INITIAL_SIGNUP_GRANT",
        "description": "Initial virtual demo trading capital",
        "amount": "100000.0000",
        "direction": "INFLOW",
        "createdAt": "2026-11-06T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  },
  "message": "Wallet transactions retrieved successfully",
  "timestamp": "2026-11-06T12:00:00.000Z"
}
```

---

### 3.3 Get Transaction Details (Journal Line Items)
- **Endpoint:** `GET /api/v1/wallet/transactions/:id`
- **Access:** Authenticated (Owner of transaction or `ADMIN`)
- **Description:** Returns the parent transaction record and all balanced double-entry lines (`DEBIT` and `CREDIT`).

**Response Example (200 OK):**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "id": 1,
      "transaction_reference": "GRNT-2-1718910000000-a1b2c3d4",
      "transaction_type": "INITIAL_SIGNUP_GRANT",
      "description": "Initial virtual demo trading capital",
      "idempotency_key": "signup-grant-2",
      "created_by": null,
      "created_at": "2026-11-06T12:00:00.000Z",
      "entries": [
        {
          "id": 1,
          "ledger_transaction_id": 1,
          "account_id": 4,
          "entry_type": "DEBIT",
          "amount": "100000.0000",
          "created_at": "2026-11-06T12:00:00.000Z"
        },
        {
          "id": 2,
          "ledger_transaction_id": 1,
          "account_id": 1,
          "entry_type": "CREDIT",
          "amount": "100000.0000",
          "created_at": "2026-11-06T12:00:00.000Z"
        }
      ]
    }
  },
  "message": "Transaction details retrieved successfully",
  "timestamp": "2026-11-06T12:00:00.000Z"
}
```

---

## 4. Administrative Wallet Controls (`/api/v1/admin/wallets`)

### 4.1 Admin Credit User Wallet
- **Endpoint:** `POST /api/v1/admin/wallets/:userId/credit`
- **Access:** Restricted to `ADMIN` role
- **Headers:** `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "amount": "25000.0000",
  "reason": "Trading tournament 1st place prize allocation",
  "idempotencyKey": "tourney-award-user2-round1"
}
```

**Response Example (200 OK):**
```json
{
  "success": true,
  "data": {
    "transactionReference": "CRD-2-1718910500000-e5f6g7h8",
    "userId": 2,
    "amount": "25000.0000",
    "operation": "CREDIT",
    "newBalance": "125000.0000",
    "description": "Trading tournament 1st place prize allocation",
    "createdAt": "2026-11-06T12:05:00.000Z"
  },
  "message": "Virtual funds ($25000.0000) successfully credited to user #2",
  "timestamp": "2026-11-06T12:05:00.000Z"
}
```

---

### 4.2 Admin Debit User Wallet
- **Endpoint:** `POST /api/v1/admin/wallets/:userId/debit`
- **Access:** Restricted to `ADMIN` role
- **Headers:** `Authorization: Bearer <admin_token>`

**Request Body:**
```json
{
  "amount": "10000.0000",
  "reason": "Regulatory risk clawback / sanction",
  "idempotencyKey": "clawback-user2-case-402"
}
```

**Response Example (200 OK):**
```json
{
  "success": true,
  "data": {
    "transactionReference": "DEB-2-1718911000000-k9l0m1n2",
    "userId": 2,
    "amount": "10000.0000",
    "operation": "DEBIT",
    "newBalance": "115000.0000",
    "description": "Regulatory risk clawback / sanction",
    "createdAt": "2026-11-06T12:10:00.000Z"
  },
  "message": "Virtual funds ($10000.0000) successfully debited from user #2",
  "timestamp": "2026-11-06T12:10:00.000Z"
}
```

**Error Scenario (422 Unprocessable Entity - Insufficient Funds):**
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Insufficient virtual funds. Available: $115000.0000, Requested: $200000.0000",
    "details": null
  },
  "timestamp": "2026-11-06T12:10:05.000Z"
}
```

---

## 5. Stock Instrument Master Endpoints (`/api/v1/instruments`)

### 5.1 List & Search Instruments
- **Endpoint:** `GET /api/v1/instruments`
- **Access:** Public
- **Query Parameters:**
  - `search` (string, optional): Case-insensitive search on symbol or company name
  - `exchange` (string, optional): Filter by exchange (`NSE`, `BSE`, `TRADEGRID`)
  - `sector` (string, optional): Filter by industry sector (`Technology`, `Finance`, `Energy`, etc.)
  - `classification` (string, optional): Filter by data provenance (`REAL`, `SIMULATED`)
  - `status` (string, optional): Filter by status (`ACTIVE`, `HALTED`, `CLOSED`, `DELISTED`)
  - `page` (integer, optional, default: `1`): Current page
  - `limit` (integer, optional, default: `20`, max: `100`): Items per page

**Response Example (200 OK):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 6,
        "symbol": "TGRID",
        "name": "TradeGrid Core Technologies",
        "exchange": "TRADEGRID",
        "sector": "Technology",
        "instrumentType": "EQUITY",
        "currency": "USD",
        "marketStatus": "ACTIVE",
        "dataClassification": "SIMULATED",
        "createdAt": "2026-11-06T08:00:00.000Z",
        "updatedAt": "2026-11-06T08:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 17,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  },
  "message": "Instruments retrieved successfully",
  "timestamp": "2026-11-06T08:00:00.000Z"
}
```

---

### 5.2 Get Instrument by Symbol
- **Endpoint:** `GET /api/v1/instruments/:symbol`
- **Access:** Public
- **Response (200 OK):** Single `Instrument` object. Returns `404 Not Found` if symbol does not exist.

---

### 5.3 Metadata Endpoints
- **Endpoints:**
  - `GET /api/v1/instruments/meta/sectors`: Returns array of distinct active industry sectors.
  - `GET /api/v1/instruments/meta/exchanges`: Returns array of distinct active exchanges.
- **Access:** Public

---

### 5.4 Administrative Instrument Management (`/api/v1/admin/instruments`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `POST` | `/api/v1/admin/instruments` | Restricted to `ADMIN` | Create new instrument. Enforces `UNIQUE(symbol, exchange)`. Returns 409 Conflict if duplicate. |
| `PUT`  | `/api/v1/admin/instruments/:id` | Restricted to `ADMIN` | Update instrument metadata (`name`, `sector`, `marketStatus`). |
| `PATCH`| `/api/v1/admin/instruments/:id/status` | Restricted to `ADMIN` | Modify instrument trading status (`ACTIVE`, `HALTED`, `CLOSED`, `DELISTED`). |

---

## 6. Market Data & OHLCV Endpoints (`/api/v1/market`)

### 6.1 List Latest Quotes
- **Endpoint:** `GET /api/v1/market/quotes`
- **Access:** Public
- **Query Parameters:**
  - `classification` (string, optional): Filter by `REAL` or `SIMULATED`
- **Description:** Returns current market quote snapshots for all active instruments with full financial metrics (`lastPrice`, `previousClose`, `open`, `high`, `low`, `volume`, `changeAmount`, `changePercent`, `dataSource`, `dataClassification`).

---

### 6.2 Get Quote by Symbol
- **Endpoint:** `GET /api/v1/market/quotes/:symbol`
- **Access:** Public
- **Description:** Returns the latest price snapshot and intraday performance for a single symbol.

---

### 6.3 Historical OHLCV Candles
- **Endpoint:** `GET /api/v1/market/candles/:symbol`
- **Access:** Public
- **Query Parameters:**
  - `interval` (required): Timeframe resolution (`1m`, `5m`, `15m`, `1h`, `1d`)
  - `from` (ISO string, optional): Start timestamp
  - `to` (ISO string, optional): End timestamp
  - `limit` (integer, optional, default: `100`, max: `500`): Maximum candle bars returned

**Response Example (200 OK):**
```json
{
  "success": true,
  "data": {
    "symbol": "TGRID",
    "interval": "15m",
    "candles": [
      {
        "timestamp": 1730880000000,
        "open": 248.5000,
        "high": 252.1000,
        "low": 247.9000,
        "close": 250.7500,
        "volume": 125400
      }
    ],
    "count": 1
  },
  "message": "Historical candles retrieved successfully",
  "timestamp": "2026-11-06T08:00:00.000Z"
}
```

---

### 6.4 Market Overview Summary
- **Endpoint:** `GET /api/v1/market/overview`
- **Access:** Public
- **Description:** Returns aggregate market health including:
  - `topGainers`: Top 5 instruments sorted by descending `changePercent`
  - `topLosers`: Top 5 instruments sorted by ascending `changePercent`
  - `mostActive`: Top 5 instruments sorted by descending `volume`
  - `breadth`: Total active instruments, advancing count ($\Delta > 0$), declining count ($\Delta < 0$), and unchanged count ($\Delta == 0$)

---

## 7. Health & Diagnostic Endpoints (`/api/v1/health`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET`  | `/api/v1/health` | Public | System status, MySQL pool connectivity, memory usage, and uptime. |

---

## 8. Future Endpoints (Phases 4 & 5 Roadmap)

- `/api/v1/orders`: Limit and market order placement with automated cash reservation.
- `/api/v1/orderbook/:symbol`: Real-time L2 order book depth (bid/ask ladders).
- `/api/v1/portfolio`: Stock holdings, average cost basis, realized & unrealized P&L.
- `/api/v1/admin/market/shock`: Simulated volatility injection and crash generator.
- `/api/v1/social/chat`: Symbol-specific and global trader chat rooms.
