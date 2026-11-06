# TRADEGRID – Market Simulation Engine (Design)

**Status:** Phase 3 Implemented (Instrument Master, Quotes, Candles, Fixture Provider). Phase 4 Target: Continuous Matching Engine.

TRADEGRID must **not** be a chart whose last price is `random()`. Prices should look like a market: a slow baseline, bursts of volatility, reactions to news, and **real trader flow** hitting a book.

This engine is **separate** from matching. It outputs:

1. A **fair value** (reference price) per stock.
2. Optional **synthetic liquidity** (limit orders from a system actor) so the book has depth.
3. Updates to **sentiment / volatility** state after admin events.

It does **not** write trader cash or invent fills. Fills happen only in the matching engine.

---

## 1. Implemented Phase 3 Market Data Subsystem

Phase 3 establishes the foundation for all market data ingestion, storage, and visualization:

1. **Instrument Master (`instruments` table):**
   - Unique symbol per exchange (`UNIQUE(symbol, exchange)`).
   - Segregates instruments by `data_classification` (`REAL` vs. `SIMULATED`).
2. **Latest Market Quotes (`market_quotes` table):**
   - High-precision fixed-point pricing (`DECIMAL(18,4)`).
   - Intraday statistics: `last_price`, `previous_close`, `open`, `high`, `low`, `volume`, `change_amount`, `change_percent`.
   - Data provenance metadata (`data_source`, `data_classification`).
3. **Multi-Interval Historical Candles (`market_candles` table):**
   - Resolutions: `1m`, `5m`, `15m`, `1h`, `1d`.
   - Mathematical consistency: $\text{high} \ge \max(\text{open}, \text{close})$ and $\text{low} \le \min(\text{open}, \text{close})$.
4. **Pluggable Provider Architecture (`MarketDataProvider`):**
   - Decoupled interface for quote & candle ingestion.
   - `FixtureMarketDataProvider` currently provides deterministic simulated OHLCV data.
   - Ready for adapter integration with licensed external real-market providers.
5. **Data Segregation Safeguards:**
   - Real market references (e.g. NSE blue chips) receive static catalog pricing.
   - Fictional instruments (e.g. `TGRID`, `NEXUS`, `SOLARIS`) are explicitly tagged `SIMULATED`.

---

## 2. Hybrid Simulation Model (Phase 4 Design)

Think of each stock as having a “true-ish” value the class is simulating (like a company), while the **visible price** is whatever last traded on the book.

```text
fair_value[t] =
    baseline_walk[t]
  + market_sentiment[t]
  + sector_bias[t]
  + event_impact[t]
  + inventory_pressure[t]      -- from order-flow imbalance
```

Then:

- **Liquidity bots** place bids/asks around `fair_value` using tick size, with spread that widens when volatility is high or depth is thin.
- **Traders** lift those offers or rest their own orders.
- **Last price** = last trade, not `fair_value` itself. If nobody trades, last stays stale; quotes still move.

That is why a quiet market and a panic look different: events change fair value **and** spread/depth, not only a candle.

## 2. Components

| Factor | What it represents | How it is stored |
|--------|--------------------|------------------|
| Baseline | Slow drift (random walk on a seed, not wall-clock chaos) | `stocks.baseline_price` + seeded RNG stream |
| Market sentiment | Whole-market risk-on / risk-off | `exchange_settings` + running scalar |
| Per-stock volatility | Some names jump more | `stocks.volatility` |
| Supply and demand | Bid vs ask size, recent buy vs sell volume | Computed from book + tape |
| Trader order flow | Students herding into one symbol | Imbalance over a rolling window |
| Liquidity / depth | How many shares sit near mid | Simulation quotes + trader rests |
| Admin events | Crash, rally, news, sector shock | `market_events` + decay curve |
| Sector impact | IT vs banks | `sectors` + event targets |
| Recovery | Impacts fade toward baseline | Exponential decay `e^{-t/tau}` |

## 3. Discrete time

A **simulation tick** (proposal: 250–1000 ms while session is `OPEN`) on a scheduler:

