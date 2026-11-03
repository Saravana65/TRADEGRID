# TRADEGRID – Setup Guide

## What you can run today

**The application cannot be started.** The GitHub repository was empty at clone time: no install command, no start script, no environment template, and no database to create.

This guide covers:

1. Cloning and verifying Git (this works now)
2. What to add before a real local run is possible

## Prerequisites (current)

| Requirement | Why |
|-------------|-----|
| Git | Clone and version control |
| GitHub access | Fetch/push to `https://github.com/Saravana65/TRADEGRID.git` |
| Markdown viewer or editor | Read `README.md` and `docs/` |

No Node.js, Python, Java, Docker, or database server is required **until** the project adds corresponding files.

## Clone the repository

If the folder is empty:

```bash
git clone https://github.com/Saravana65/TRADEGRID.git
cd TRADEGRID
```

If you are already inside an empty project folder (as in this workspace):

```bash
git clone https://github.com/Saravana65/TRADEGRID.git .
```

Do **not** clone a second time into a folder that already contains `.git`.

## Verify connection to GitHub

```bash
git remote -v
git status
git branch
```

Expected remote:

```text
origin  https://github.com/Saravana65/TRADEGRID.git (fetch)
origin  https://github.com/Saravana65/TRADEGRID.git (push)
```

Expected branch: `main`.

At first clone, Git reported:

```text
warning: You appear to have cloned an empty repository.
```

and `git status` showed **no commits yet**. That is the verified remote state, not a local error.

## Install application dependencies

**Not applicable.** There is no dependency manifest.

When one is added, this section should quote the real commands from that file (for example `npm install` only if `package.json` exists).

## Database setup

**Not applicable.** See [DATABASE_DOCUMENTATION.md](DATABASE_DOCUMENTATION.md).

## Environment variables

No `.env.example` or similar file exists. Do not invent required keys.

## Run the project

**Not applicable.** There is no server, UI, or CLI entry point.

## Typical next setup steps (after code exists)

These are reminders, not instructions for the current repo:

1. Add a stack and lockfile; document exact versions.
2. Add a README “Run” section that matches those scripts.
3. Add `.env.example` with placeholder names only.
4. If using a database, add migrations and document how to apply them.
5. Keep secrets out of Git.

## Troubleshooting (Git only)

| Observation | Meaning |
|-------------|---------|
| Empty repository warning | Remote has no commits; clone still succeeded |
| `main` has no commits | Nothing to `git log` until the first commit |
| Nested `TRADEGRID/TRADEGRID` folder | Clone was run without `.` into a non-empty-named parent; use one project root |

## Related documents

- [../README.md](../README.md)
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
- [TECH_STACK.md](TECH_STACK.md)
- [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md)
