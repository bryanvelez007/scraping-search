const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFile: () => ipcRenderer.send('select-file'),
    startScraping: () => ipcRenderer.send('start-scraping'),
    openExcelFile: () => ipcRenderer.send('open-excel'),
    onFileSelected: (cb) => ipcRenderer.on('file-selected', (_, path) => cb(path)),
    onScrapingStarted: (cb) => ipcRenderer.on('scraping-started', (_, total) => cb(total)),
    onScrapingProgress: (cb) => ipcRenderer.on('scraping-progress', (_, actual, empresa, estado) => cb(actual, empresa, estado)),
    onScrapingDone: (cb) => ipcRenderer.on('scraping-done', cb)
});
