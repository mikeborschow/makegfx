const { ipcRenderer } = require('electron');

let isProcessing = false;

// DOM elements
const csvStatus = document.getElementById('csvStatus');
const lotSelect = document.getElementById('lotSelect');
const scaleRange = document.getElementById('scaleRange');
const scaleValue = document.getElementById('scaleValue');
const optionsForm = document.getElementById('optionsForm');
const generateBtn = document.getElementById('generateBtn');
const cancelBtn = document.getElementById('cancelBtn');
const status = document.getElementById('status');

// Initialize the application
async function init() {
    await checkCSVFile();
    await loadLotNumbers();
    setupEventListeners();
}

// Check if CSV file exists
async function checkCSVFile() {
    const csvExists = await ipcRenderer.invoke('check-csv-exists');
    
    if (csvExists) {
        csvStatus.textContent = '✓ data.csv found';
        csvStatus.className = 'csv-status csv-found';
    } else {
        csvStatus.textContent = '✗ data.csv not found - Please place data.csv in the application folder';
        csvStatus.className = 'csv-status csv-missing';
        generateBtn.disabled = true;
    }
}

// Load lot numbers from CSV
async function loadLotNumbers() {
    const lots = await ipcRenderer.invoke('get-lot-numbers');
    
    // Clear existing options except "Process All Lots"
    lotSelect.innerHTML = '<option value="">Process All Lots</option>';
    
    // Add lot options
    lots.forEach(lot => {
        const option = document.createElement('option');
        option.value = lot;
        option.textContent = `Lot ${lot}`;
        lotSelect.appendChild(option);
    });
    
    if (lots.length > 0) {
        const statusText = document.createElement('div');
        statusText.style.fontSize = '12px';
        statusText.style.color = '#666';
        statusText.style.marginTop = '5px';
        statusText.textContent = `${lots.length} lots available`;
        lotSelect.parentNode.appendChild(statusText);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Scale range slider
    scaleRange.addEventListener('input', (e) => {
        scaleValue.textContent = e.target.value;
    });
    
    // Form submission
    optionsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await startGeneration();
    });
    
    // Cancel button
    cancelBtn.addEventListener('click', () => {
        resetUI();
    });

    // Listen for progress updates
    ipcRenderer.on('generation-progress', (event, progress) => {
        showStatus(`Processing lot ${progress.lotNumber} (${progress.current}/${progress.total})`, 'processing');
    });
}

// Start generation process
async function startGeneration() {
    if (isProcessing) return;
    
    isProcessing = true;
    updateUI(true);
    
    const options = {
        lot: lotSelect.value || null,
        scale: parseInt(scaleRange.value),
        background: document.querySelector('input[name="background"]:checked').value
    };
    
    showStatus('Starting generation... Please wait.', 'processing');
    
    try {
        const result = await ipcRenderer.invoke('start-generation', options);
        
        if (result.success) {
            const message = options.lot 
                ? `Successfully generated graphics for lot ${options.lot}`
                : `Successfully generated graphics for ${result.result.processed} lots`;
            showStatus(message, 'success');
        } else {
            showStatus(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        showStatus(`Unexpected error: ${error.message}`, 'error');
    }
    
    isProcessing = false;
    updateUI(false);
}

// Update UI during processing
function updateUI(processing) {
    generateBtn.disabled = processing;
    generateBtn.textContent = processing ? 'Generating...' : 'Generate Graphics';
    cancelBtn.style.display = processing ? 'inline-block' : 'none';
    
    // Disable form inputs during processing
    const inputs = optionsForm.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.disabled = processing;
    });
}

// Reset UI to initial state
function resetUI() {
    isProcessing = false;
    updateUI(false);
    hideStatus();
}

// Show status message
function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
}

// Hide status message
function hideStatus() {
    status.style.display = 'none';
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);