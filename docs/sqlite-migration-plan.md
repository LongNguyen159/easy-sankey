# Agent execution plan: migrate Easy Sankey to local SQLite

## Objective and completion rule

Replace LocalStorage as the application's persistent store with a local SQLite
database. Deliver working domain CRUD APIs, automatic migration of existing data,
full backup export/import, month copy/import, and a functioning packaged Electron
application. Finance data must remain usable offline and survive restarts and app
upgrades. Do the implementation, tests, packaging, and verification; do not stop at
introducing interfaces or installing a database library.

Work in the existing repository and preserve user changes. Read applicable
AGENTS.md instructions first. Implement in reviewable stages, without deploying or
publishing releases. Record actual validation results and any unavailable platform
checks; never describe an untested installer as verified.

## Starting point

The first storage refactor is already implemented:

- `src/app/storage/app-storage.ts`: typed, synchronous LocalStorage adapter and a
  separate session adapter. It still stores computed chart data.
- `src/app/storage/month.repository.ts`: synchronous month CRUD, backed by the
  complete `monthlyData` JSON document.
- `src/app/services/data.service.ts`: calculations, state, saving orchestration,
  category deletion, and month import. Calculation still adjusts some raw values.
- `src/app/utils/data-transfer.ts`: version 1 full and month JSON transfer formats,
  validation, and legacy multi-key rollback.
- Feature services own categories, budgets, tracking, logs, currency, and theme.
  Several screens directly call the typed storage boundary for preferences/forms.
- `main.js` and `preload.js`: Electron entry points, existing clipboard bridge,
  updater, and a separate local forecasting server. The forecasting server is not
  the database API and must not become one.
- `package.json`, `scripts/deploy-mac.js`, and `.github/workflows/build.yml`:
  packaging configuration, Mac packaging script, and Windows x64/Mac x64 builds.
  Local Mac arm64 packaging is also documented in README.md.

Reinspect these files before editing. The existing 25 targeted storage/category/
form tests and development build passed during the first refactor; rerun the
appropriate checks against the implementation you produce.

## Required architecture

Use this flow:

`Angular UI -> async domain API -> narrow preload bridge -> Electron handlers -> repositories/transactions -> SQLite file`

The main process owns the database connection and filesystem operations. A worker
may own database execution if needed to keep bulk operations responsive. Persist
the database under `app.getPath('userData')`, outside the installation, app bundle,
ASAR, and working directory. Preserve app identity and userData location across
upgrades. Use one application instance, or explicitly handle multiple writers.

Choose an Electron-compatible SQLite driver; evaluate `better-sqlite3` first.
Verify it against the project's actual Electron runtime and target architectures.
The build machine's Node version is not the Electron runtime's Node version. Do
not assume `node:sqlite` exists because CI uses Node 26. Prove a packaged database
open/write/read/restart before migrating the whole app.

Keep `contextIsolation: true` and `nodeIntegration: false`. Expose named operations,
not raw SQL, database handles, filesystem access, arbitrary IPC channels, or a
localhost HTTP database server. Validate payloads and IPC sender/frame identity in
the main process. Use prepared statements and explicit transactions.

All persistent app state belongs in SQLite, including preferences. Temporary
copied entries and session display state may remain in session storage or memory.
LocalStorage may only remain in a dedicated, read-only legacy migration reader;
no normal runtime fallback or ongoing writes are allowed.

A standalone browser database is outside this migration's scope. Keep Angular
browser compilation and component tests usable through injected test adapters.
When opened without the Electron bridge, show an explicit desktop-required state;
do not silently save to LocalStorage or report successful persistence.

## Stage 1 — Inventory, contracts, and packaged driver proof

1. Inventory every stored value, consumer, initialization side effect, and mutation
   path. Include months/entries, categories and their order, fixed costs, budgets,
   manual budget order, tracking targets, essential categories, edit history,
   currency, theme, view/sort preferences, onboarding/version flags, and session
   state. Capture defaults and deletion/reset behavior.
2. Define shared serializable DTOs, runtime validators, and Promise-based domain
   contracts. Keep persisted models distinct from `SingleMonthData`, which becomes
   a calculated runtime view. Do not merely replace a synchronous return type with
   a Promise while leaving existing callers unchanged.
