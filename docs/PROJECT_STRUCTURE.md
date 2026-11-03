# TRADEGRID – Project Structure

## Verified layout

After cloning `https://github.com/Saravana65/TRADEGRID.git` into the workspace, Git reported an **empty repository** (no commits). The only content from GitHub was `.git`.

The following layout includes **documentation added in the setup phase**. It does not include application source, because none exists.

```text
TradeGrid/
├── .git/                      # Git metadata; remote origin = GitHub
├── README.md                  # Project overview and clone notes
└── docs/
    ├── PROJECT_OVERVIEW.md    # Goals and scope
    ├── TECH_STACK.md          # Tools (none verified in application code)
    ├── PROJECT_STRUCTURE.md   # This file
    ├── DATABASE_DOCUMENTATION.md
    ├── SETUP_GUIDE.md
    └── DEVELOPMENT_STATUS.md
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

## What is not in the tree

There are **no** directories such as `src/`, `backend/`, `frontend/`, `app/`, `server/`, `client/`, `sql/`, `migrations/`, `public/`, or `tests/` in this clone.

If those folders are added later, update this document from the real tree rather than from a template.

## Git connection

| Setting | Value |
|---------|--------|
| Remote name | `origin` |
| Fetch / push URL | `https://github.com/Saravana65/TRADEGRID.git` |
| Branch | `main` |
| Commits on `main` at clone | None |

Preserving history: the clone did not overwrite application work because the remote had no files. Later commits should be additive unless you explicitly choose otherwise.

## Related documents

- [../README.md](../README.md)
- [TECH_STACK.md](TECH_STACK.md)
- [SETUP_GUIDE.md](SETUP_GUIDE.md)
