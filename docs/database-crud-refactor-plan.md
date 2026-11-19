# Agent plan: simplify application logic around database CRUD

## Objective

Refactor Easy Sankey so SQLite is the source of truth and normal application
actions use targeted, asynchronous create/read/update/delete operations. Remove
the LocalStorage-shaped snapshot architecture, rather than merely renaming it.
Preserve existing financial behavior, offline operation, data, and user workflows.

This is a second refactor after the SQLite migration. Do not repeat the migration
project described in `docs/sqlite-migration-plan.md`; its starting-point section is
historical. Inspect the current working tree, including uncommitted files, before
implementing. Preserve unrelated work. Implement the stages below in order; finish
each stage with its checks and record actual results. Do not publish a release.

## What exists today

- `src/app/storage/sqlite-client.ts` hydrates the entire database into a global
  snapshot, serves synchronous key reads, serializes generic mutations, and even
  calculates every month when reading `monthlyData`.
- `AppStorage` retains `read/write/delete/writeBatch` keyed by former storage
  names. Production uses SQLite, but tests can inject a browser `Storage` adapter.
- `MonthRepository` reads every month and replaces `monthlyData` for individual
  month changes. `DataService.saveData()` also filters and saves the whole set.
- `database-api.ts`, `preload.js`, and `electron/storage/ipc.js` already expose
  entity CRUD. However, `state-store.js` implements those operations by loading
  `snapshot()`, editing arrays/maps, and calling `mutate()`. Merely connecting the
  renderer to these endpoints would leave the underlying problem in place.
- Categories, budgets, fixed costs, tracking configuration, and logs still use
  collection/document replacement. Preferences are accessed directly by several
  components. `DataService` owns persistence, calculation, notifications, demo
  behavior, imports, category cleanup, and multiple copies of month state.
- `utils/month-calculation.ts` is already a pure calculation boundary. Keep it.
  `SessionStore` is already separate and may continue using session storage.

## Required architecture and boundaries

`Component -> feature service -> typed async repository -> preload IPC -> main-process database operation -> SQLite`

- Keep the Electron main process responsible for SQL, validation, transactions,
  connection lifecycle, and filesystem access. Preserve the closed IPC allowlist
  and sender/frame checks. Never expose SQL or create a database HTTP server.
- Reuse and correct existing CRUD contracts instead of adding a second API.
  Repositories return source DTOs, never calculated `SingleMonthData` objects.
- Reads query the requested entity, month, collection, or date range. Writes
  update affected rows and return the committed entity/result plus revision and
  affected scopes. Normal CRUD must not return the entire database.
- Feature services may retain signals/observables for loaded views and drafts.
  These are disposable UI state, not an alternate persistence layer. Use one
  owner per loaded dataset; components must not maintain competing saved copies.
- Compute chart data and tracking spending from source records. Reading, selecting
  a month, rendering charts, and changing chart filters must never persist data.
- Keep full snapshots only for migration, recovery, backup, restore, and dedicated
  diagnostics/tests. Retain the read-only legacy migration reader and recovery
  files. Do not remove support for existing installations or backup versions.
- Avoid a generic repository framework, new state-management dependency, wholesale
  chart rewrite, or unrelated redesign. Reuse existing tables where they support
  targeted operations; JSON payload columns are acceptable for entity payloads.

## Stage 1 — Record behavior and settle contracts

1. Inventory persistent reads/writes and their callers across services, components,
   utilities, startup, and tests. Include theme/currency, onboarding/version flags,
   view/sort preferences, manual orders, essential categories, and history.
2. Capture current behavior for empty months, final-entry deletion, demo mode,
   auto-save, month switching, entry rename/delete/reparent, category removal,
   fixed-cost application, budgets, and tracker merge/replace/clear operations.
   Distinguish an unsaved empty view from an intentionally stored month. Do not
   silently change these semantics while replacing persistence.
3. Define source DTOs separately from calculated views. Keep existing identities:
   month string; `(month, entry.id)`; category `value`; fixed-cost `id`; budget
   `category`; tracker `name`. Do not change amounts to integer cents or regenerate
   existing IDs. Preserve entry order, flags, timestamps, and relationships.
4. Update `database-api.ts` with typed operation-specific inputs/results and
   validation/not-found/already-exists/conflict/unavailable/storage error codes.
   Include settings, history, tracker metadata, and compound operations missing
   from the current API. Add a typed `window.electronAPI` declaration and replace
   the duplicated `StateApi` and renderer `any` casts for database access.