3. Define error codes such as validation, already-exists, not-found, conflict,
   unavailable, and storage-failure. Preserve useful error details across IPC
   without exposing SQL or private paths in user messages.
4. Add the driver, database connection lifecycle, and a tiny schema. Build and run
   a packaged app that writes a record to userData and reads it after restart.
   Fix dependency inclusion, native rebuilding, ASAR unpacking, and architecture
   issues now. Remove the proof-only feature when real repositories replace it.

Exit: API contracts and storage inventory are documented; the packaged runtime
can use the selected driver on the development platform.

## Stage 2 — Schema and transactional domain operations

Design versioned schema migrations and implement real SQLite repositories.
Suggested entities:

| Entity | Required persisted information |
| --- | --- |
| Months | Stable YYYY-MM key, original last-updated metadata |
| Entries | ID, owning month, type, name, amount, hierarchy/category reference, fixed/demo flags, edit timestamp, manual order |
| Categories | Stable existing ID, label, icon, light/dark colors, order |
| Fixed-cost templates | Stable ID, source/hierarchy, amount, flags, order and edit metadata |
| Budgets | Category reference, target amount, manual order |
| Tracking targets | Category, target spending, configured surplus target and other non-derived configuration |
| Edit history | Month, entry ID, timestamp, value, stable ordering |
| Preferences | Typed settings and application flags |
| Migration metadata | Schema version and completed legacy-import state |

Resolve these compatibility details explicitly:

- Existing entry IDs may repeat across months. Use scoped identity, such as
  `(month, entry_id)`, or a lossless mapping; do not assume global uniqueness.
- `source` currently represents either a category ID or a parent entry name.
  Preserve this meaning while normalizing references. Renaming a parent must not
  orphan children. Treat dangling references and cycles explicitly; never silently
  discard an entry to satisfy a foreign key.
- Preserve manual ordering independently from edit timestamps, including templates
  and categories. Preserve original user timestamps during reads and migrations.
- Use a documented monetary representation that round-trips existing values.
  Do not assume all supported currencies or existing inputs use two decimals.
- Store user choices rather than calculated chart series, totals, formatted
  balances, current tracking spending, or calculated averages. Audit each tracking
  field before deciding whether it is configuration or derived data.

Enable foreign keys on every connection. Add useful indexes and constraints, and
choose/document journaling, durability, busy-timeout, and connection-close behavior.
Reject a database from a newer unsupported schema without modifying it. Back up
before destructive schema upgrades.

Required APIs include:

- Month list/get/create/update/delete and explicit month replacement.
- Entry list/get/create/update/delete and reordering, scoped to a month.
- Category list/create/update/reorder/delete.
- Fixed-cost template CRUD/reordering; budget CRUD/reordering; tracking target CRUD;
  typed preference get/update; history read/write/delete as the app requires.
- Transactional month import, full restore, category deletion, reset, and initial
  legacy migration. Expose use-case operations so the renderer cannot leave a
  multi-table change half-applied.

Specify duplicate creation, missing update, idempotent delete, and upsert semantics.
Distinguish patching from replacement and define when lastUpdated changes. Serialize
writes and prevent overlapping stale saves; add revision/conflict checks if the UI
can submit an older snapshot after a newer change.

Category deletion must retain financial entries while clearing/reassigning their
references consistently in entries, templates, budgets, tracking, essential flags,
and ordering metadata. Month deletion must handle dependent history. Failed
operations must leave persisted state unchanged.

Exit: repositories and domain transactions work against actual temporary SQLite
files, with tests for constraints and rollback.

## Stage 3 — Pure calculations and asynchronous application integration

1. Extract month computation from DataService into a pure calculation module with
   explicit category/context inputs. It must not persist, change onboarding/demo
   state, emit events, or update timestamps. Characterize the existing parent-value
   adjustment behavior and preserve it deliberately, separating any input
   normalization from read-only chart projection.
2. Rebuild runtime views from persisted source records: Sankey, pie, treemap,
   totals, remaining balance, yearly summaries, trends, predictions, and tracking.
   Cache in memory when useful and invalidate after relevant mutations. Reopening
   a chart must never write to the database.
