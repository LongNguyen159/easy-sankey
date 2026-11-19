# Adding a database operation

Define operations in `electron/api/operations.ts`. This is the source of truth for
operation names, channels, request types, response types, envelope validation,
descriptions, and handler bindings. The existing app-facing API shape is preserved.

For example, a month entry count would be declared as:

```ts
count: operation<{month:string},number>(
    'entries:count',
    'Count entries in one month.',
    scope,
    ({state},input)=>state.crud.countEntries(input.month),
),
```

Implement `countEntries` with a prepared `SELECT COUNT(*)` in the database layer,
and add a test. Alternatively, bind directly to an existing store method.

Run `npm run generate:api`. It automatically updates:

- The main-process runtime contract (`operations.generated.js`).
- The sandbox-compatible preload client (`preload.js`).
- The [API reference](database-api.md), including request and response types.

Frontend `DatabaseApi` is inferred directly from the contract through `ClientOf`;
there is no separately maintained method interface. The generated example would
be called as `await api.entries.count({month:'2026-11'})`.

Generation also runs before app startup, Electron startup, builds, browser tests,
and database tests. Generated files are committed so direct Electron launches can
use the last generated contract. Edit the contract/template, not generated files.
The preload template is `electron/api/preload.template.cjs`.

All calls still pass the main-window/frame/URL checks before input validation and
handler execution. Database-level validation and transactions remain in the store.
No arbitrary SQL, IPC dispatch, or database handle is exposed to the renderer.
The preload contains only declared channel names; main-process handler code is
not exposed to the frontend.

Check changes with `npm run test:database`, the browser suite, and `npm run build`.
The contract regression test compares every registered handler with every exposed
client operation and checks malformed inputs and unauthorized callers.

## Verification

Verified on 19 November 2026: application/test TypeScript compilation, 70 browser
tests, 13 real SQLite/IPC tests, production build, and Mac arm64 packaging passed.
Two packaged launches verified the generated preload, LocalStorage migration, UI
CRUD, backup/reset/restore, reload, and restart persistence. Evidence:
`/var/folders/fr/bsm8p4kd1c35svp9x5h5rjyh0000gn/T/easy-sankey-packaged-t0RaQ8`.
Windows runtime verification remains for Windows CI.
