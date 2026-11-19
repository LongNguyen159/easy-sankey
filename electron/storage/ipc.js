const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { openStateStore } = require('./state-store');

/** Register a closed set of operations; never expose SQL or arbitrary dispatch. */
function registerDatabaseApi({ app, ipcMain, getWindow, developmentURL }) {
  let state;
  const channels = [];
  const expectedURL = pathToFileURL(join(app.getAppPath(), 'dist/easy-sankey/browser/index.html')).href;
  if(developmentURL && (app.isPackaged || developmentURL!=='http://127.0.0.1:4200/')) throw new Error('Invalid development renderer URL.');
  const allowedURLs=developmentURL ? [developmentURL,new URL('index.html',developmentURL).href] : [expectedURL,new URL('.',expectedURL).href];
  const methods = {
    'database:state:export-file': async () => {
      const { canceled, filePath }=await require('electron').dialog.showSaveDialog(getWindow(),{
        defaultPath:'easy-sankey-backup.json',filters:[{name:'JSON backup',extensions:['json']}]});
      if(canceled||!filePath)return false;
      const {writeFileSync,renameSync}=require('node:fs');
      const temporary=`${filePath}.tmp-${process.pid}`;
      writeFileSync(temporary,state.exportBackup(),{mode:0o600});renameSync(temporary,filePath);
      return true;
    },
    'database:state:snapshot': () => state.snapshot(),
    'database:state:initialize': legacy => state.initialize(legacy),
    'database:state:mutate': payload => state.mutate(payload.changes, payload.revision, payload.replace === true),
    'database:state:export': () => state.exportBackup(),
    'database:state:restore': payload => state.restore(payload.text, payload.revision),
    'database:state:reset': revision => state.reset(revision),
    'database:state:category-delete': payload => state.deleteCategory(payload.id,payload.revision),
    'database:months:list': () => Object.keys(state.snapshot().data.monthlyData ?? {}),
    'database:months:get': month => state.monthOperation('get',month),
    'database:months:create': record => state.monthOperation('create',record),
    'database:months:update': record => state.monthOperation('update',record),
    'database:months:delete': month => state.monthOperation('delete',month),
  };
  for (const action of ['list','get','create','update','delete','reorder']) {
    methods[`database:entries:${action}`] = payload => state.entryOperation(action,payload);
    for(const collection of ['expenseCategories','fixCosts','budgets','trackedCategories']) {
      methods[`database:${collection}:${action}`] = payload => state.collectionOperation(collection,action,payload);
    }
  }
  function authorize(event) {
    const window = getWindow();
    const frame = event.senderFrame;
    if (!window || event.sender !== window.webContents || frame !== window.webContents.mainFrame
      || !allowedURLs.includes(frame.url.split(/[?#]/)[0])) {
      throw new Error('Unauthorized database request.');
    }
  }
  state = openStateStore(join(app.getPath('userData'), 'finance.sqlite'));
  for (const [channel, operation] of Object.entries(methods)) {
    ipcMain.handle(channel, (event, payload) => {
      authorize(event);
      if (channel.startsWith('database:months:') && (channel.endsWith(':get') || channel.endsWith(':delete'))) {
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
      state.close();
    },
  };
}
module.exports = { registerDatabaseApi };
