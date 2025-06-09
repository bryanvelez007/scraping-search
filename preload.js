const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: () => ipcRenderer.send('select-file'),
  startScraping: () => ipcRenderer.send('start-scraping'),
  stopScraping: () => ipcRenderer.send('stop-scraping'),
  openExcel: () => ipcRenderer.send('open-excel'),

  onFileSelected: (callback) => ipcRenderer.on('file-selected', callback),
  onScrapingStarted: (callback) => ipcRenderer.on('scraping-started', callback),
  onScrapingProgress: (callback) => ipcRenderer.on('scraping-progress', callback),
  onScrapingDone: (callback) => ipcRenderer.on('scraping-done', callback),
});