const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { openDatabase } = require('./database');

/** Register a closed set of operations; never expose SQL or arbitrary dispatch. */
function registerDatabaseApi({ app, ipcMain, getWindow }) {
  let database;
  const channels = [];
  const expectedURL = pathToFileURL(join(app.getAppPath(), 'dist/easy-sankey/browser/index.html')).href;
  const methods = {
    'database:months:list': () => database.listMonths(),
    'database:months:get': month => database.getMonth(month),
    'database:months:create': record => { database.createMonth(record); return database.getMonth(record.month); },
    'database:months:update': record => { database.updateMonth(record); return database.getMonth(record.month); },
    'database:months:delete': month => database.deleteMonth(month),
  };
  function authorize(event) {
    const window = getWindow();
    const frame = event.senderFrame;
    if (!window || event.sender !== window.webContents || frame !== window.webContents.mainFrame
      || frame.url.split(/[?#]/)[0] !== expectedURL) {
      throw new Error('Unauthorized database request.');
    }
  }
  database = openDatabase(join(app.getPath('userData'), 'finance.sqlite'));
  for (const [channel, operation] of Object.entries(methods)) {
    ipcMain.handle(channel, (event, payload) => {
      authorize(event);
      if (channel.endsWith(':get') || channel.endsWith(':delete')) {
        if (typeof payload !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(payload)) {
          throw new Error('Invalid month identifier.');
        }
      }
      return operation(payload);
    });
    channels.push(channel);
  }
  let closed = false;
  return {
    close() {
      if (closed) return;
      closed = true;
      for (const channel of channels) ipcMain.removeHandler(channel);
      database.close();
    },
  };
}
module.exports = { registerDatabaseApi };
