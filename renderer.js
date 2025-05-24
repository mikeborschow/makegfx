// renderer.js - Handles UI interactions for MakeGFX application
const { ipcRenderer } = require('electron');

// DOM elements
const optionsForm = document.getElementById('optionsForm');
const lotSelect = document.getElementById('lotSelect');
const scaleRange = document.getElementById('scaleRange');
const scaleValue = document.getElementById('scaleValue');
const generateBtn = document.getElementById('generateBtn');
const cancelBtn = document.getElementById('cancelBtn');
const statusDiv = document.getElementById('status');
const csvStatusDiv = document.getElementById('csvStatus');

// Check if CSV file exists
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const csvExists = await ipcRenderer.invoke('check-csv-exists');
        
        if (csvExists) {
            csvStatusDiv.textContent = 'CSV file found. Ready to generate graphics.';
            csvStatusDiv.className = 'csv-status csv-found';
            
            // Load lot numbers from CSV
            const lotNumbers = await ipcRenderer.invoke('get-lot-numbers');
            if (lotNumbers && lotNumbers.length > 0) {
                lotNumbers.forEach(lot => {
                    const option = document.createElement('option');
                    option.value = lot;
                    option.textContent = `Lot ${lot}`;
                    lotSelect.appendChild(option);
                });
                
                console.log(`Loaded ${lotNumbers.length} lot numbers from CSV`);
            }
        } else {
            csvStatusDiv.textContent = 'CSV file not found. Please add a data.csv file to the application folder.';
            csvStatusDiv.className = 'csv-status csv-missing';
            generateBtn.disabled = true;
        }
    } catch (error) {
        showStatus('Error initializing: ' + error.message, 'error');
        console.error('Initialization error:', error);
    }
});

// Update scale value display
scaleRange.addEventListener('input', () => {
    scaleValue.textContent = scaleRange.value;
});

// Handle form submission
optionsForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Prevent form submission
    
    const options = {
        lot: lotSelect.value, // Empty string for all lots, or specific lot
        scale: parseInt(scaleRange.value),
        background: document.querySelector('input[name="background"]:checked').value
    };
    
    // Disable the generate button and show the cancel button
    generateBtn.disabled = true;
    cancelBtn.style.display = 'block';
    
    // Show processing status
    showStatus('Processing graphics...', 'processing');
    
    try {
        // Call main process to generate graphics
        console.log('Starting generation with options:', options);
        const result = await ipcRenderer.invoke('start-generation', options);
        
        if (result.success) {
            showStatus(`Generated ${result.result.processed} graphics successfully.`, 'success');
            console.log('Generation complete:', result);
        } else {
            showStatus(`Error: ${result.error}`, 'error');
            console.error('Generation failed:', result.error);
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
        console.error('Generation error:', error);
    } finally {
        // Re-enable the generate button and hide the cancel button
        generateBtn.disabled = false;
        cancelBtn.style.display = 'none';
    }
});

// Handle progress updates from main process
ipcRenderer.on('generation-progress', (event, progress) => {
    const percent = Math.round((progress.current / progress.total) * 100);
    showStatus(`Processing lot ${progress.lotNumber} (${progress.current} of ${progress.total}, ${percent}%)`, 'processing');
    console.log('Progress update:', progress);
});

// Cancel button handler
cancelBtn.addEventListener('click', () => {
    ipcRenderer.invoke('cancel-generation');
    showStatus('Operation cancelled', 'error');
    generateBtn.disabled = false;
    cancelBtn.style.display = 'none';
});

// Helper function to show status messages
function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    statusDiv.style.display = 'block';
}
