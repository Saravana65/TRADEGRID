# TRADEGRID – API Design & Contract Specification

**Status:** Live & Implemented (Phases 1 & 2).  
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

## 5. Health & Diagnostic Endpoints (`/api/v1/health`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET`  | `/api/v1/health` | Public | System status, MySQL pool connectivity, memory usage, and uptime. |

---

## 6. Future Endpoints (Phases 3 & 4 Roadmap)

- `/api/v1/stocks`: Listed equities universe and real-time quotes.
- `/api/v1/orders`: Limit and market order placement with cash reservation.
- `/api/v1/portfolio`: Stock positions and unrealized profit & loss.
- `/api/v1/admin/market/shock`: Simulated market crash and volatility injection.
