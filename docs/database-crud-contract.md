# CRUD refactor behavior contract

> Historical record: experimental SQLite upgrade support was removed; released LocalStorage-to-SQLite migration remains required. See [current storage documentation](storage.md).
- Months use `YYYY-MM`; entry identity remains `(month, id)`. Existing numbers,
  flags, ordering, parent names, and edit timestamps retain their original meaning.
- Selecting an absent month produces an empty view without inserting it. Saving a
  valid nonempty draft creates/updates that month. Deleting the final form entry
  removes the persisted month; direct entry CRUD can leave an explicit empty month.
- Demo entries are calculated in memory and never saved. Chart calculation retains
  the existing parent-total projection, without changing saved source amounts.
- Renaming an entry updates child sources. Deleting a parent reparents children to
  its parent. Final-state hierarchy validation rejects cycles and duplicate names.
- Removing a category clears entry/template sources and dependent budgets, tracker
  targets, essential selections, and manual-order references in one transaction.
- Fixed costs apply as copied entries. Template edits do not rewrite existing months.
- Budget saves filter nonpositive budgets. Tracker saves retain existing zero-target
  and merge/replace semantics; average income remains editable configuration, while
  current spending and percentages are calculated in memory.
- Calculator history and entry edits commit together. History retains original
  expression strings, timestamps and ordering, with five recent items per entry.
  Startup retention uses the previous month-lastUpdated-based 30-day rule.
- Form batches capture valid drafts, serialize saves, and compare against the loaded
  source before replacement. Conflicts reject without partial writes or automatic
  stale replay. Queries cannot replace a newer active month selection.
- Navigation flushes registered editors before leaving. Failed saves retain draft
  entries; successful persistence precedes publication of committed state.
- Source-only backup version 2 and import versions 1/2 remain compatible. Missing
  databases require recovery and never resurrect retained LocalStorage. Reset and
  restore preserve migration markers. Browser-only persistence is unsupported.

Main-process database and IPC tests use real temporary SQLite files. Renderer tests
inject Promise-based database fakes, rather than browser Storage persistence.
