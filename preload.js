const { contextBridge, ipcRenderer } = require('electron');

function collectionApi(collection) {
  const api=Object.fromEntries(['list','get','create','update','delete','reorder','replace'].map(action =>
    [action, payload => ipcRenderer.invoke(`database:${collection}:${action}`, payload)]));

  return api;
}

// Disposable packaged smoke profiles emulate an old installation before Angular starts.
const smokeSeed=process.argv.find(value=>value.startsWith('--storage-smoke-legacy='));
if(smokeSeed) {
  const legacy=JSON.parse(decodeURIComponent(smokeSeed.slice('--storage-smoke-legacy='.length)));
  for(const [key,value] of Object.entries(legacy)) localStorage.setItem(key,value);
}

// Expose APIs to the renderer process in a controlled way
contextBridge.exposeInMainWorld('electronAPI', {
  database: {
    status: () => ipcRenderer.invoke('database:status'),
    settings: {list:()=>ipcRenderer.invoke('database:settings:list'),set:payload=>ipcRenderer.invoke('database:settings:set',payload)},
    history: Object.fromEntries(['list','append','cleanup'].map(action=>[action,payload=>ipcRenderer.invoke(`database:history:${action}`,payload)])),
    trackingMetadata:()=>ipcRenderer.invoke('database:tracking:metadata'),
    deleteCategory:payload=>ipcRenderer.invoke('database:category:remove',payload),
    entries: collectionApi('entries'),
    categories: collectionApi('expenseCategories'),
    fixedCosts: collectionApi('fixCosts'),
    budgets: collectionApi('budgets'),
    tracking: collectionApi('trackedCategories'),
    state: {
      initialize:legacy=>ipcRenderer.invoke('database:state:initialize',legacy),
      snapshot: () => ipcRenderer.invoke('database:state:snapshot'),
      exportFile: () => ipcRenderer.invoke('database:state:export-file'),
      exportBackup: () => ipcRenderer.invoke('database:state:export'),
      restore: payload => ipcRenderer.invoke('database:state:restore', payload),
      reset: revision => ipcRenderer.invoke('database:state:reset', revision),
    },
    months: {
      list: () => ipcRenderer.invoke('database:months:list'),
      range: payload => ipcRenderer.invoke('database:months:range',payload),
      save: payload => ipcRenderer.invoke('database:months:save',payload),
      remove: payload => ipcRenderer.invoke('database:months:remove',payload),
      get: month => ipcRenderer.invoke('database:months:get', month),
    },
  },
  restartApp: () => ipcRenderer.invoke('application:restart'),
  readMonthClipboard: () => ipcRenderer.invoke('month-clipboard:read'),
  writeMonthClipboard: text => ipcRenderer.invoke('month-clipboard:write', text),
  onUpdateAvailable: (callback) => ipcRenderer.on('update_available', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', callback),
});
