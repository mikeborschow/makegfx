const { ipcRenderer } = require('electron');

// Form elements
const optionsForm = document.getElementById('optionsForm');
const lotSelect = document.getElementById('lotSelect');
const scaleRange = document.getElementById('scaleRange');
const scaleValue = document.getElementById('scaleValue');
const generateBtn = document.getElementById('generateBtn');
const cancelBtn = document.getElementById('cancelBtn');
const csvStatus = document.getElementById('csvStatus');
const status = document.getElementById('status');
const debugInfo = document.getElementById('debugInfo');
const debugInfoContent = document.getElementById('debugInfoContent');

// Check if CSV file exists and load lots
async function init() {
    try {
        const csvExists = await ipcRenderer.invoke('check-csv-exists');
        
        if (csvExists) {
            csvStatus.textContent = 'data.csv found. Ready to generate graphics.';
            csvStatus.className = 'csv-status csv-found';
            
            // Get lot numbers from CSV
            const lotNumbers = await ipcRenderer.invoke('get-lot-numbers');
            
            if (lotNumbers.length > 0) {
                // Clear existing options (except the first "Process All" option)
                while (lotSelect.options.length > 1) {
                    lotSelect.remove(1);
                }
                
                // Add lot numbers
                lotNumbers.forEach(lot => {
                    const option = document.createElement('option');
                    option.value = lot;
                    option.textContent = lot;
                    lotSelect.appendChild(option);
                });
                
                generateBtn.disabled = false;
            } else {
                csvStatus.textContent = 'No valid lot numbers found in data.csv.';
                csvStatus.className = 'csv-status csv-missing';
                generateBtn.disabled = true;
            }
        } else {
            csvStatus.textContent = 'CSV file not found. Please add a data.csv file to the application folder.';
            csvStatus.className = 'csv-status csv-missing';
            generateBtn.disabled = true;
        }
    } catch (error) {
        console.error('Error during initialization:', error);
        csvStatus.textContent = `Error: ${error.message}`;
        csvStatus.className = 'csv-status csv-missing';
        generateBtn.disabled = true;
    }
}

// Update scale value display
scaleRange.addEventListener('input', () => {
    scaleValue.textContent = scaleRange.value;
});

// Form submission
optionsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const selectedLot = lotSelect.value;
    const selectedScale = parseInt(scaleRange.value);
    const selectedBackground = document.querySelector('input[name="background"]:checked').value;
    
    // Collect options
    const options = {
        lot: selectedLot,
        scale: selectedScale,
        background: selectedBackground
    };
    
    // Display processing status
    status.textContent = `Processing ${selectedLot || 'all lots'}... Please wait.`;
    status.className = 'status processing';
    status.style.display = 'block';
    
    // Disable form and show cancel button
    generateBtn.disabled = true;
    lotSelect.disabled = true;
    scaleRange.disabled = true;
    document.querySelectorAll('input[name="background"]').forEach(input => {
        input.disabled = true;
    });
    
    cancelBtn.style.display = 'block';
    
    // Start generation process
    try {
        const result = await ipcRenderer.invoke('start-generation', options);
        
        if (result.success) {
            status.textContent = `Successfully generated ${result.result.processed} graphics in the pgmGfx folder.`;
            status.className = 'status success';
        } else {
            status.textContent = `Error: ${result.error}`;
            status.className = 'status error';
        }
    } catch (error) {
        status.textContent = `Error: ${error.message}`;
        status.className = 'status error';
    } finally {
        // Re-enable form and hide cancel button
        generateBtn.disabled = false;
        lotSelect.disabled = false;
        scaleRange.disabled = false;
        document.querySelectorAll('input[name="background"]').forEach(input => {
            input.disabled = false;
        });
        
        cancelBtn.style.display = 'none';
    }
});

// Cancel button
cancelBtn.addEventListener('click', async () => {
    await ipcRenderer.invoke('cancel-generation');
    
    status.textContent = 'Generation cancelled.';
    status.className = 'status error';
    
    // Re-enable form and hide cancel button
    generateBtn.disabled = false;
    lotSelect.disabled = false;
    scaleRange.disabled = false;
    document.querySelectorAll('input[name="background"]').forEach(input => {
        input.disabled = false;
    });
    
    cancelBtn.style.display = 'none';
});

// Progress updates
ipcRenderer.on('generation-progress', (event, progress) => {
    status.textContent = `Processing ${progress.lotNumber} (${progress.current}/${progress.total})...`;
});

// Add debug info function
window.electronDebugInfo = async function() {
    try {
        const info = await ipcRenderer.invoke('get-debug-info');
        debugInfoContent.textContent = JSON.stringify(info, null, 2);
    } catch (error) {
        debugInfoContent.textContent = `Error getting debug info: ${error.message}`;
    }
};

// Initialize
init();
// Debug panel functionality (add this after init() is called)
const debugPanel = document.getElementById('debugPanel');
const toggleDebugBtn = document.getElementById('toggleDebugBtn');
const reloadAppBtn = document.getElementById('reloadAppBtn');

// Toggle debug panel visibility
toggleDebugBtn.addEventListener('click', () => {
    const isVisible = debugPanel.style.display !== 'none';
    debugPanel.style.display = isVisible ? 'none' : 'block';
    toggleDebugBtn.textContent = isVisible ? 'Show Debug Info' : 'Hide Debug Info';
    
    if (!isVisible) {
        updateDebugInfo();
    }
});

// Reload application
reloadAppBtn.addEventListener('click', () => {
    ipcRenderer.send('reload-app');
});

// Request and display debug information
async function updateDebugInfo() {
    try {
        const info = await ipcRenderer.invoke('get-debug-info');
        debugInfoContent.textContent = JSON.stringify(info, null, 2);
    } catch (error) {
        debugInfoContent.textContent = 'Error fetching debug info: ' + error.message;
    }
}

// Add initialization events to the debug info
window.addEventListener('error', (event) => {
    console.error('Renderer error:', event.error);
    if (debugInfoContent) {
        const currentText = debugInfoContent.textContent || '';
        debugInfoContent.textContent = `ERROR: ${event.error.message}\n${currentText}`;
    }
});
