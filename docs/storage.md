# Local SQLite storage

The Electron main process owns `finance.sqlite` in `app.getPath('userData')`.
Development uses `<project>/.local/finance.sqlite`; installed builds use the
platform application-data folder. Finance data is not stored in LocalStorage.

## Database operations

`electron/storage/crud-store.js` provides direct row CRUD, range queries, ordering,
and explicit batch saves. `src/app/storage/database-api.ts` defines the async API.
The preload bridge exposes named operations; SQL stays in the main process.

Single-record updates do not reconstruct sibling arrays. Related parent changes
and entry history commit in one transaction. Calculated chart data is never saved.
Settings and small configuration collections load before rendering. Months and
history are queried separately. Session copies/display state use `SessionStore`.

## Development schema

The current schema is version 4. New databases are created directly in that format.
The released application used LocalStorage. Before Angular starts, a dedicated
read-only reader captures that data and imports source records/settings into SQLite
in one validated transaction. IDs, amounts, ordering, flags, edit timestamps,
history and preferences are retained; calculated chart caches are ignored. Original
LocalStorage is left untouched. Failed imports roll back and remain retryable.

Migration completion is recorded in SQLite and a small `.initialized` marker.
Reset/restore preserve completion. A missing database with that marker requires
explicit backup recovery instead of reimporting obsolete LocalStorage. Startup
provides a backup-file recovery input if migration/database initialization fails.

Historical experimental SQLite schema upgrades and automatic schema/pre-restore
backup copies remain removed. Unsupported experimental schemas are refused without
modifying their contents.

Existing current-schema development databases remain usable. Old schema/JSON backup sidecars are not read or automatically deleted. SQLite's own `-wal` and `-shm` files remain
part of normal database operation and are not obsolete backup files.

## Backups and reset

Settings provides explicit full JSON export/import. Restore validates data before
transactional replacement; failure leaves saved data unchanged. Reset clears user
records. Neither action writes automatic recovery copies. Close the application
before copying the database file manually, or use the JSON export action.

## Verification

- `npm run test:database`: real SQLite and IPC tests under Electron.
- `npm test -- --watch=false --browsers=ChromeHeadless`: renderer tests.
- `npm run build`: production frontend build.
- `npm run deploy-mac -- --arm64 --publish never`: Mac arm64 package.
- `npm run test:packaged -- "<executable>"`: disposable-profile UI CRUD, backup,
  reset/restore, reload, and restart checks. No real user database is used.

Use the project's Electron-compatible native driver. Mac arm64 and Windows x64 are
supported packaging targets; native Windows runtime validation requires Windows CI.

Released LocalStorage migration verified on 19 November 2026: **70 browser tests**
and **12 real SQLite/IPC tests** passed. Production build and Mac arm64 packaging
passed. The packaged smoke seeded real renderer LocalStorage before startup and
verified imported amounts, IDs, edit timestamps and preferences, then CRUD,
backup/reset/restore, reload, and persistence across two launches. Evidence:
`/var/folders/fr/bsm8p4kd1c35svp9x5h5rjyh0000gn/T/easy-sankey-packaged-gjCZ6z`.
Windows runtime verification requires Windows CI.
