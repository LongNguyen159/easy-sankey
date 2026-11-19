# Database CRUD refactor validation

> Historical record: experimental SQLite upgrade support was removed; released LocalStorage-to-SQLite migration remains required. See [current storage documentation](storage.md).
Validation date: 19 November 2026. Application version: 2.0.4.

## Implementation

- Removed the renderer's full application snapshot, `AppStorage`, generic mutation
  IPC, browser persistence adapter, whole-app month saves, and Storage-backed
  renderer tests.
- Added typed asynchronous repositories, scoped SQL CRUD/range queries, atomic
  month batches, category cleanup, and entry/history updates. SQL statements are
  cached per connection. Ordinary commands return scoped results, not snapshots.
- Schema 4 migrates edit history to ordered rows and tracker targets to individual
  records. Existing financial identities, amounts, flags, orders, and timestamps
  remain compatible. Backup export stays version 2; restore accepts versions 1/2.
- Month selection and chart calculation are read-only. Form saves precede month
  switching and registered-editor navigation. Failed drafts remain available;
  stale writes reject without automatic replay. History queues preserve newer
  edits staged while an earlier save is pending.
- Full-state reconstruction remains for migration, recovery, backup/restore/reset,
  and diagnostics. Small configuration collections are loaded before rendering;
  financial months and history use separate queries.
- Packaging includes only `dist/easy-sankey`, excluding temporary browser-test
  output that previously fell under the broad `dist/**/*` pattern.

## Completed source checks

- Application and test TypeScript compilation: passed.
- Browser suite: **70 tests passed**.
- Real SQLite/IPC suite under Electron: **14 tests passed**.
- Production Angular build: passed; existing size/CommonJS warnings remain visible.
- Whitespace check: passed.

The database suite covers migration/recovery, backup compatibility, unsupported
schemas, stale commands, ordering, parent rename/reparenting, category cleanup,
source precision, history rollback/retention, and a 120-month fixture confirming
an entry edit does not read unrelated months or reconstruct the full state.
Renderer tests cover failed writes/draft retention, command sequencing, stale
query responses, demo/read-only behavior, final-entry deletion, history queues,
and navigation flushes.

## Platform verification

Mac arm64 DMG: **built**. Final packaged two-launch smoke test: **passed**.
The report confirms `packaged`, `offline`, `legacyMigrationVerified`,
`uiCrudVerified`, and `restartVerified`. Evidence is retained under
`/var/folders/fr/bsm8p4kd1c35svp9x5h5rjyh0000gn/T/easy-sankey-packaged-DtHwBz`.

The smoke uses disposable temporary profiles, blocks network requests, creates a
category through the production UI, exercises database CRUD, backup/reset/restore,
reloads the UI, and verifies persistence on the next launch.
The Categories page is opened directly; forecasting is outside this offline
storage check.

Windows runtime verification requires Windows CI and was not run locally. The
existing workflow runs the database/browser suites, builds each supported target,
and runs the packaged restart smoke test before uploading artifacts. No release
was published, and the user's installed app and real financial database were not
modified.

## Direct row CRUD follow-up

Single entry and collection create/read/update/delete operations now execute
primary-key SQL directly. They do not construct a month/collection array and call
its bulk save routine. Single mutations return the affected entity (or null for
delete/reorder); UI callers explicitly query the view they need afterwards.
Parent renaming/reparenting uses scoped SQL updates in the same transaction.
Duplicate-name and hierarchy validation use SQL queries without reconstructing
source arrays. History insertion shifts/prunes ordered rows using SQL.

Category editing uses direct row operations. Individual budget edits and tracker
deletions now call row APIs as well. Whole-month form editing, fixed-cost template
forms, bulk budget/tracker configuration, and imports retain explicit batch saves;
these workflows intentionally submit multiple records. Backup/restore remains a
separate full-data operation.

A query-instrumented regression test asserts that single-entry lookup/update and
single-budget update do not load sibling payload arrays or issue collection
upserts. A renderer regression test checks that editing/deleting one budget never
calls collection replacement. Mac arm64 production packaging and two isolated
packaged launches passed after these changes; Windows runtime remains unverified
locally.
