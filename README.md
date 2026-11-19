# Easy Sankey
Manage your finance using Sankey chart. A great way to easily create Sankey, setup budgets, compare income flow/expenses throughout times.





This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 18.0.3.
Packaged with Electron Builder.
Edit Built App configs (windows size etc.) at `main.js` in root directory

## Local development

Run `npm start` to start Angular with live reload and launch Electron. Closing the
Electron development window or pressing Ctrl+C stops the development session.

Development data lives in `.local/finance.sqlite` in this project. The whole
`.local/` folder (database, WAL/SHM files, browser profile, and recovery copies) is
ignored by Git. The installed app keeps its own database in Electron's application
data folder. Development never automatically imports data from the installed app;
use an explicit backup export/import if you want a copy.

In VS Code, choose **Easy Sankey: development** in Run and Debug, then press F5.
This starts the Angular server as a background task and launches Electron under
the debugger. Stop the background task from the Tasks menu when finished.

`npm run dev:serve` starts only Angular for a debugging session. A browser tab alone
cannot use SQLite: Electron must provide the database API. `npm run electron` uses
the built frontend and the same project-local development database.

## Build the desktop app

Install Node.js 22.22 or newer in the Node 22 series on the machine that will build the installer. On an Apple Silicon Mac, `node -p process.arch` should print `arm64`. Run these commands from the repository root to create a local DMG:

```sh
npm ci
npm run deploy-mac -- --arm64 --publish never
```

Find the DMG under `releases/v<version>/darwin/arm64/`, where `<version>` is the version in `package.json`.

DevTools are disabled by default. To enable them in a local build, run `npm run deploy-mac -- --arm64 --publish never --devtools`.

Mac builds support Apple Silicon only. On Windows, use `npm run deploy-win -- --x64 --publish never`.

GitHub Actions builds the Windows x64 and Apple Silicon Mac installers on pushes to `main`. You can also run **Build Electron App** manually from the **Actions** tab and download the installers from that run's artifacts.


## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
