# Database architecture

This is an Angular desktop app backed by Prisma and relational SQLite.

```text
Angular component -> feature service -> Electron API -> Prisma -> SQLite
```

The persistent schema is **prisma/schema.prisma**. Attributes have real columns;
parents, categories, budgets and history use foreign keys. No entity payloads are
stored as JSON. JSON is only a file/transport format for legacy data and backups.

## What each file does

| File | Responsibility |
| --- | --- |
| `prisma/schema.prisma` | Models, columns, relations and indexes. Prisma generates the database client. |
| `prisma/migrations/` | Committed schema changes, applied on startup. |
| `electron/database.js` | ORM queries, domain transactions and connection lifecycle. |
| `electron/migrations.js` | Apply committed migrations offline, with checksum checks and rollback. |
| `electron/import-export.js` | Validate/convert released LocalStorage and backup data into relational rows and file DTOs. |
| `electron/api.ts` | The typed operations the UI may call. |
| `electron/ipc.js` | Register those operations and check the calling window/frame. |
| `electron/preload.ts` | Expose a small typed bridge to Angular. |
| `src/app/data/database.ts` | Frontend API types, startup connection and write sequencing. |
| `src/app/services/` | UI/domain state for categories, budgets, tracking, preferences, templates and charts. |
| `tests/database/` and `tests/desktop/` | Real ORM/IPC tests and packaged migration/restart checks. |

There are no generic storage repositories, API code generators, preload templates,
or generated operation registries. Electron source is compiled by a normal esbuild
step. Only the Prisma client is generated from a data model.

## Data and upgrade behavior

The app uses `finance-relational.sqlite` in Electron's userData directory. During
development that is `.local/finance-relational.sqlite`. The experimental old
`finance.sqlite` is left untouched and is not read by this version.

The released app used LocalStorage. Startup reads it once, validates it, inserts
categories and entries, resolves parent names to foreign keys, and commits the
whole import. Original LocalStorage stays untouched. The completion marker avoids
stale reimports after reset; a missing database offers explicit backup recovery.
Full backup versions 1/2 and month clipboard transfer remain supported.

Prisma models persist source records only. Charts, totals and current tracking
spending are calculated in memory. An amount update uses a row patch; parent
renaming does not rewrite children. Multi-row forms/imports use transactions.

See [the developer guide](orm-development.md) for models, migrations, operations and
consumers, and [the API reference](database-api.md) for the available operations.

## Verified behavior

Verified on 20 November 2026: application/test TypeScript compilation, **67 browser
tests**, **17 real ORM/IPC tests**, production build and Mac arm64 packaging passed.
The packaged app passed two isolated launches, including released LocalStorage
migration, UI CRUD, backup/reset/restore, reload and restart persistence. Evidence:
`/var/folders/fr/bsm8p4kd1c35svp9x5h5rjyh0000gn/T/easy-sankey-packaged-EL3O6E`.

The supplied version-1 JSON export restored into a temporary relational database;
all source fields matched after re-export (3 months, 21 entries, 3 templates and
2 history items). Migration tests cover adding a column, rebuilding a referenced
table without losing related rows, and rolling back failed SQL. Windows runtime
verification requires Windows CI. No release was published.