5. Start with the existing global optimistic revision for simplicity. Use one
   shared renderer mutation queue that tracks revision tokens, not a data
   snapshot. Capture each command's original base revision and payload; the queue
   must not disguise stale drafts by attaching a newer revision. On a conflict,
   reload the affected scope and retain the draft for reconciliation; never
   automatically replay a stale whole-month replacement. Return revision tokens
   consistently for create/update/delete/reorder and compound commands. Consider
   scoped revisions only if measured conflicts justify a later change.

Deliverable: a short contract/behavior checklist and a passing baseline for the
existing database, browser, and build checks. Record pre-existing failures.

## Stage 2 — Make main-process CRUD genuinely targeted

1. Refactor `electron/storage/state-store.js` into clear domain operations, extracting
   small modules only where they simplify ownership. Prepare parameterized SQL
   once per connection. Eliminate `snapshot()/mutate()` from normal CRUD paths.
2. Query months directly from `months`; query entries using their month/ID and
   position. Support month/date-range reads for overview and analysis screens
   without loading preferences, history, or unrelated collections. Preserve
   ordering explicitly. Avoid per-month queries when one bounded join/read works.
3. Use direct inserts, updates, deletes, and scoped reorder statements for entries
   and `records` collections. Validate changes against relevant month entries and
   category definitions, not the full application snapshot. Parent rename/delete
   may legitimately update several related entries in the same month.
4. Store tracker targets as individually addressable records, with target surplus
   and user-editable average income in a small metadata document. Add an
   entry-history table keyed by month/entry with explicit ordering so one history
   update does not replace the entire `logs` document. Preferences may remain
   typed per-key documents. Keep existing collection/order storage when adequate.
5. Add an incremental schema migration for changed storage. Preserve original
   history strings, values, and order; do not invent parseable dates for legacy
   display-only timestamps. Preserve the existing effective five-item history
   limit and month-lastUpdated-based retention unless a separate change is
   explicitly approved. Keep pre-upgrade backups and newer-schema refusal.
6. Put revision checking, writes, associated timestamp/history changes, and revision
   increments inside the same transaction. No-op reads/writes must not alter
   timestamps or generate history. Failed commands leave all rows unchanged.

Required transactional operations:

| Operation | Atomic behavior |
| --- | --- |
| Entry edit | Update entry, repair child references on rename, validate hierarchy, update month timestamp, and append history when the workflow requests it. |
| Entry deletion | Preserve current reparenting behavior, remove associated history, and apply the recorded empty-month policy. |
| Month deletion | Delete that month and its entries/history only. |
| Month import | Validate, replace destination entries/history as currently specified, and add only referenced missing category definitions. |
| Category deletion | Clear affected entry/template sources and remove associated budgets, tracker targets, essential selections, and manual-order references. Preserve unrelated records. |
| Bulk form save | Apply explicit creates/updates/deletes/order changes within one month transaction; validate the final hierarchy together. |
| Budget/tracker bulk action | Apply intentional batch edits and metadata together without replacing unrelated configuration. |
| Restore/reset | Preserve existing validation, recovery copies, migration markers, and transactional replacement. |

Deliverable: SQLite and IPC tests prove targeted operations, rollback, ordering,
relationship updates, and unchanged unrelated data. Verify normal CRUD does not
invoke snapshot reconstruction, using a narrow test hook or query instrumentation.

## Stage 3 — Replace the renderer persistence boundary

1. Replace snapshot-backed `SqliteClient` with an injectable typed bridge client
   and the revision/command coordination from Stage 1. Separate database startup
   and legacy recovery from normal runtime queries. Initialize required settings
   and definitions before dependent services become ready; do not hydrate all
   financial data just to bootstrap Angular.
2. Rewrite `MonthRepository` to use actual asynchronous month/entry operations.
   Add small repositories for categories, fixed costs, budgets, tracking, settings,
   and history where used. Do not reproduce a string-key `AppStorage` facade.
3. Give feature services explicit loading/error/ready state. Load data in an
   awaited initialization path rather than performing untracked asynchronous
   writes from constructors. Show persistence failures without claiming success.
4. Publish committed changes only after success, then update/requery affected
   views. Preserve drafts on failure. Refresh overview/active month/tracking views
   after shared changes such as category deletion. Discard out-of-date query
   responses when the user changes months/filters quickly.
5. Test with injected async repository/bridge fakes and real main-process SQLite
   tests. Remove `PERSISTENT_STORAGE` and browser `Storage` persistence fakes after
   their consumers are converted. Keep session-state tests separate.

