# Database API

The live typed contract is `electron/api.ts`. Calls are asynchronous and available
as `window.electronAPI.database`, or through `DATABASE_CLIENT` in Angular. The
Electron build bundles the contract into the main/preload code automatically.
No generated client registry or manually duplicated method interface is needed.

| API | Operations |
| --- | --- |
| `entries` | `list({month})`, `get({month,id})`, `create({month,entry})`, `update({month,id,changes,expected?,history?})`, `delete({month,id})`, `reorder({month,ids})` |
| `categories`, `budgets`, `fixedCosts`, `tracking` | `list()`, `get({id})`, `create({item})`, `update({id,changes})`, `delete({id})`, `reorder({ids})`, `replace({items,metadata?})` |
| `months` | `list()`, `get(month)`, `range({from?,to?})`, `save({month,entries,lastUpdated,expectedRevision?,...})`, `remove({month})` |
| `settings` | `list()`, `set({key,value})` |
| `history` | `list({month,id})`, `append({month,id,item})`, `cleanup({now?})` |
| `trackingMetadata()` | Read target surplus and user-configured average income. |
| `deleteCategory({id})` | Delete a category and dependent configuration atomically. |
| `status()` | Read startup/import status and revision. |
| `state` | `initialize(legacy)`, `snapshot()`, `exportBackup()`, `exportFile()`, `restore({text,revision})`, `reset(revision)` |

Single-entity mutations return `{revision,value,affected}`. List operations return
`{revision,items}`; month-range/history/settings queries use `{revision,value}`.
`get` returns the record or null. Mutation methods accept optional revision checks
where declared in the contract. IDs retain the released app's identities.

`update` accepts only changed attributes. File/chart DTO names remain compatible:
entry `value` maps to the amount column, `target` to name, and `source` to a category
or parent relationship. Actual database attributes and relationships are defined
in the Prisma schema, not JSON documents.

`replace` and month `save` are explicit bulk-edit operations, not the path for
ordinary single-row updates. Full snapshots are only for backup/recovery and tests.
The renderer cannot invoke arbitrary SQL, Prisma methods, or IPC channel names.
