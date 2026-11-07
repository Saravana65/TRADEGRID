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

## 7. Order Management Endpoints (`/api/v1/orders`)

All order management endpoints require a valid JWT token (`Authorization: Bearer <token>`).

### 7.1 Place Order
- **Endpoint:** `POST /api/v1/orders`
- **Access:** Authenticated (`TRADER` or `ADMIN`)
- **Request Body:**
```json
{
  "instrumentId": 6,
  "side": "BUY",
  "orderType": "LIMIT",
  "quantity": "10.0000",
  "limitPrice": "250.0000",
  "idempotencyKey": "order-req-tgrid-001"
}
```

**Response Example (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": 14,
    "userId": 2,
    "instrumentId": 6,
    "symbol": "TGRID",
    "instrumentName": "TradeGrid Core Technologies",
    "exchange": "TRADEGRID",
    "currency": "USD",
    "side": "BUY",
    "orderType": "LIMIT",
    "quantity": "10.0000",
    "remainingQuantity": "10.0000",
    "limitPrice": "250.0000",
    "status": "OPEN",
    "idempotencyKey": "order-req-tgrid-001",
    "createdAt": "2026-11-06T17:00:00.000Z",
    "updatedAt": "2026-11-06T17:00:00.000Z"
  },
  "message": "Order submitted successfully",
  "timestamp": "2026-11-06T17:00:00.000Z"
}
```

---

### 7.2 List User Orders
- **Endpoint:** `GET /api/v1/orders`
- **Access:** Authenticated (`TRADER` or `ADMIN`)
- **Query Parameters:**
  - `status` (string, optional): `OPEN`, `FILLED`, `CANCELLED`, `REJECTED`, etc.
  - `side` (string, optional): `BUY` or `SELL`
  - `orderType` (string, optional): `MARKET` or `LIMIT`
  - `instrumentId` (integer, optional): Filter by instrument ID
  - `symbol` (string, optional): Filter by symbol
  - `page` (integer, optional, default: 1)
  - `limit` (integer, optional, default: 20, max: 100)

---

### 7.3 Get Order by ID
- **Endpoint:** `GET /api/v1/orders/:id`
- **Access:** Authenticated (Enforces ownership; returns 403 Forbidden if not owner)

---

### 7.4 Cancel Order
- **Endpoint:** `DELETE /api/v1/orders/:id`
- **Access:** Authenticated (Owner only)
- **Description:** Cancels an active `OPEN` or `PENDING` order. Transitions status to `CANCELLED`. Returns 422 if order is already filled or cancelled.

**Response Example (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 14,
    "userId": 2,
    "instrumentId": 6,
    "side": "BUY",
    "orderType": "LIMIT",
    "quantity": "10.0000",
    "remainingQuantity": "10.0000",
    "limitPrice": "250.0000",
    "status": "CANCELLED",
    "updatedAt": "2026-11-06T17:05:00.000Z"
  },
  "message": "Order #14 cancelled successfully",
  "timestamp": "2026-11-06T17:05:00.000Z"
}
```

---

## 8. Health & Diagnostic Endpoints (`/api/v1/health`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET`  | `/api/v1/health` | Public | System status, MySQL pool connectivity, memory usage, and uptime. |

---

## 9. Trading & Trades History Endpoints (`/api/v1/trades`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET`  | `/api/v1/trades` | Public | Public tape of recent executed trades across all instruments or filtered by `symbol`. |
| `GET`  | `/api/v1/trades/my` | Authenticated | Private executions for the authenticated user (both buyer and seller sides). |
| `GET`  | `/api/v1/trades/:reference` | Authenticated | Single trade details including settlement transaction ID and fee breakdown. |

---

## 10. WebSocket Real-Time Infrastructure (Implemented Phase 5A & 5A.1)

### 10.1 Connection Handshake & Authentication
* **Relay Path:** `/socket.io`
* **Transport:** `websocket`, `polling` (fallback)
* **Auth Protocol:** Pass JWT access token via `auth: { token: "<JWT>" }` or query parameter `?token=<JWT>`.
* **Guest Access:** Supported for public market channels. Guests are assigned anonymous socket sessions and automatically blocked from joining private user rooms.

