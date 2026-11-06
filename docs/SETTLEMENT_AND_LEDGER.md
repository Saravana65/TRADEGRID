# TRADEGRID — Settlement and Double-Entry Ledger Specification
## Atomic Settlement, Portfolio Positions & Accounting Invariants

### 1. Double-Entry Accounting Model for Trades

Trade execution modifies user balances exclusively through the immutable `cash_ledger` table. Balance columns on the `wallets` table are derived materialized views protected by database transactions.

For every settled trade of value $V = \text{Price} \times \text{Quantity}$:

#### Buyer Entry Set (`TRADE_BUY`)
| Account | Direction | Amount | Description |
|---|---|---|---|
| User Cash Escrow | CREDIT | $V$ | Virtual funds collected from buyer |
| System Exchange Settlement | DEBIT | $V$ | Virtual funds routed through exchange clearing |

#### Seller Entry Set (`TRADE_SELL`)
| Account | Direction | Amount | Description |
|---|---|---|---|
| System Exchange Settlement | CREDIT | $V$ | Virtual funds cleared from exchange |
| User Wallet Balance | DEBIT | $V$ | Virtual funds credited to seller available balance |

**Universal Accounting Invariant**:
$$\sum \text{All Ledger Debits} - \sum \text{All Ledger Credits} \equiv 0.0000$$

---

### 2. Portfolio Position Mathematics

The platform tracks equity holdings in `portfolio_positions` with `DECIMAL(18, 4)` precision.

#### 2.1 Buy Operation: Weighted-Average Cost Basis
When a trader buys $Q_{\text{trade}}$ shares at execution price $P_{\text{trade}}$ with an existing position of $Q_{\text{old}}$ shares at average cost $C_{\text{old}}$:

$$Q_{\text{new}} = Q_{\text{old}} + Q_{\text{trade}}$$

$$C_{\text{new}} = \frac{(Q_{\text{old}} \times C_{\text{old}}) + (Q_{\text{trade}} \times P_{\text{trade}})}{Q_{\text{new}}}$$

#### 2.2 Sell Operation: Realized Profit and Loss
When a trader sells $Q_{\text{sold}}$ shares at execution price $P_{\text{trade}}$:

$$Q_{\text{new}} = Q_{\text{old}} - Q_{\text{sold}}$$

$$\text{PnL}_{\text{trade}} = Q_{\text{sold}} \times (P_{\text{trade}} - C_{\text{old}})$$

$$\text{Realized PnL}_{\text{cumulative}} = \text{Realized PnL}_{\text{old}} + \text{PnL}_{\text{trade}}$$

*Note*: The average cost basis $C_{\text{old}}$ remains unchanged when selling shares.

---

### 3. Concurrency Control and Deadlock Prevention

Simultaneous trading between multiple counterparties creates potential lock order inversion if User 1 trades with User 2 while User 2 trades with User 1.

#### Ordered Locking Protocol
Before executing database modifications:
```ts
const firstUserId = Math.min(buyerId, sellerId);
const secondUserId = Math.max(buyerId, sellerId);

// 1. Acquire row lock on first user
await walletRepo.lockWalletByUserId(firstUserId, trx);

// 2. Acquire row lock on second user (if different user)
if (firstUserId !== secondUserId) {
  await walletRepo.lockWalletByUserId(secondUserId, trx);
}
```

By ensuring that lock acquisition follows a strictly monotonically increasing user ID sequence across all concurrent worker threads, deadlocks are mathematically eliminated.
All acquired locks are guaranteed release in `finally` clauses.
