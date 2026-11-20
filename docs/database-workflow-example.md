# Database workflow: groups and categories

This is a worked example for the current **Prisma 6.19** application. Group is
hypothetical: these snippets describe a feature you can add, not an existing API.
Run commands from the repository root.

The flow is:

```text
prisma/schema.prisma → migration SQL + generated Prisma client

Angular component/service
  → DATABASE_CLIENT.api.groups.create(...)
  → Electron API validation and IPC
  → electron/database.js CRUD function
  → Prisma → SQLite columns and foreign keys
```

Prisma generates database methods. We explicitly expose the operations the UI may
call. There is no HTTP server or HTTP endpoint in this desktop flow.

## 1. Prepare the development database

Install dependencies with `npm ci`. Copy `.env.example` to `.env` if you do not
already have one. Its URL points to `.local/schema-development.sqlite`, a scratch
database for creating migrations. It is separate from the running app's database,
`.local/finance-relational.sqlite` in development.

Do not point `migrate dev` at an installed user's database.

## 2. Model a table and its relation

Suppose each category can optionally belong to one group. Add this model to
`prisma/schema.prisma`:

```prisma
model Group {
  id         String     @id @default(uuid())
  name       String
  categories Category[]

  @@map("groups")
}
```

Inside the existing `Category` model, add:

```prisma
groupId String? @map("group_id")
group   Group?  @relation(fields: [groupId], references: [id], onDelete: SetNull)

@@index([groupId])
```

`group_id` is a real nullable foreign-key column. Existing categories remain
ungrouped. Deleting a group clears category membership while keeping categories.
`Group.categories` is the reverse relation, not a stored JSON array or SQL column.

## 3. Generate and review the migration

```sh
npm run orm:migrate -- --name add_groups --create-only
```

Review the new `prisma/migrations/<timestamp>_add_groups/migration.sql`. It should
create the groups table, add the category foreign key and create its index. SQLite
may rebuild a table to introduce a constraint; inspect how existing rows are copied.

Apply it to the scratch database and regenerate the client:

```sh
npm run orm:migrate
npx prisma generate
```

Commit both the schema and migration SQL. Generation updates types and CRUD methods;
it does not update the running app's database. On its next launch,
`electron/migrations.js` applies pending committed SQL before Prisma opens that DB.

## 4. Add database CRUD functions

In `electron/database.js`, inside `openDatabase`, define `groups` before the
existing `const crud = ...`, then add `groups` to that returned `crud` object:

```js
const groupName = value => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('A group name is required.');
  }
  return value.trim();
};

const groups = {
  list: async () => {
    await ready;
    return prisma.group.findMany({ orderBy: { name: 'asc' } });
  },
  get: async input => {
    await ready;
    return prisma.group.findUnique({ where: { id: input.id } });
  },
  create: input => command(input, async db => ({
    value: await db.group.create({ data: { name: groupName(input.name) } }),
  })),
  update: input => command(input, async db => ({
    value: await db.group.update({
      where: { id: input.id },
      data: { name: groupName(input.changes.name) },
    }),
  })),
  delete: input => command(input, async db => {
    await db.group.delete({ where: { id: input.id } });
    return { value: null };
  }),
};
```

Use the existing `command` helper for writes: it waits for initialization, wraps
the write in a transaction, checks an optional revision and returns
`{revision, value, affected}`. Queries wait for `ready`. Update writes the named
column directly; it does not replace a JSON object. Missing update/delete IDs
raise a Prisma error; `get` returns `null` when absent.

## 5. Expose typed operations to the UI

In `electron/api.ts`, add a type-only import:

```ts
import type { Group } from '../generated/prisma';
```

Add this property to the exported `operations` object, using its existing
`operation`, `none`, `record` and `id` helpers:

```ts
groups: {
  list: operation<void, Group[]>(
    'groups:list', 'List groups.', none,
    ({state}) => state.crud.groups.list(),
  ),
  get: operation<{id: string}, Group | null>(
    'groups:get', 'Read a group.', id,
    ({state}, input) => state.crud.groups.get(input),
  ),
  create: operation<{name: string}, CommandResult<Group>>(
    'groups:create', 'Create a group.',
    input => record(input) && typeof input['name'] === 'string'
      && !!input['name'].trim(),
    ({state}, input) => state.crud.groups.create(input),
  ),
  update: operation<
    {id: string; changes: {name: string}}, CommandResult<Group>
  >(
    'groups:update', 'Rename a group.',
    input => id(input) && record(input['changes'])
      && typeof input['changes']['name'] === 'string'
      && !!input['changes']['name'].trim(),
    ({state}, input) => state.crud.groups.update(input),
  ),
  delete: operation<{id: string}, CommandResult<null>>(
    'groups:delete', 'Delete a group.', id,
    ({state}, input) => state.crud.groups.delete(input),
  ),
},
```

