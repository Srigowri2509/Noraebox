// Electron main process (CommonJS)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'electron-preload.cjs')
    },
    icon: path.join(__dirname, 'public', 'logo_norebox.jpg')
  });

  // Load the built app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  // Try to start backend if it's in the same repo
  const backendPath = path.join(__dirname, '..', 'backend');
  const isWindows = process.platform === 'win32';
  const backendScript = isWindows ? 'start_backend.bat' : 'start_backend.sh';
  
  try {
    backendProcess = spawn(
      isWindows ? 'cmd' : 'sh',
      [isWindows ? '/c' : '-c', path.join(backendPath, backendScript)],
      { cwd: backendPath }
    );
    
    backendProcess.stdout.on('data', (data) => {
      console.log(`Backend: ${data}`);
    });
    
    backendProcess.stderr.on('data', (data) => {
      console.error(`Backend Error: ${data}`);
    });
  } catch (error) {
    console.warn('Could not start backend automatically:', error);
    console.warn('Please start backend manually');
  }
}

app.whenReady().then(() => {
  // Start backend if available
  startBackend();
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Kill backend process
  if (backendProcess) {
    backendProcess.kill();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});

