
// main.js
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const ExcelJS = require('exceljs');

let mainWindow;
let filePath = '';
let outputDir = '';
let stopRequested = false;

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
    const empresas = fs.readFileSync(filePath, 'utf-8').split('\n').map(e => e.trim()).filter(Boolean);
    const empresaSet = new Set(empresas.map(e => e.toLowerCase()));

    mainWindow.webContents.send('scraping-started', empresas.length);

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    const excelPath = path.join(outputDir, 'empresas_info.xlsx');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Empresas');

    worksheet.columns = [
        { header: 'Empresa buscada', key: 'empresa_buscada', width: 30 },
        { header: 'Nombre', key: 'nombre', width: 30 },
        { header: 'Dirección', key: 'direccion', width: 40 },
        { header: 'Teléfono', key: 'telefono', width: 20 },
        { header: 'Web', key: 'web', width: 30 },
        { header: 'Maps URL', key: 'maps_url', width: 40 },
        { header: 'Categoría', key: 'categoria', width: 30 },
    ];

    for (const empresa of empresas) {
        if (stopRequested) break;
        const datos = await scrapeEmpresa(empresa, page);
        const row = worksheet.addRow(datos);

        if (datos.nombre === 'No se encontró esta empresa en España') {
            row.eachCell(cell => cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCCCC' } });
        }

        const relacionados = await scrapeRelacionados(page, empresaSet);
        relacionados.forEach(info => {
            const r = worksheet.addRow(info);
            r.eachCell(cell => cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCE5FF' } });
        });

        await workbook.xlsx.writeFile(excelPath);
        mainWindow.webContents.send('scraping-progress', worksheet.rowCount, empresa, datos.nombre);
    }

    await browser.close();
    mainWindow.webContents.send('scraping-done');
});

ipcMain.on('open-excel', () => {
    const excelPath = path.join(outputDir, 'empresas_info.xlsx');
    if (fs.existsSync(excelPath)) shell.openPath(excelPath);
});

ipcMain.on('stop-scraping', () => { stopRequested = true; });

async function scrapeEmpresa(nombreEmpresa, page) {
    const datos = {
        empresa_buscada: nombreEmpresa,
        nombre: '', direccion: '', telefono: '', web: '', maps_url: '', categoria: ''
    };
    try {
        await page.goto('https://www.google.com/maps');
        await page.waitForSelector("input[name='q']", { timeout: 3000 });
        await page.fill("input[name='q']", nombreEmpresa + ' España');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(4000);

        const firstResult = page.locator('.hfpxzc').first();
        if (await firstResult.count() > 0) await firstResult.click();
        await page.waitForTimeout(3000);

        datos.nombre = await safeText(page, 'h1.DUwDvf.lfPIob');
        const direccion = await safeText(page, 'button[data-item-id="address"]');
        if (direccion && direccion.toLowerCase().includes('españa')) {
            datos.direccion = direccion;
            datos.telefono = await safeText(page, 'button[data-item-id^="phone:"]');
            datos.web = await safeAttr(page, 'a[data-item-id="authority"]', 'href');
            datos.maps_url = page.url();
            datos.categoria = await safeText(page, 'button.DkEaL');
        } else {
            datos.nombre = 'No se encontró esta empresa en España';
        }
    } catch (err) {
        console.warn(`Error buscando ${nombreEmpresa}:`, err.message);
    }
    return datos;
}

async function scrapeRelacionados(page, empresaSet) {
    const relacionados = [];
    const cards = await page.$$('div.Nv2PK');
    for (const card of cards) {
        const nombre = await safeTextEl(card, 'div[role="link"] span');
        if (!nombre || empresaSet.has(nombre.toLowerCase())) continue;

        try {
            await card.click();
            await page.waitForTimeout(2000);
            const datos = {
                empresa_buscada: 'Relacionado',
                nombre: await safeText(page, 'h1.DUwDvf.lfPIob'),
                direccion: await safeText(page, 'button[data-item-id="address"]'),
                telefono: await safeText(page, 'button[data-item-id^="phone:"]'),
                web: await safeAttr(page, 'a[data-item-id="authority"]', 'href'),
                maps_url: page.url(),
                categoria: await safeText(page, 'button.DkEaL')
            };
            relacionados.push(datos);
        } catch {}
    }
    return relacionados;
}

async function safeText(page, selector) {
    try { return await page.locator(selector).textContent({ timeout: 1000 }) || ''; } catch { return ''; }
}

async function safeAttr(page, selector, attr) {
    try { return await page.locator(selector).getAttribute(attr, { timeout: 1000 }) || ''; } catch { return ''; }
}

async function safeTextEl(element, selector) {
    try { const el = await element.$(selector); return el ? (await el.textContent()) : ''; } catch { return ''; }
}