IPC registration, the preload bridge and frontend API types follow this definition.
Do not add another operation registry or import the Prisma runtime into Angular.

To assign categories to groups, also expose `groupId?: string | null` through the
existing category DTO in `src/app/components/models.ts`, its input validation and
the category read/create/update mapping in `electron/database.js`. An update should
write `groupId` only when supplied; explicit `null` clears membership. Prisma checks
that a non-null group ID exists. Adding a schema field alone does not update these
existing UI mappings.

## 6. Call the operation from Angular

For example, in a component under `src/app/components/group-editor/`:

```ts
import { Component, inject, signal } from '@angular/core';
import { DATABASE_CLIENT } from '../../data/database';
import type { Group } from '../../../../generated/prisma';

@Component({
  selector: 'app-group-editor',
  standalone: true,
  template: `@for (group of groups(); track group.id) { <p>{{ group.name }}</p> }`,
})
export class GroupEditorComponent {
  private readonly database = inject(DATABASE_CLIENT);
  readonly groups = signal<Group[]>([]);

  async load() {
    this.groups.set(await this.database.api.groups.list());
  }

  async create(name: string) {
    const result = await this.database.command(() =>
      this.database.api.groups.create({ name }),
    );
    await this.load();
    return result.value;
  }

  async rename(id: string, name: string) {
    await this.database.command(() =>
      this.database.api.groups.update({ id, changes: { name } }),
    );
    await this.load();
  }

  async remove(id: string) {
    await this.database.command(() => this.database.api.groups.delete({ id }));
    await this.load();
  }
}
```

Wire the component into the desired page and call `load` when opening it. Await
writes before displaying saved state; handle rejected promises using the page's
error presentation. `database.command` sequences frontend writes; the backend
`command` provides the database transaction. Reads call the API directly.

## 7. Include the new data in lifecycle operations

Update `electron/database.js` export, restore, initialization and reset behavior,
and the shared backup validators in `electron/import-export.js`. Add groups and
category group IDs to the backup format, with compatibility handling for older
backups. Create groups before category references during restore; clear references
or delete dependent rows before deleting groups during reset.

The released LocalStorage data has no groups: import categories with null membership.
Test that exporting and restoring preserves both groups and their memberships.
Table creation and CRUD alone do not automatically extend backups.

## 8. Add or modify a column later

To add an optional field, add `description String?` to `Group`, then:

```sh
npm run orm:migrate -- --name add_group_description --create-only
# Review the new SQL.
npm run orm:migrate
npx prisma generate
```

Extend create/update API inputs, validation, Prisma writes and UI fields as needed.
Because this example returns generated Group types directly, reads will include
the new field after generation. Update the backup format too.

For a rename, use `--create-only` and inspect the SQL before applying it. A generated
drop/add may lose values; replace it with a data-preserving rename or copy. To change
a field's database column name while keeping its TypeScript name, change `@map`.
To change only its TypeScript name while retaining the SQL column, retain an
explicit `@map("existing_column")` and update consumers.

For a type change, define how existing values are converted in the migration. For
a required column, add a valid default or add it nullable, backfill existing rows,
then enforce the requirement in a later migration. Test with populated databases.
Never modify a migration already applied/distributed; add another migration.

## 9. Verify and run

```sh
npm test
node scripts/build.cjs
git diff --check
npm start
```

Add tests under `tests/database/` for CRUD, foreign-key failures, deleting a group
without deleting categories, backup round trips and migration of populated rows.
The new feature is complete when those cases pass and the consumer works after
restarting the app. Use temporary DBs for migration tests.

Normal startup builds the Electron API. If manually running an existing desktop
process, run `node scripts/build-electron.cjs` and restart it after backend/API changes.
Commit source, schema, migrations and tests; do not commit generated clients,
local DBs or `.env`. Never run `db push`, `migrate reset` or `migrate dev` against
an installed user's database.
