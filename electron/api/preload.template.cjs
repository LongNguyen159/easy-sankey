const { contextBridge, ipcRenderer } = require('electron');

/* DATABASE_CLIENT */

// Disposable packaged smoke profiles emulate an old installation before Angular starts.
const smokeSeed=process.argv.find(value=>value.startsWith('--storage-smoke-legacy='));
if(smokeSeed) {
  const legacy=JSON.parse(decodeURIComponent(smokeSeed.slice('--storage-smoke-legacy='.length)));
  for(const [key,value] of Object.entries(legacy)) localStorage.setItem(key,value);
}

// Expose APIs to the renderer process in a controlled way
contextBridge.exposeInMainWorld('electronAPI', {
  database: createDatabaseClient(),
  restartApp: () => ipcRenderer.invoke('application:restart'),
  readMonthClipboard: () => ipcRenderer.invoke('month-clipboard:read'),
  writeMonthClipboard: text => ipcRenderer.invoke('month-clipboard:write', text),
  onUpdateAvailable: (callback) => ipcRenderer.on('update_available', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', callback),
});
