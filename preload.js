const { contextBridge, ipcRenderer } = require('electron');

function collectionApi(collection) {
  const api=Object.fromEntries(['list','get','create','update','delete','reorder'].map(action =>
    [action, payload => ipcRenderer.invoke(`database:${collection}:${action}`, payload)]));
  if(collection==='expenseCategories') api.delete=payload=>ipcRenderer.invoke('database:state:category-delete',payload);
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
    entries: collectionApi('entries'),
    categories: collectionApi('expenseCategories'),
    fixedCosts: collectionApi('fixCosts'),
    budgets: collectionApi('budgets'),
    tracking: collectionApi('trackedCategories'),
    state: {
      snapshot: () => ipcRenderer.invoke('database:state:snapshot'),
      exportFile: () => ipcRenderer.invoke('database:state:export-file'),
      deleteCategory: payload => ipcRenderer.invoke('database:state:category-delete', payload),
      initialize: legacy => ipcRenderer.invoke('database:state:initialize', legacy),
      mutate: payload => ipcRenderer.invoke('database:state:mutate', payload),
      exportBackup: () => ipcRenderer.invoke('database:state:export'),
      restore: payload => ipcRenderer.invoke('database:state:restore', payload),
      reset: revision => ipcRenderer.invoke('database:state:reset', revision),
    },
    months: {
      list: () => ipcRenderer.invoke('database:months:list'),
      get: month => ipcRenderer.invoke('database:months:get', month),
      create: record => ipcRenderer.invoke('database:months:create', record),
      update: record => ipcRenderer.invoke('database:months:update', record),
      delete: month => ipcRenderer.invoke('database:months:delete', month),
    },
  },
  restartApp: () => ipcRenderer.invoke('application:restart'),
  readMonthClipboard: () => ipcRenderer.invoke('month-clipboard:read'),
  writeMonthClipboard: text => ipcRenderer.invoke('month-clipboard:write', text),
  onUpdateAvailable: (callback) => ipcRenderer.on('update_available', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', callback),
});
