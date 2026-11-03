# TRADEGRID – Project Overview

## 1. What TRADEGRID is

TRADEGRID is a **college project** whose stated purpose is a **real-time virtual stock exchange and trading simulator**. The product is meant for learning and experimenting with stock-market mechanisms using virtual (not real) money and simulated listings.

Source of the product statement: the GitHub repository description for [Saravana65/TRADEGRID](https://github.com/Saravana65/TRADEGRID).

## 2. Objectives (intended)

The following objectives are **declared on GitHub**. They are **not implemented** in the current clone.

| Objective | Intent |
|-----------|--------|
| Dynamic market movements | Prices (or equivalent market state) change over time rather than staying static |
| Automated order matching | Buy and sell interest is paired by software instead of manual matching |
| Virtual stock trading | Users place trades against simulated instruments |
| Portfolio management | Holdings, cash, or equivalent positions can be tracked |
| Live market analytics | Traders can see current market information |
| Admin-controlled market events | An administrator can inject events that affect the market |

These bullets are restated from the public repository description. They are **not** reverse-engineered from source, because **no source exists yet**.

## 3. Educational context

TRADEGRID is being built as a BTech project. Expected learning outcomes (inferred from the stated domain, not from code) typically include:

- Modeling orders, trades, and portfolios
- Separating market simulation from user-facing trading
- Understanding constraints (balances, quantities, matching rules)
- Documenting and iterating on a software system

This document does **not** claim those outcomes have already been delivered in software.

## 4. Scope

### In scope (planned product)

- Virtual trading only (educational simulator)
- Features listed in the GitHub description (see table above)

### Out of scope until specified in the repo

- Live trading with real brokerage accounts
- Real-money settlement
- Any specific broker API
- Any specific cloud deployment

Nothing in the repository currently implements either the in-scope or out-of-scope items.

## 5. Current delivery status

| Area | Reality in this clone |
|------|------------------------|
| GitHub repository | Exists and is empty of application commits |
| Local Git | Cloned; `origin` points at `https://github.com/Saravana65/TRADEGRID.git` |
| Application | Not started in this repository |
| Database | No schema or scripts |
| Documentation | Added in the repository-setup phase (this `docs/` folder and root `README.md`) |

See [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) for a feature-by-feature checklist.

## 6. Architecture

**Existing architecture:** none.

No services, processes, HTTP routes, WebSocket endpoints, or database connections are defined in files.

**Planned conceptual domains** (labels only, from the GitHub description):

- Trading (virtual orders)
- Market (price movement and matching)
- Portfolio
- Analytics
- Admin events

Choosing how these domains become folders, APIs, or processes is **future work**.

## 7. Related documents

- [../README.md](../README.md) – short overview and clone instructions
- [TECH_STACK.md](TECH_STACK.md) – tools (none verified in code)
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) – files that actually exist
- [DATABASE_DOCUMENTATION.md](DATABASE_DOCUMENTATION.md) – no database yet
- [SETUP_GUIDE.md](SETUP_GUIDE.md) – how to work with the empty project
- [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) – implementation checklist
