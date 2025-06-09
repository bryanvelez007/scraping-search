// main.js
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { chromium } = require('playwright');
const ExcelJS = require('exceljs');

let mainWindow;
let filePath = '';
let outputDir = '';
let stopRequested = false;
let workbook;
let worksheet;
let resultados = [];

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'icon.png'),
        title: 'Scraper de Empresas - Google Maps'
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        filePath = result.filePaths[0];
        outputDir = path.dirname(filePath);
        mainWindow.webContents.send('file-selected', filePath);
    }
});

ipcMain.on('start-scraping', async () => {
    if (!filePath) return;

    stopRequested = false;
    resultados = [];
    const empresas = fs.readFileSync(filePath, 'utf-8').split('\n').map(e => e.trim()).filter(Boolean);

    mainWindow.webContents.send('scraping-started', empresas.length);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const excelPath = path.join(outputDir, 'empresas_info.xlsx');

    // Nuevo workbook y hoja con exceljs
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Empresas');

    // Definir columnas (para que quede ordenado)
    worksheet.columns = [
        { header: 'Empresa buscada', key: 'empresa_buscada', width: 30 },
        { header: 'Nombre', key: 'nombre', width: 30 },
        { header: 'Dirección', key: 'direccion', width: 40 },
        { header: 'Teléfono', key: 'telefono', width: 20 },
        { header: 'Web', key: 'web', width: 30 },
    ];

    let index = 0;

    for (const empresa of empresas) {
        if (stopRequested) break;

        const datos = await scrapeEmpresa(empresa, page);
        resultados.push(datos);

        // Añadir fila con los datos
        const row = worksheet.addRow(datos);

        // Si no está en España, poner fondo rojo en toda la fila
        if (datos.nombre === 'No se encontró esta empresa en España') {
            row.eachCell(cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFFCCCC' }, // rojo clarito
                };
            });
        }

        await workbook.xlsx.writeFile(excelPath);

        index++;
        mainWindow.webContents.send('scraping-progress', index, empresa, datos.nombre ? 'OK' : 'No encontrado');
    }

    await browser.close();
    mainWindow.webContents.send('scraping-done');
});

ipcMain.on('open-excel', () => {
    const excelPath = path.join(outputDir, 'empresas_info.xlsx');
    if (fs.existsSync(excelPath)) shell.openPath(excelPath);
});

ipcMain.on('stop-scraping', () => {
    stopRequested = true;
});

async function scrapeEmpresa(nombreEmpresa, page) {
    const datos = {
        empresa_buscada: nombreEmpresa,
        nombre: '',
        direccion: '',
        telefono: '',
        web: ''
    };

    try {
        await page.goto('https://www.google.com/maps');
        await page.waitForSelector("input[name='q']", { timeout: 3000 });
        await page.fill("input[name='q']", nombreEmpresa + ' España');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(4000);

        const firstResult = page.locator('.hfpxzc').first();
        if (await firstResult.count() > 0) {
            try {
                await firstResult.click();
                await page.waitForTimeout(3000);
            } catch { }
        }

        try {
            datos.nombre = await page.locator('h1.DUwDvf.lfPIob').textContent({ timeout: 1000 });
        } catch { }
        try {
            try {
                const direccion = await page.locator('button[data-item-id="address"]').textContent({ timeout: 1000 });
                datos.direccion = direccion;

                if (!direccion.toLowerCase().includes('españa')) {
                    console.warn(`❌ ${nombreEmpresa} no está en España`);
                    datos.nombre = 'No se encontró esta empresa en España';
                    datos.direccion = '';
                    datos.telefono = '';
                    datos.web = '';
                    return datos; // Salta el resto del scraping
                }
            } catch { }
        } catch { }
        try {
            datos.telefono = await page.locator('button[data-item-id^="phone:"]').textContent({ timeout: 1000 });
        } catch { }
        try {
            datos.web = await page.locator('a[data-item-id="authority"]').getAttribute('href', { timeout: 1000 });
        } catch { }

    } catch (err) {
        console.warn(`Error buscando ${nombreEmpresa}:`, err.message);
    }

    return datos;
}