1. Advance seeded RNG for this tick index (not `System.nanoTime()` as the only entropy).
2. Update market sentiment slightly (mean-reverting).
3. For each active stock, update `fair_value`.
4. Apply active event multipliers with time decay.
5. Measure book imbalance: `(bid_size - ask_size) / (bid_size + ask_size)`.
6. Nudge fair value **against** or **with** flow (choose one and test; proposal: **temporary** move **with** aggressive flow, then mean-revert, so dumps crash the name).
7. Refresh synthetic orders: cancel stale sim orders outside the new spread; place new ones (capped size).
8. Publish quote snapshot if mid or depth changed.

Matching may run **between** ticks whenever a human order arrives. Ticks never skip the matcher; they only submit/cancel sim orders through Order Management.

## 4. Baseline movement

Use **integer ticks** internally if helpful, but persist `DECIMAL` prices.

Proposal: seeded Gaussian increment on log-price, then round to `tick_size`:

```text
log_p := log(fair_value)
log_p += mu_dt + sigma * sqrt(dt) * Z_seeded
fair_value := round_to_tick(exp(log_p))
```

`mu_dt` includes sentiment and event drift. `sigma` is stock volatility × event vol multiplier × market vol.

**TypeScript / Node.js:** compute with high-precision decimal math (or scaled integer cents/pips) after the increment, and persist strictly as `DECIMAL(18,4)`. Do not store or transmit prices using JavaScript IEEE-754 `Number` floating point.

## 5. Events (crash, rally, news)

Admin (or a scheduled script) inserts `market_events`.

| Type | Typical effect |
|------|----------------|
| `CRASH` | Negative drift, vol × N, wider spreads, thinner size |
| `RALLY` | Opposite of crash |
| `NEWS` | One-stock jump then decay |
| `SECTOR_SHOCK` | All stocks in sector |
| `LIQUIDITY_DRY` | Spread widen, size down, little drift |
| `RECOVERY` | Optional explicit mean-reversion boost after a crash |

**Impact over time:** `impact(t) = A * exp(-(t - t0) / tau)` until `ends_at`. After that, only baseline + sentiment remain. This is how the market **recovers** without a hard reset to yesterday’s close.

Events **do not** directly `UPDATE quotes.last`. They change fair value and sim orders; last changes when trades print.

## 6. Reproducibility for tests

Store in `exchange_settings`:

- `simulation_seed` (BIGINT)
- `tick_index` (how many ticks have run)

RNG: `Math.random()` is non-deterministic and forbidden for simulation; prefer a deterministic PRNG (e.g. Mulberry32, PCG, or XorShift) with a per-stock stream `hash(seed, stock_id, tick_index)` so adding a stock does not reshuffle others.

**Replay:** same seed + same tick index + same event table + same incoming student orders ⇒ same fair values and same sim orders. Human orders are part of the tape; tests inject them from fixtures.

Disable real wall-clock scheduling in unit tests; call `tick(index)` directly.

## 7. Liquidity and market depth

Synthetic orders:

- Several levels on each side (e.g. 5 ticks).
- Size larger near mid when calm; smaller in a crash.
- Marked `source = SIMULATION` so you can hide them in admin analytics or show “displayed depth.”

If students buy **all** sim offers, fair value should rise (flow pressure) and sim reload at higher prices — that is supply/demand, not a random spike.

## 8. Session coupling

| Session | Simulation | Matching |
|---------|------------|----------|
| `PREOPEN` | Optional quote warmup, no trades | Reject or queue (proposal: reject) |
| `OPEN` | Ticks on | Orders match |
| `HALT` | Ticks paused or quotes frozen | New orders rejected |
| `CLOSED` | Off | DAY orders cancelled |

Admin start/stop session is Exchange Management; this engine only reads session status.

## 9. What we refuse to do

- Set candle close from `Math.random()` in the frontend.
- Let Lightweight Charts or Zustand be the price authority.
- Let the simulator `INSERT` into `trades` without going through the matcher (except you should **never** do that).

## 10. Related

- [MATCHING_ENGINE.md](MATCHING_ENGINE.md) — how sim orders actually trade
- [DATABASE_DESIGN.md](DATABASE_DESIGN.md) — `market_events`
- [TESTING_STRATEGY.md](TESTING_STRATEGY.md) — seeded replay
