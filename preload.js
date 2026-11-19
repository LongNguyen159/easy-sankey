const { contextBridge, ipcRenderer } = require('electron');

// Expose APIs to the renderer process in a controlled way
contextBridge.exposeInMainWorld('electronAPI', {
  database: {
    months: {
      list: () => ipcRenderer.invoke('database:months:list'),
      get: month => ipcRenderer.invoke('database:months:get', month),
      create: record => ipcRenderer.invoke('database:months:create', record),
      update: record => ipcRenderer.invoke('database:months:update', record),
      delete: month => ipcRenderer.invoke('database:months:delete', month),
    },
  },
  readMonthClipboard: () => ipcRenderer.invoke('month-clipboard:read'),
  writeMonthClipboard: text => ipcRenderer.invoke('month-clipboard:write', text),
  // Send messages from the renderer to the main process
  sendToMain: (channel, data) => {
    ipcRenderer.send(channel, data);
  },
  // Listen for messages from the main process
  receiveFromMain: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  },
  onUpdateAvailable: (callback) => ipcRenderer.on('update_available', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', callback),
});
