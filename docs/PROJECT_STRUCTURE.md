# TRADEGRID – Project Structure

## Verified layout

After cloning `https://github.com/Saravana65/TRADEGRID.git` into the workspace, Git reported an **empty repository** (no commits). The only content from GitHub was `.git`.

The following layout includes documentation only. Application source still does not exist.

```text
TradeGrid/
├── .git/
├── README.md
└── docs/
    ├── PROJECT_OVERVIEW.md
    ├── TECH_STACK.md
    ├── PROJECT_STRUCTURE.md
    ├── DATABASE_DOCUMENTATION.md   # verified: no SQL yet
    ├── SETUP_GUIDE.md
    ├── DEVELOPMENT_STATUS.md
    ├── ARCHITECTURE.md             # Phase 1 blueprint
    ├── DATABASE_DESIGN.md          # proposed schema
    ├── MARKET_ENGINE.md
    ├── MATCHING_ENGINE.md
    ├── API_DESIGN.md
    ├── SECURITY.md
    ├── TESTING_STRATEGY.md
    └── DEVELOPMENT_ROADMAP.md
```

## File roles

| Path | Role |
|------|------|
| `.git/` | Local Git database and `origin` remote configuration |
| `README.md` | Entry point for humans and GitHub |
| `docs/PROJECT_OVERVIEW.md` | Detailed project intent |
| `docs/TECH_STACK.md` | Stack inventory |
| `docs/PROJECT_STRUCTURE.md` | Folder explanation |
| `docs/DATABASE_DOCUMENTATION.md` | Database notes (none found) |
| `docs/SETUP_GUIDE.md` | How to clone and (later) run |
| `docs/DEVELOPMENT_STATUS.md` | Feature status |
| `docs/ARCHITECTURE.md` | Proposed modular monolith |
| `docs/DATABASE_DESIGN.md` | Proposed tables (not executed) |
| `docs/MARKET_ENGINE.md` | Simulation design |
| `docs/MATCHING_ENGINE.md` | Matching design |
| `docs/API_DESIGN.md` | Proposed APIs |
| `docs/SECURITY.md` | Security design |
| `docs/TESTING_STRATEGY.md` | Test plan |
| `docs/DEVELOPMENT_ROADMAP.md` | Implementation phases |

## What is not in the tree

There are **no** directories such as `src/`, `backend/`, `frontend/`, `app/`, `server/`, `client/`, `sql/`, `migrations/`, `public/`, or `tests/` in this clone.

If those folders are added later, update this document from the real tree rather than from a template.

## Git connection

| Setting | Value |
|---------|--------|
| Remote name | `origin` |
| Fetch / push URL | `https://github.com/Saravana65/TRADEGRID.git` |
| Branch | `main` (documentation commits; no application code) |

Preserving history: the clone did not overwrite application work because the remote had no files. Later commits should be additive unless you explicitly choose otherwise.

## Related documents

- [../README.md](../README.md)
- [TECH_STACK.md](TECH_STACK.md)
- [SETUP_GUIDE.md](SETUP_GUIDE.md)
