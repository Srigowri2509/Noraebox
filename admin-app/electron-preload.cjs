// Preload script for Electron (CommonJS)
const { contextBridge } = require('electron');

// Expose protected methods that allow the renderer process to use
// the APIs we want to expose
contextBridge.exposeInMainWorld('electronAPI', {
  // Add any Electron APIs you want to expose here
  platform: process.platform
});