Deliverable: feature services use typed repositories; their committed state stays
consistent after rejected writes and out-of-order reads.

## Stage 4 — Simplify feature logic and migrate callers

1. Make `DataService` a focused month-view coordinator: load source records,
   invoke `calculateMonth`, and expose active/range views. Move database commands
   to repositories and user notifications to action callers. Remove `saveData`,
   whole-app `replaceAll`, and production/test category-deletion branches. Keep
   adapters for chart subscriptions only while callers are being migrated.
2. Replace `processInputData` calls with explicit query, preview, or save intent.
   Demo and unsaved form previews call pure calculation without writing. Use
   targeted entry CRUD for row actions, including the insert-expense dialog.
3. Preserve the form's batch-edit workflow: compare a valid draft with its last
   committed month source and submit one changeset transaction. Do not issue one
   IPC save per keystroke or save invalid intermediate rename/hierarchy states.
   Keep debounce behavior; serialize saves and flush pending valid edits before
   month switching/navigation. Keep the original month attached to each command.
4. Commit amount edits and requested history together. Remove the current
   `setLog()`-then-`processInputData()` sequence, which can save history before an
   entry save fails. Preserve calculator expressions used as history values.
5. Convert category/budget/tracking services to explicit CRUD/batch commands.
   Tracking spending and percentages remain derived memory-only values;
   user-editable average income remains persisted configuration. Preserve existing
   zero-target/merge behavior documented in Stage 1 rather than redesigning it.
6. Move fixed-cost persistence out of `DataService`. Route component preference
   reads/writes through a small settings service. Separate `SessionStore` into its
   own file if `app-storage.ts` is removed.
7. Update `input-list`, `fix-cost-input`, `budget-list`, `budget-slider`, category
   dialogs/managers, settings, month pickers, storage manager, main pages, charts,
   `data-utils.ts`, app startup, and every inventoried caller. Convert sync reads
   to awaited loads or subscriptions; do not hide async reads behind defaults that
   can overwrite saved data. Keep loading a month separate from saving a month.
8. Keep backup/month-transfer formats compatible via dedicated serializers. Full
   export may query everything; ordinary CRUD may not. Update packaged smoke
   scripts that call the old API. After restore/reset, clear or reload all loaded
   state; a full application reload remains acceptable for those operations.

Deliverable: existing screens work through database CRUD with no normal runtime
dependency on generic storage keys or a full-app snapshot.

## Stage 5 — Remove compatibility code and verify completion

- Delete `AppStorage`, legacy mutation adapters, snapshot calculation, obsolete
  synchronous repository methods, duplicate persistent caches, and unused generic
  mutation IPC channels after their final callers are converted. Keep legacy
  format translation isolated in migration/backup code. Update `docs/storage.md`.
- Review remaining `localStorage`, `AppStorage`, `replaceAll`, `writeBatch`,
  `legacyChanges`, `state.mutate`, and storage-named methods. Production
  LocalStorage access is allowed only in the read-only migration reader; test
  legacy seeding remains allowed. There must be no browser persistence fallback.
- Verify create/edit/delete/reorder, parent rename/reparenting, scoped duplicate
  entry IDs, category cleanup, precision/order/timestamp preservation, concurrent
  saves, conflicts, failed transactions, and pending edits during month switching.
- Verify history atomicity/retention; demo never saves; reading and recalculating
  charts never write; empty/final-entry behavior; preference restart persistence;
  budget/tracker operations; month copy/import; full backup v1/v2 restore; reset;
  old-schema migration; missing/corrupt database recovery; IPC authorization.
- Seed many months and confirm editing one entry neither fetches every month nor
  returns a full snapshot. Check one entry edit and one settings write affect only
  their intended rows plus required revision/history metadata. Confirm overview
  queries load only their requested financial scope.

Run the repository's supported checks:

```sh
npm run test:database
npm test -- --watch=false --browsers=ChromeHeadless
npm run build
git diff --check
```

Use the supported Node/Electron/native-driver setup documented in
`docs/storage.md`. Build a Mac arm64 package and run `npm run test:packaged --
"<packaged executable>"` against an isolated temporary profile, exercising the
new normal UI path as well as restart persistence. Require Windows x64 CI for
Windows runtime verification; do not claim it passed based on a cross-build.
Do not modify the user's installed app or real financial database for testing.

The final agent report must identify removed complexity, remaining intentional
snapshot uses, schema/compatibility changes, actual validation results, and any
unverified platform checks. Completion means real targeted CRUD across both
renderer and main process, not just new interfaces around the old snapshot path.
