# Easy Sankey
Manage your finance using Sankey chart. A great way to easily create Sankey, setup budgets, compare income flow/expenses throughout times.


Edit Built App configs (windows size etc.) at `main.js` in root directory

## Development server

Run `npm start` for a dev server. The application will automatically reload if you change any of the source files.

## Build the desktop app

Install Node.js 26 on the machine that will build the installer. On an Apple Silicon Mac, `node -p process.arch` should print `arm64`. Run these commands from the repository root to create a local DMG:

```sh
npm ci
npm run deploy-mac -- --arm64 --publish never
```

Find the DMG under `releases/v<version>/darwin/arm64/`, where `<version>` is the version in `package.json`.

DevTools are disabled by default. To enable them in a local build, run `npm run deploy-mac -- --arm64 --publish never --devtools`.

For Intel Macs, use `npm run deploy-mac -- --x64 --publish never`. On Windows, use `npm run deploy-win -- --x64 --publish never`.

GitHub Actions builds the Windows x64 and Intel Mac installers on pushes to `main`. You can also run **Build Electron App** manually from the **Actions** tab and download the installers from that run's artifacts.


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
