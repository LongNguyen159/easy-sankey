const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { openDatabase } = require("./database");
const { operations } = require("./api");

/** Register a closed set of operations; never expose SQL or arbitrary dispatch. */
function registerDatabaseApi({ app, ipcMain, getWindow, developmentURL }) {
  let state;
  const channels = [];
  const expectedURL = pathToFileURL(
    join(app.getAppPath(), "dist/easy-sankey/browser/index.html"),
  ).href;
  if (
    developmentURL &&
    (app.isPackaged || developmentURL !== "http://127.0.0.1:4200/")
  )
    throw new Error("Invalid development renderer URL.");
  const allowedURLs = developmentURL
    ? [developmentURL, new URL("index.html", developmentURL).href]
    : [expectedURL, new URL(".", expectedURL).href];
  const context = {
    get state() {
      return state;
    },
    async exportFile() {
      const timestamp = new Date().toISOString().slice(0, 19).replace("T", "-at-").replace(/:/g, "-");
      const { canceled, filePath } =
        await require("electron").dialog.showSaveDialog(getWindow(), {
          defaultPath: `easy-sankey-backup-${timestamp}.json`,
          filters: [{ name: "JSON backup", extensions: ["json"] }],
        });
      if (canceled || !filePath) return false;
      const { writeFileSync, renameSync } = require("node:fs");
      const temporary = `${filePath}.tmp-${process.pid}`;
      writeFileSync(temporary, await state.exportBackup(), { mode: 0o600 });
      renameSync(temporary, filePath);
      return true;
    },
  };
  function flatten(tree) {
    return Object.values(tree).flatMap((value) =>
      typeof value.run === "function" ? [value] : flatten(value),
    );
  }
  function authorize(event) {
    const window = getWindow();
    const frame = event.senderFrame;
    if (
      !window ||
      event.sender !== window.webContents ||
      frame !== window.webContents.mainFrame ||
      !allowedURLs.includes(frame.url.split(/[?#]/)[0])
    ) {
      throw new Error("Unauthorized database request.");
    }
  }
  state = openDatabase(
    join(app.getPath("userData"), "finance-relational.sqlite"),
  );
  for (const operation of flatten(operations)) {
    const channel = operation.channel;
    ipcMain.handle(channel, (event, payload) => {
      authorize(event);
      if (!operation.validate(payload))
        throw new Error(
          `VALIDATION: Invalid ${channel === "database:months:get" ? "month identifier" : "input for " + channel}.`,
        );
      return operation.run(context, payload);
    });
    channels.push(channel);
  }
  let closed = false;
  return {
    close() {
      if (closed) return;
      closed = true;
      for (const channel of channels) ipcMain.removeHandler(channel);
      return state.close();
    },
  };
}
module.exports = { registerDatabaseApi };
