# Working with the ORM database

The normal flow is:

`Angular consumer -> typed Electron API -> model service -> Prisma -> SQLite columns`

Prisma's model schema is `prisma/schema.prisma`. Its generated client is under
`generated/prisma` (ignored by Git and generated for builds). The running
app uses `finance-relational.sqlite`; the old experimental JSON DB is not used.

## First setup

```sh
npm ci
npx prisma generate
```

For schema development, copy `.env.example` to `.env` if you do not already have
one. It points Prisma's CLI at `.local/schema-development.sqlite`, a scratch schema
DB, not the app's runtime data. SQLite URLs in the schema resolve relative to the
`prisma` folder. Electron 32 contains Node 20.18; Prisma 6.19 is pinned for that
runtime. Keep `prisma` and `@prisma/client` versions in sync.

The workspace sets `prisma.pinToPrisma6` so the Prisma editor extension validates
against this version too. If the editor reports that datasource `url` is unsupported,
run **Prisma: Restart Language Server** (or reload the editor window). That warning
belongs to Prisma 7; the schema URL and runtime client configuration here use Prisma 6.

## Add a table

For a complete example including a related table, API and Angular consumer, follow
[the Group walkthrough](database-workflow-example.md). The sections below are a
short reference for individual changes.

Add an ordinary model to `prisma/schema.prisma`, for example:

```prisma
model Group {
  id   String @id @default(uuid())
  name String
  @@map("groups")
}
```

Then create a committed migration and regenerate the client:

```sh
npm run orm:migrate -- --name add_groups
npx prisma generate
```

The generated ORM provides `prisma.group.create`, `findUnique`, `findMany`,
`update`, `delete`, and transactions. Add domain service methods using those
operations. No generic JSON collection registration or storage-key map is needed.
Add the model to explicit backup/import/reset behavior as appropriate.

## Add a relationship

Use foreign keys and Prisma relations. For many-to-many group membership, define
an explicit GroupEntry model referencing Group and Entry's composite `(monthId,id)`
key. Add the reverse relation fields on both models. Choose delete behavior based
on domain meaning. Do not store membership as a JSON array or an entry name.

Create another migration after editing the schema. Database-level CHECK
constraints not representable in Prisma belong in the generated SQL migration;
the existing initial migration demonstrates these constraints.

## Add a column or change a schema

For example, add `description String?` to Group, then run:

```sh
npm run orm:migrate -- --name add_group_description
npx prisma generate
```

Review the generated SQL and test it on an existing temporary database containing
data. The app's offline migration runner applies committed migrations automatically
on startup; consumers do not run SQL manually. Prisma's `migrate status` recognizes
this history. Generation alone does not migrate a database.

For a required column on existing rows, first add it nullable or with a justified
default, backfill it, then enforce the requirement in a later migration. Renames
and destructive changes need an explicit data-preserving SQL migration. Do not use
`db push`, `migrate reset`, or `migrate dev` against an installed user's database.
Do not edit a distributed migration; add a new one. The runner rejects checksum
changes and rolls back a failed migration. The migration runner is
`electron/migrations.js`; normal CRUD does not use raw SQL.

## Add a CRUD API operation

For the example Group model, add a named service to the `crud` object inside
`openDatabase` in `electron/database.js`:

```js
groups: {
  list: async () => {
    await ready;
    return prisma.group.findMany({ orderBy: { name: 'asc' } });
  },
  create: input => command(input, async db => {
    const name = input.name.trim();
    if (!name) throw new Error('A group name is required.');
    return { value: await db.group.create({ data: { name } }) };
  }),
},
```

Add `import type { Group } from '../generated/prisma'` to `electron/api.ts`, then
add the API bindings to its `operations` object:

```ts
groups: {
  list: operation<void, Group[]>(
    'groups:list', 'List groups.', none,
    ({state}) => state.crud.groups.list(),
  ),
  create: operation<{name:string}, CommandResult<Group>>(
    'groups:create', 'Create a group.',
    input => record(input) && typeof input['name'] === 'string' && !!input['name'].trim(),
    ({state}, input) => state.crud.groups.create(input),
  ),
},
```

The model service uses Prisma; the API definition declares the small set of
operations the renderer may call. Prisma runtime code never enters the renderer;
only generated model types are imported with `import type`. No registry, storage
key, preload template, hand-maintained client interface or API generator is needed.

IPC registration and the preload client read the same operation definitions.
Frontend types are inferred from them. Run `node scripts/build-electron.cjs` after changing
Electron/API source and restart Electron. Normal startup, builds and tests also
compile it. The hypothetical Group example is not an existing app feature.

Use `changes` for ordinary updates, e.g. the existing entry operation:

```ts
await database.command(() => database.api.entries.update({
  month: '2026-11',
  id: entryId,
  changes: { value: 250 },
}));
```

`value` is the financial UI DTO's amount; the mapping writes the Entry `amount`
column. Legacy `target/source` chart/file shapes are projected at the boundary;
parents/category IDs in the database are real relations. Avoid writing source
records back from calculated chart projections.

## Consume an operation in Angular

```ts
import { inject } from '@angular/core';
import { DATABASE_CLIENT } from './data/database'; // adjust relative path

private readonly database = inject(DATABASE_CLIENT);

async loadMonth(month: string) {
  const saved = await this.database.api.months.get(month);
  // Update the component's signal/form only after the query succeeds.
}
```

For the hypothetical Group example, the consumer calls:

```ts
await this.database.command(() => this.database.api.groups.create({name:'Household'}));
this.groups = await this.database.api.groups.list();
```

Use the command queue for writes and await success before publishing saved state.
A feature service is useful for shared state/transactions, not mandatory for every
forwarded method. Frontend code never imports the Prisma runtime or accesses SQL.

## Verify a change

```sh
npm test
node scripts/build.cjs
git diff --check
```

Add real ORM tests for columns, constraints, CRUD and migration of existing rows.
`tests/database/orm.test.js` includes examples. Use a temporary database for
backup/import and migration checks. Package and run `node scripts/smoke-packaged.cjs
"<executable>"` for runtime/native-engine changes. Windows verification runs on
Windows CI; Mac packaging cannot establish Windows runtime correctness.
