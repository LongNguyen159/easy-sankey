# SQLite migration validation

> Historical record: experimental SQLite upgrade support was removed; released LocalStorage-to-SQLite migration remains required. See [current storage documentation](storage.md).
Validation date: 19 November 2026. Application version: 2.0.4.

## Source and database checks

- TypeScript application and test compilation: passed.
- Full browser suite (`npm test -- --watch=false --browsers=ChromeHeadless`):
  **69 tests passed**.
- Native SQLite/IPC suite (`npm run test:database`): **5 tests passed** under
  Electron 32.3.3, covering source-only migration, CRUD, revisions, rollback,
  scoped entry IDs, parent renaming, atomic category deletion, backups, reset,
  missing-database recovery, schema upgrades, unsupported schemas, and IPC origin/
  frame validation.
- Production Angular build: passed. Existing size and CommonJS warnings remain
  visible; budgets were not relaxed.
- Repository whitespace check: passed.

## Packaged runtime checks

The packaged smoke test creates a fresh temporary profile and seeds actual
renderer LocalStorage before Angular starts, simulating a legacy installation.
It blocks HTTP/HTTPS requests, verifies migrated values/order/timestamps/settings,
checks the absence of saved chart projections, exercises CRUD/export/reset/restore,
reloads the real application, then launches the executable a second time using
that same profile to verify restart persistence. The real user's profile is not
used. Results are retained as `smoke-result.json` in the printed temporary profile.

| Target | Installer | Packaged runtime |
| --- | --- | --- |
| Mac arm64 | Built | Passed: two launches, offline migration/restore/reload/restart |
| Windows x64 | Final installer built; Windows-native SQLite binary verified | Native Windows execution requires Windows CI |

The workflow `.github/workflows/deploy-artifacts-x64.yml` builds both supported targets
and requires native tests, browser tests, and packaged restart verification before
uploading artifacts. It has not been dispatched from this local task. Windows
runtime behavior must not be described as verified until that job passes.

Local installers are unsigned because no signing identity is configured. No
release was published and the installed application/user data were not replaced.

## Problems found and corrected during verification

- The newer SQLite driver crashed in Electron 32; switched to compatible driver
  11.10 and rebuilt against Electron's ABI instead of the host Node ABI.
- The downloaded Electron runtime was incomplete; extracted its cached official
  archive and verified the driver inside the actual Electron runtime.
- Strict IPC URL checks rejected navigation; moved to hash routing and retained
  main-window/frame checks with exact packaged entry URLs.
- Packaged reload failed when the document base resolved a hash route to a
  directory inside ASAR; corrected the base to `./index.html` and verified reload.
- Older test fixtures lacked app providers, animations, and required chart data;
  supplied those dependencies and replaced an obsolete starter-page assertion.
- Tracker income can be edited by the user; preserved it as configuration while
  making current spending updates runtime-only.
- Chart calculation and views formerly caused incidental writes; calculations
  are pure, chart reads do not save source data, and tracking refreshes stay in memory.

## Final platform scope

Intel Mac support was removed at the user's request. The Mac build script and
packaging configuration target arm64 only, and CI has no Intel Mac job.
Earlier Intel test artifacts were removed and are not supported deliverables.

Final arm64 smoke evidence: `easy-sankey-packaged-YQOKkB` under the OS temporary
directory. It records two successful packaged launches with offline legacy
migration, full restore, UI reload, and restart persistence. The earlier tested
Intel build is not a supported target. GPU acceleration is disabled by the smoke
runner for CI compatibility; the arm64 application also passed earlier normal-GPU
launch checks.

Supported delivery artifacts:

- `releases/v2.0.4/darwin/arm64/Easy Sankey-2.0.4-arm64.dmg`
- `releases/v2.0.4/darwin/x64/Easy Sankey Setup 2.0.4.exe` (cross-built on Mac;
  the directory's `darwin` component reflects the build host, not the target).

The Windows package contains a PE x86-64 SQLite native module. The Mac package
contains an arm64 Mach-O SQLite native module. The development dependency is
restored to arm64 after cross-building so local Electron development remains usable.