3. Introduce one coordinated initialization path: open DB/schema readiness -> legacy
   migration if needed -> load preferences/categories/source records -> derive
   views -> allow normal editing. Remove eager synchronous reads from service
   field initializers and guard onboarding/theme/demo initialization from races.
4. Migrate every service, component, template handler, and subscription to the async
   contracts. Await persistence before publishing success; disable duplicate
   submissions and display actionable save/load failures. Reload affected shared
   state after imports, reset, category edits, and deletion.
5. Demonstration data must not become permanent user data merely because a chart
   was computed. Apply default categories only to genuinely new installations;
   an intentionally empty category list is not a missing default.
6. Keep clipboard, forecasting, updater, theme, navigation, budget editing,
   calculator history, fixed costs, sort order, and finance-manager behavior working.

Exit: all existing features operate through the SQLite-backed API; no runtime
service or screen depends on legacy storage encodings or synchronous startup reads.

## Stage 4 — Safe automatic migration from LocalStorage

1. Implement a dedicated reader for the existing persisted keys. Capture the legacy
   snapshot before any old initialization, cleanup, demo seeding, or version-update
   code can overwrite it. Electron's renderer origin/profile matters: test this
   using data written by the old packaged app, not only seeded development data.
2. Validate and normalize the entire snapshot before changing financial data.
   Include settings omitted by old backup exports, such as budget view. Distinguish
   missing data from malformed data. Report recoverable problems and retain the
   original snapshot; never silently treat corrupt data as a new installation.
3. Import all related records in one database transaction. Preserve IDs, source
   relationships, exact stored input values, ordering, flags, and timestamps. Ignore
   saved chart projections and regenerate them from the imported sources.
4. Verify record counts, identity sets, source relationships, amounts, ordering,
   metadata, and representative regenerated totals against the legacy fixture.
   Commit the completion marker with the successful import. A failed or interrupted
   migration must be safe to retry without duplicates.
5. On subsequent launches, SQLite is authoritative. Never merge retained legacy
   data back automatically. If SQLite already has unmarked user data, stop with a
   recovery path rather than overwriting it. Keep legacy data and a recovery
   snapshot until verified migration; cleanup must be explicit and safe.
6. Reset and full restore must preserve/update migration status so retained legacy
   data cannot resurrect after restart. Keep backup metadata separate from user
   data replacement. A missing/corrupt database after prior migration must have a
   deliberate recovery path rather than blindly importing an old snapshot.

Exit: fresh install, upgrade, restart, interrupted migration, migration failure,
reset, and restore each produce the correct data set without loss or duplication.

## Stage 5 — Export, import, and recovery

- Define a version 2 full JSON backup containing source records, category/order
  definitions, templates, budgets, tracking configuration, history, and user
  preferences. Include app/format version and exported timestamp. Exclude derived
  charts, machine-specific paths, and internal migration markers. Distinguish
  exported user preferences from runtime/schema/onboarding version metadata.
- Continue accepting valid version 1 full backups and month payloads. Convert
  legacy formats into canonical source DTOs; ignore their computed projections.
  Reject unknown future versions and invalid references before touching live data.
- Retain full replacement semantics with clear confirmation. Create a recoverable
  pre-restore snapshot, validate first, and replace user records in one transaction.
  Cancellation, malformed files, and disk/write failures leave live data intact.
- Retain month copy/export/import. Include referenced category definitions, preserve
  the current ID-regeneration behavior when pasting into another month, and replace
  only the destination month. Preserve unrelated months and reject invalid cycles.
- Generate full exports from a consistent database read snapshot. Use main-process
  file dialogs and reliable file writes for desktop export/import. Handle cancel,
  unreadable files, unwritable destinations, and incomplete output files.
- JSON is the required portable backup feature. If also offering a raw SQLite
  backup, use SQLite's backup mechanism or another documented consistent snapshot
  method; do not copy an active database file while ignoring its journal/WAL.

Exit: export -> change/reset -> import -> restart reproduces all supported source
records, settings, order, and history; all charts are regenerated correctly.

