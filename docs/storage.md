# Storage refactor

This is the first stage of the database migration. The underlying storage and saved
format are unchanged, including computed chart data. No data migration runs yet.

## Boundaries

- `storage/app-storage.ts` owns the browser adapters, typed document and preference
  keys, serialization, backup replacement, and clearing data. `SessionStore` keeps
  temporary copies and display state separate from persisted finance data.
- `storage/month.repository.ts` owns month persistence. `list` and `get` read detached
  snapshots. `create` rejects duplicates; `update` rejects missing months; `upsert`
  handles either case; `delete` reports whether a month existed. `replaceAll` is an
  explicit bulk operation. `importMonth` saves a copied month and new categories
  using the legacy rollback mechanism.
- `DataService` retains calculation, input validation, orchestration, and runtime
  notifications. It delegates month reads and writes to the repository.
- Feature services own their signals and business rules. They use typed storage
  reads/writes instead of knowing browser keys' encoding. Screens use this same
  boundary for preferences, fixed-cost forms, backup/restore, and reset actions.
- `utils/data-transfer.ts` retains the existing transfer format and validation.
  Its low-level Storage helpers are called by the adapter, not by screens.

Browser storage globals belong only in the adapter factories. Tests may inject
in-memory adapters through `PERSISTENT_STORAGE` and `SESSION_STORAGE`; production
code should not access `localStorage` or `sessionStorage` directly.

Writes throw when persistence fails. The adapter has no cache to become stale after
an import. Existing category and tracking recovery paths for corrupt JSON remain.
Legacy multi-key replacement attempts rollback after a failed write; this is not a
database transaction and does not guarantee recovery after a process crash.

## Remaining stages

1. Extract month calculation into a pure function and distinguish persisted source
   records (entries, month, edit timestamp) from calculated runtime views. Update
   backup validation to read old backups and export the new version explicitly.
2. Introduce asynchronous repository contracts and explicit app initialization,
   loading, and save-error handling. Add domain repositories for entries, categories,
   budgets, templates, tracking targets, and edit history. Group related changes,
   including category deletion, in real transactions.
3. Implement the database adapter. For desktop SQLite, keep database access in the
   Electron main process and expose narrow, validated operations through preload.
   Decide whether browser builds use IndexedDB behind the same domain contracts.
4. Import legacy data once in a transaction, verify IDs, entry counts, values,
   references, order, and timestamps, and only then mark migration complete. Keep
   the original data available for recovery. Test retries and interrupted upgrades,
   backup/restore, and Mac/Windows installers before removing the legacy adapter.

The current API is intentionally synchronous to preserve behavior during this
refactor. Replacing it directly with Promise-returning database calls is not safe;
initialization and callers must be migrated together in the async stage.
