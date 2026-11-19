const { registerDatabaseApi } = require('./electron/storage/ipc');
const { app, BrowserWindow, clipboard, ipcMain } = require('electron');
const { screen, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { version, enableDevTools } = require('./package.json');
const path = require('path');
const development = !app.isPackaged;
const liveDevelopment = development && process.argv.includes('--dev');
const developmentURL = liveDevelopment ? 'http://127.0.0.1:4200/' : undefined;
const storageSmoke = process.argv.includes('--storage-smoke-test');
if (storageSmoke) {
  if (!process.env.EASY_SANKEY_SMOKE_PROFILE) throw new Error('Smoke tests require an isolated profile');
  require('node:fs').mkdirSync(process.env.EASY_SANKEY_SMOKE_PROFILE, { recursive: true });
  app.setPath('userData', process.env.EASY_SANKEY_SMOKE_PROFILE);
}

if (development && !storageSmoke) {
  const localData=path.join(app.getAppPath(), '.local');
  require('node:fs').mkdirSync(localData,{recursive:true});
  app.setPath('userData',localData);
  console.log(`Development database: ${path.join(localData,'finance.sqlite')}`);
}

if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => { if(win) { if(win.isMinimized()) win.restore(); win.focus(); } });


const smokeLegacySeed=storageSmoke && !require('node:fs').existsSync(path.join(app.getPath('userData'),'finance.sqlite'));

//#region Server Setup
/** Set up server to host the Machine Learning model. */
const express = require('express');
const Arima = require('arima');
const cors = require('cors');
const server = express();
const isArray = require('mathjs').isArray;
const port = storageSmoke ? 0 : 3223;


server.use(cors()); // Add this line before your routes
// Middleware to parse JSON body data
server.use(express.json());

// Define API endpoint for ARIMA prediction
server.post('/predict', (req, res) => {
  const data = req.body.data;
  const monthsToPredict = req.body.monthsToPredict || 5; // Default to 5 if not provided


  if (isArray(data) === false) {
    return res.status(400).json({ error: 'Data must be an array of numbers' });
  }
  // Set up ARIMA model
  const model = new Arima({
    p: 1,   // AR part, start with 1 for capturing the previous value
    d: 1,   // Differencing, try 1 for a simple trend removal
    q: 1    // MA part, start with 1 for modeling the error term
  });

  model.train(data);
  const forecast = model.predict(monthsToPredict); // Forecast the next 5 values

  // Send the prediction back as a response
  res.json({ forecast });
});

// Start the server
const serverInstance = server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
serverInstance.on('error', error => {
  console.error('Prediction service could not start:', error.message);
});
//#endregion


// let serverInstance;

// async function startServer() {
//   try {
//     serverInstance = server.listen(port, () => {
//       console.log(`Server running on http://localhost:${port}`);
//       dialog.showMessageBoxSync({
//         type: 'info',
//         title: 'Server Started',
//         detail: `The prediction service is running on http://localhost:${port}`,
//       });
//     });
//   } catch (error) {
//     console.error('Failed to start the server:', error.message);
//     dialog.showMessageBoxSync({
//       type: 'error',
//       title: 'Internal Server Error',
//       message: 'Failed to start the prediction service. The application will continue without prediction functionality.',
//       detail: error.message,
//     });
//   }
// }


//#region App Setup
/** Set up Electron App. */

let win;

function isAppClipboardRequest(event) {
  return event.sender === win?.webContents
    && event.senderFrame === win.webContents.mainFrame
    && (developmentURL
      ? [developmentURL,new URL('index.html',developmentURL).href].includes(event.senderFrame?.url.split(/[?#]/)[0])
      : event.senderFrame?.url.startsWith('file:'));
}

ipcMain.handle('application:restart', event => {
  if(!isAppClipboardRequest(event)) throw new Error('Unauthorized restart request');
  app.relaunch(); app.quit();
});

ipcMain.handle('month-clipboard:read', event => {
  if (!isAppClipboardRequest(event)) {
    throw new Error('Clipboard request from an unexpected window');
  }
  return clipboard.readText();
});

ipcMain.handle('month-clipboard:write', (event, text) => {
  if (!isAppClipboardRequest(event) || typeof text !== 'string') {
    throw new Error('Invalid clipboard request');
  }
  clipboard.writeText(text);
});

function createWindow() {
  // Create the browser window.
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  win = new BrowserWindow({
    width: width,
    height: height,
    minWidth: 450,
    minHeight: 300,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: smokeLegacySeed ? ['--storage-smoke-legacy=' + encodeURIComponent(JSON.stringify({
        firstTime:'false',appVersion:version,selectedCurrency:'USD',budgetView:'list',
        monthlyData:JSON.stringify({'2024-01':{month:'2024-01',lastUpdated:'2024-01-15T12:00:00.000Z',
          rawInput:[{id:'income',type:'income',target:'Legacy salary',value:1000,lastEditedAt:1234},
            {id:'expense',type:'expense',target:'Legacy rent',source:'Housing@__system/category__',value:123.45}],
          sankeyData:{nodes:[],links:[]},pieData:[{name:'stale chart',value:999}],treeMapData:[],totalExpenses:999}})
      }))] : [],
      nodeIntegration: false,
      contextIsolation: true,
      devTools: development || enableDevTools === true,
    },
    frame: true,         // Show the window frame (this allows you to drag and resize the window)
    resizable: true,     // Allow resizing the window (optional)
  });

  // Load the Angular app (dist folder)
  if(developmentURL) win.loadURL(developmentURL);
  else win.loadFile(path.join(__dirname, 'dist/easy-sankey/browser/index.html'));

  if (development && !storageSmoke) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // Register a shortcut listener
  win.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      input.key === 'r' &&
      (input.control || input.meta) // Detect Ctrl (Windows/Linux) or Cmd (macOS)
    ) {
      event.preventDefault(); // Prevent default reload
      // win.reload(); // Reload the Electron app
    }
  });

  win.on('closed', () => {
    win = null;
  });
}

// Auto-update logic
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;

  // Check for updates
  autoUpdater.checkForUpdatesAndNotify();


  // Notify the renderer process when an update is available
  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update_available', info);

    const dialogOpts = {
      type: 'info',
      buttons: ['Restart', 'Later'],
      title: 'Application Update',
      detail:
        'A new version has been downloaded. Restart the application to apply the updates.'
    }

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
      if (returnValue.response === 0) autoUpdater.quitAndInstall()
    })
  
  });

  // Notify the renderer process when an update is downloaded
  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update_downloaded', info);
  });

  // Handle errors
  autoUpdater.on('error', (err) => {
    console.error('Auto-Updater Error:', err);
  });
}




let databaseApi;
app.on('ready', () => {
  try {
    databaseApi = registerDatabaseApi({ app, ipcMain, getWindow: () => win, developmentURL });
  } catch (error) {
    console.error('Database could not be opened', error);
    if (!storageSmoke) dialog.showErrorBox('Database could not be opened', error.message);
    app.quit();
    return;
  }
  createWindow();
  if (storageSmoke) {
    require('./electron/storage/smoke').runSmoke(win, app).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
  }
  // setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || liveDevelopment) {

    serverInstance.close(() => {
      console.log('Express server closed');
    });


    app.quit();
  }
});

app.on('before-quit', () => {
  databaseApi?.close();
  serverInstance.close(() => {
    console.log('Express server closed before quit');
  });
});

app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
});
//#endregion