### 10.2 Channel / Room Topology & Subscriptions
Clients send `subscribe` and `unsubscribe` events with `{ channel: "<room_name>" }`:
* `market:<SYMBOL>` — Public market quotes, candle ticks, and last price updates.
* `orderbook:<SYMBOL>` — Public Level 2 order book snapshot and depth ladder updates.
* `trades:<SYMBOL>` — Public trade tape execution prints.
* `user:<USER_ID>` — Private channel (auto-joined upon authenticated connection). Strict authorization prevents users from joining other users' channels.

### 10.3 Real-Time Event Catalog
| Event Name | Channel / Room | Description |
|---|---|---|
| `market:quote` | `market:<SYMBOL>` | Emitted on periodic or triggered market quote updates. |
| `market:price_update` | `market:<SYMBOL>` | Broadcast upon trade execution updating last price, change, and volume. |
| `orderbook:snapshot` | `orderbook:<SYMBOL>` | Initial full L2 depth ladder delivered on subscription. |
| `orderbook:depth_update`| `orderbook:<SYMBOL>` | Incremental sequence-tracked depth update on new order, fill, or cancel. |
| `trade:tape_update` | `trades:<SYMBOL>` | Public execution print broadcast immediately post-settlement. |
| `order:accepted` | `user:<USER_ID>` | Private notification to trader that order passed risk and is committed. |
| `order:partially_filled`| `user:<USER_ID>` | Private notification of partial fill with remaining quantity. |
| `order:filled` | `user:<USER_ID>` | Private notification that order is 100% executed. |
| `order:cancelled` | `user:<USER_ID>` | Private notification confirming order cancellation and capital release. |
| `portfolio:updated` | `user:<USER_ID>` | Private prompt to refresh portfolio positions and cash balance. |

---

## 11. Market-Making Bots REST APIs (`/api/v1/admin/bots`)

All endpoints in this group require role `ADMIN`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`    | `/api/v1/admin/bots` | List all registered market-making bots with status, strategy, and balances. |
| `GET`    | `/api/v1/admin/bots/metrics` | System-wide aggregate metrics (total bots, working capital, open orders, P&L). |
| `POST`   | `/api/v1/admin/bots` | Register and fund a new autonomous bot with system account and double-entry grant. |
| `GET`    | `/api/v1/admin/bots/:id` | Fetch single bot details, strategy risk configuration, assigned instruments, and metrics. |
| `PUT`    | `/api/v1/admin/bots/:id` | Update bot metadata, assigned instruments, or risk limits. |
| `POST`   | `/api/v1/admin/bots/:id/enable` | Activate / resume an active or paused bot. |
| `POST`   | `/api/v1/admin/bots/:id/disable` | Pause bot quotation cycles. |
| `POST`   | `/api/v1/admin/bots/:id/kill` | Emergency kill switch: disable bot and cancel all resting limit orders. |
| `POST`   | `/api/v1/admin/bots/kill-all` | Global emergency kill switch: kill all active bots and cancel all resting orders. |
| `POST`   | `/api/v1/admin/bots/:id/trigger` | Manually trigger an out-of-cycle quote generation cycle. |
| `GET`    | `/api/v1/admin/bots/:id/logs` | Fetch timestamped execution audit logs with action filters. |

### 11.1 Real-Time Bot Channel (`admin:bots`)
Restricted exclusively to authenticated administrator sockets.

| Event Name | Payload | Description |
|---|---|---|
| `bot:status` | `{ botId, status, timestamp }` | Broadcast when bot is enabled, paused, or killed. |
| `bot:order_generated` | `{ botId, orderId, instrumentId, side, price, quantity, timestamp }` | Broadcast when a genuine limit order is submitted to the matching engine. |
| `bot:execution` | `{ botId, tradeReference, instrumentId, side, price, quantity, timestamp }` | Broadcast when a bot order matches against a market participant and settles. |
| `bot:risk_warning` | `{ botId, rule, message, timestamp }` | Broadcast when a risk circuit breaker is triggered or quote is clamped. |

---

## 12. Future Roadmap (Phase 5C & Beyond)

- `/api/v1/admin/market/shock`: Simulated volatility injection and catalyst engine.
- `/api/v1/contests`: Educational trading competitions and tournaments.
- `/api/v1/social/chat`: Symbol-specific and global trader chat rooms.
