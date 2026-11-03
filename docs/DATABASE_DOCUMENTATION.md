# TRADEGRID – Database Documentation

## Verification result

**No database design is present in this repository.**

Inspected clone of [Saravana65/TRADEGRID](https://github.com/Saravana65/TRADEGRID):

- No `.sql` scripts
- No migration folders
- No ORM models
- No schema dumps
- No database configuration files (for example `database.yml`, Prisma schema, Sequelize models, Entity Framework contexts)

Therefore this document **does not list tables, columns, relationships, indexes, or constraints**. Inventing a schema (users, orders, trades, portfolios, etc.) would not match the repository.

## Planned data domains (not a schema)

The GitHub repository description implies that a future design might store information about:

- Virtual instruments / market state
- Orders and matching outcomes
- Portfolios
- Analytics snapshots
- Admin-triggered market events

Those are **topic labels**, not tables. Names, types, keys, and constraints are **undefined** until SQL or models are committed.

## Entity-relationship diagram

**None.** There are no verified entities to draw.

When schema files exist, this section should include a diagram generated from those files only.

## Constraints

No `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE`, `CHECK`, or `NOT NULL` constraints were found because no DDL exists.

## How to update this file later

When database artifacts are added:

1. List each script or migration file and what it does.
2. Document every table from that source (columns, types, nullability).
3. Document relationships only if they appear as foreign keys or equivalent model associations.
4. Credit any SQL copied from external repositories or tutorials.
5. Never commit production passwords; document environment variable **names** only.

## Related documents

- [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)
- [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md)
- [SETUP_GUIDE.md](SETUP_GUIDE.md)