## Stage 6 — Packaged Electron delivery and verification

1. Include all database modules, migration files, shared validators, driver binaries,
   and runtime dependencies in electron-builder's packaged file set. Verify paths
   inside the installed application, not just `electron .` from the repository.
2. Configure the driver rebuild for the actual Electron ABI and each architecture.
   Avoid inadvertently reusing a host-Node binary in Electron or vice versa.
3. Update packaging scripts and CI. Cover Windows x64, Mac x64, and Mac arm64;
   document any architecture that cannot be verified in the current environment.
   Preserve the existing application ID, updater integration, and offline operation.
4. Make the production Angular build and installers pass. If existing bundle/style
   budgets block packaging, diagnose and make a justified fix; do not hide failures
   or simply report a development build as proof of a working package.
5. Run installed/packaged smoke tests with a separate temporary userData profile:
   fresh launch, create/edit/reorder/delete, restart persistence, legacy upgrade,
   export/import, category deletion, fixed costs, reset without resurrection, and
   database initialization/save failure. Test upgrades with the same profile.
6. Verify launch without a network connection, persistence after installer updates,
   a writable DB outside ASAR, and absence of native-module/load-path errors.
   Close/checkpoint safely on quit. Ensure bulk imports do not freeze the app.

Exit: a packaged build has been launched and exercised on each claimed supported
platform/architecture. CI produces installers and records smoke-test results.

## Required validation and final handoff

Maintain meaningful tests for:

- Real SQLite CRUD, identity scope, ordering, references, transactions, schema
  upgrades, unsupported schema versions, failed writes, and simultaneous saves.
- Calculation parity from source data, including nested expenses, taxes, parent
  normalization, empty months, and deleted categories.
- IPC validation and unauthorized sender rejection; async startup and failures.
- Legacy migration retries, corrupt snapshots, preserved timestamps/values, defaults,
  and reset/restore behavior that does not reimport retained old data.
- Version 1 compatibility; version 2 round trips; month import; invalid/future files;
  cancellation and rollback. Verify both persistence and the visible app state.
- Existing affected component/service behavior and packaged smoke tests above.

Completion checklist:

- [ ] SQLite is the sole normal persistent store; no LocalStorage fallback exists.
- [ ] CRUD and multi-record operations use working, validated async domain APIs.
- [ ] Only source/configuration data is persisted; chart results are runtime views.
- [ ] Existing installations migrate without losing data, order, or edit history.
- [ ] Full and month export/import work, including legacy JSON compatibility.
- [ ] Packaged Electron reads/writes its local DB and survives restart/upgrade.
- [ ] Supported installers build and have recorded platform smoke-test evidence.
- [ ] Errors are visible and recoverable; failed writes do not report success.
- [ ] Documentation covers DB location, schema evolution, backups, recovery,
      development, packaging, and the standalone-browser limitation.

In the final response, explain the implemented architecture and user-visible
behavior, list exact checks and packaged artifacts, and identify any remaining
unverified platform checks. Do not mark the complete objective achieved if packaged
runtime verification or required migration/import behavior remains outstanding.

## Reference documentation

Verify selected versions during implementation rather than copying commands from
newer documentation into this project's older Electron runtime without checking.

- [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron native module rebuilding](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [SQLite consistent backups](https://sqlite.org/backup.html)

## Implementation record

The migration is implemented. See `docs/storage.md` for the resulting architecture,
source schema, APIs, legacy migration, backup/recovery, build instructions, and
platform verification commands. Runtime reads use a hydrated, detached snapshot;
all database APIs and commits are asynchronous. This avoids unnecessary UI loading
round trips while preserving awaited saves and transactional persistence.

Validation is recorded in `docs/sqlite-validation.md`. Platform installer smoke
tests are required in CI before artifacts are uploaded. Unexecuted platform checks
must remain explicitly identified in that record.


## Updated platform scope

Per the user's final instruction, supported targets are Apple Silicon Mac (arm64)
and Windows x64. Intel Mac support is discontinued. Do not build, publish, or
require validation of Mac x64/universal installers; this overrides earlier Mac
x64 requirements in this plan. Windows x64 remains supported.
