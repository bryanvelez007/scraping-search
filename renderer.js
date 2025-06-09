const fileInput = document.getElementById('filePath');
const selectFileBtn = document.getElementById('selectFile');
const startBtn = document.getElementById('startScraping');
const logOutput = document.getElementById('logOutput');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressContainer = document.getElementById('progressContainer');
const openExcelBtn = document.getElementById('openExcel');

let empresasTotales = 0;

selectFileBtn.addEventListener('click', () => {
    window.electronAPI.selectFile();
});

startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    logOutput.innerHTML = '';
    window.electronAPI.startScraping();
});

window.electronAPI.onFileSelected((path) => {
    fileInput.value = path;
});

window.electronAPI.onScrapingStarted((total) => {
    empresasTotales = total;
    progressContainer.classList.remove('hidden');
    updateProgress(0);
});

window.electronAPI.onScrapingProgress((actual, empresa, estado) => {
    updateProgress(actual);
    log(`✅ ${empresa} → ${estado}`);
});

window.electronAPI.onScrapingDone(() => {
    log(`✅ Scraping finalizado.`);
    startBtn.disabled = false;
    openExcelBtn.disabled = false;
});

openExcelBtn.addEventListener('click', () => {
    window.electronAPI.openExcelFile();
});

function updateProgress(actual) {
    const percent = Math.round((actual / empresasTotales) * 100);
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${actual} de ${empresasTotales} empresas procesadas`;
}

function log(message) {
    const p = document.createElement('p');
    p.textContent = message;
    logOutput.appendChild(p);
    logOutput.scrollTop = logOutput.scrollHeight;
}
