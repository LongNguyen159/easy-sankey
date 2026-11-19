# Local SQLite storage

Easy Sankey uses a local SQLite database owned by Electron's main process. Normal
application data is never written to LocalStorage. Browser-only launches explain
that the desktop application is required. Session copies/display state remain in
session storage and are intentionally excluded from backups.

## Data and APIs

The database is `finance.sqlite` inside Electron's `app.getPath('userData')`.
For an installed Mac application this is normally under
`~/Library/Application Support/Easy Sankey`; Windows uses the application's folder
under `%APPDATA%`. Unpackaged development runs use `<project>/.local/finance.sqlite` instead, with an
isolated browser profile in `.local/`. Smoke tests retain their explicit temporary
profiles. The installed application continues using its own application-data folder.
The installed executable and ASAR never contain the user's database.

- `electron/storage/state-store.js` owns schema migrations, transactions, validated
  source writes, optimistic revision checks, imports, and recovery metadata.
- `months` and `entries` store month metadata and individual ordered source entries.
  Entry identity is scoped to its month. Foreign keys cascade month deletion.
- `records` stores ordered categories, budgets, and fixed-cost templates by stable
  identity. `documents` stores typed preferences, tracking targets, and history.
- No Sankey/pie/treemap arrays, calculated totals, formatted balances, or current
  tracking spending are saved. Existing monetary numbers round-trip without
  conversion to assumed two-decimal currency units.
- The private migration marker/revision lives in `migration_metadata`. The current
  schema version is 3; newer unsupported versions are refused without modification.

`electron/storage/ipc.js` exposes a closed operation set. It validates requests and
accepts only the application's main window/frame at its packaged file URL. Preload
exposes month/entry/category/fixed-cost/budget/tracking CRUD and reordering, plus
transactional snapshot updates, category deletion, backup, restore, and reset.
There is no SQL or arbitrary IPC API exposed to the renderer.

`src/app/storage/database-api.ts` describes the asynchronous Electron contracts.
`sqlite-client.ts` hydrates a detached source snapshot before Angular starts and
serializes asynchronous commits. UI services read that runtime snapshot; writes
are awaited before success notifications. A rejected write does not advance the
snapshot. Domain revisions reject stale writes, and input saves are serialized.

`AppStorage` is the typed application boundary. Its optional `Storage` injection
exists solely for isolated tests. It has no production LocalStorage fallback.
`MonthRepository` supplies application month operations. Category deletion, month
import/replacement, month/history deletion, reset, and full restore use transactions.

`utils/month-calculation.ts` rebuilds runtime views from source records. Calculation
has no persistence, UI, timestamp, or notification side effects. Its returned input
projection retains the existing parent-total normalization behavior without
mutating source inputs. Charts can be regenerated after calculation code changes.

## Upgrade and recovery

On first launch, a dedicated reader captures existing LocalStorage before Angular
services or onboarding start. The main process validates the complete snapshot,
imports source records and settings in one transaction, verifies the canonical
records, and marks migration complete. Original IDs, amounts, ordering, flags,
relationships, and edit timestamps are retained. Computed legacy chart data is
ignored. Original LocalStorage is retained read-only for recovery.

`finance.sqlite.legacy.json` is a private recovery copy of the original snapshot;
it may contain legacy chart fields, but these are not part of normal database data.
`finance.sqlite.initialized` prevents a missing database from triggering import of
an obsolete LocalStorage snapshot. Reset/restore preserve migration status. If the
database is missing, startup offers a full-backup file input instead of silently
resurrecting old data. Malformed migration data is reported with the original data
retained, and can be replaced with a valid full backup through that recovery input.

Before schema upgrades, SQLite makes a consistent `.schema-<version>-<time>.sqlite`
backup. Before full restore, the app writes a source snapshot to
`finance.sqlite.before-restore.json`. Keep the entire userData directory backed up.
Do not copy only a live `finance.sqlite` while ignoring its WAL/journal. Close the
application first or use its JSON export feature.

For a corrupt database that cannot be opened, quit the application, preserve the
entire userData directory, and rename the corrupt database and its WAL/SHM files
out of the way. Keep the `.initialized` marker. Relaunch and use the recovery file
input to restore a full JSON backup. Do not delete your retained recovery files.

## Export/import and reset

The Settings dialog exports a version 2 full JSON backup through a native save
dialog. It contains source entries, definitions, order, templates, budgets, tracking
configuration, history, and user preferences. Runtime onboarding/version flags,
internal migration markers, paths, and chart projections are excluded.

Full import accepts version 1 and version 2 JSON. It validates before replacement,
requires confirmation, creates a recovery snapshot, and replaces user data in one
transaction. Invalid/unsupported data or a failed transaction leaves live data
unchanged. The app reloads after success. Month clipboard export/import remains
compatible and replaces only the destination month and referenced new categories.

Reset erases SQLite user records and session state, then reloads the application.
It cannot reimport the retained legacy snapshot. LocalStorage is no longer an app
reset mechanism.

## Development, tests, and packaging

Use Node 22.22+ in the Node 22 series. `better-sqlite3` 11 is compatible with this
project's Electron 32 runtime. Installing it against Node 26's ABI can fail; use the
supported build Node version. `npm ci` rebuilds the driver for Electron through the
postinstall hook. After changing native dependencies, run `npm run rebuild:electron`.

- `npm test -- --watch=false --browsers=ChromeHeadless`: all browser/component tests.
- `npm run test:database`: real SQLite and IPC tests under Electron's Node runtime,
  not the build machine's Node ABI.
- `npm run deploy-mac -- --arm64 --publish never`: production Mac arm64 DMG.
- `npm run deploy-win -- --x64 --publish never`: Windows installer.
- `npm run test:packaged -- "<packaged executable>"`: two isolated application
  launches verifying UI startup/reload, CRUD, source-only backup, restore, reset,
  and restart persistence. Test profiles and reports are created under the OS temp
  directory; the user's real data directory is untouched.

CI builds Windows x64 and Mac arm64, runs database and browser tests, and
runs the packaged smoke test before uploading installers. Native binaries are
unpacked from ASAR. Production bundle warnings remain visible; no build budgets
were relaxed. Local builds without a signing identity are unsigned. Intel Macs are not supported.
