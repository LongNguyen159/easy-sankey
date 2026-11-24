# Easy Sankey
Manage your finance using Sankey chart. A great way to easily create Sankey, setup budgets, compare income flow/expenses throughout times.


Edit Built App configs (windows size etc.) at `main.js` in root directory

## Budgets

Budgets group expenses under a spending limit, independently of their categories.
Categories are labels and have no budget amounts.

Create and edit **Global budgets** in **Finance Manager → Budgets**. These are
available in all months, with spending calculated separately for each month.
Create budgets in the month's entry dialog with **This month only** or **For every month**.
The entry menu's **Manage budgets** opens local and global budgets in separate
sections. Use **Add to budget** to assign an expense to either scope.

The Sankey **Budgets** switch groups spending by budget; turn it off for the
category view. Gauges compare actual spending with each limit, including unused
budgets. Deleting a budget keeps its expenses. Copying a month keeps global
references and creates separate copies of month-only budgets.

The development migration removes the old category-limit table and its display
preferences. Finance entries, categories, fixed-cost templates and history remain.

## Local development

Run `npm start` to start Angular with live reload and launch Electron. Closing the
Electron development window or pressing Ctrl+C stops the development session.

Development data lives in `.local/finance-relational.sqlite` in this project. The whole
`.local/` folder (database, WAL/SHM files, browser profile, and migration marker) is
ignored by Git. The installed app keeps its own database in Electron's application
data folder. Development never automatically imports data from the installed app;
use an explicit backup export/import if you want a copy.

In VS Code, choose **Easy Sankey: development** in Run and Debug, then press F5.
This starts the Angular server as a background task and launches Electron under
the debugger. Stop the background task from the Tasks menu when finished.

## Build the Mac installer

Use Node.js 22.22 or newer in the Node 22 series on an Apple Silicon Mac.
After installing dependencies with `npm ci`, run:

```sh
npm run deploy-mac
```

This builds the app and creates a local DMG without publishing it. Find it under
`releases/v<version>/darwin/arm64/`, where `<version>` is in `package.json`.
To include DevTools, use `npm run deploy-mac -- --devtools`.

GitHub Actions builds and tests Windows x64 and Apple Silicon Mac installers on
pushes to `main`. You can also run **Build Electron App** from the Actions tab.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

`npm run deploy-mac` builds the desktop code and frontend before packaging. Internal
builds can use `node scripts/build.cjs`; frontend output is stored in `dist/`.

## Running unit tests

Run `npm test` to execute database/API tests and Angular tests.

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Database development

For schema changes, use `npm run orm:migrate -- --name describe_change`.

Prisma models and relations live in `prisma/schema.prisma`. See [the architecture](docs/storage.md) and [developer guide](docs/orm-development.md) for tables, columns, migrations, API operations and consumers.

Follow [the worked database workflow](docs/database-workflow-example.md) for a complete
example of adding a related table, CRUD operations, an API and an Angular consumer,
then adding or changing a column.

## Workflow commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start the complete app with live reload |
| `npm run deploy-mac` | Build a local Mac DMG without publishing |
| `npm run deploy-mac -- --devtools` | Build a Mac DMG with DevTools enabled |
| `npm run orm:migrate -- --name change_name` | Create/apply a development schema migration |
| `npm test` | Run database/API tests and browser tests once, headlessly |
| `npm run check` | Check app/test types, spelling and circular runtime TypeScript imports |
| `npm run ng -- generate component name` | Generate Angular components (or services, etc.) |
| `npm run orm:studio` | Inspect the development database configured in `.env` |

Prisma generation and Electron compilation happen automatically during start,
packaging, tests and checks. Native dependencies are prepared by the automatic
`postinstall` hook after installation. Explicit type-only imports are excluded
from the circular runtime import check. All check stages run even if one fails;
any failure makes the command fail.

For browser test debugging, `npm test -- --watch --browsers=Chrome` runs database
tests first, then starts interactive browser tests. The default `npm test` requires
Chrome to be installed (or its executable set with `CHROME_BIN`).

The VS Code launch configuration starts its frontend server directly as an internal
task. Windows packaging and packaged-app smoke tests remain internal CI steps.
