const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { parse } = require('csv-parse');

let mainWindow;
let server;
const PORT = 3020;

// Get the application directory and print debugging information
function getAppFolder() {
    // When running in development
    if (!app.isPackaged) {
        return process.cwd();
    }
    
    // When packaged as a production app
    return process.cwd(); // Use current working directory instead of execPath
}
    // Try multiple locations and check if data.csv exists
    const possiblePaths = [
        path.dirname(process.execPath),
        process.cwd(),
        app.getAppPath(),
        __dirname,
        path.join(process.resourcesPath, 'app')
    ];
    
    console.log("DEBUGGING - Checking for data.csv in possible locations:");
    for (const dir of possiblePaths) {
        const testPath = path.join(dir, 'data.csv');
        const exists = fs.existsSync(testPath);
        console.log(`DEBUGGING - Checking ${testPath}: ${exists ? "FOUND" : "NOT FOUND"}`);
        if (exists) {
            console.log("DEBUGGING - Found data.csv at:", testPath);
            console.log("DEBUGGING - Using directory:", dir);
            return dir;
        }
    }
    
    // Default to executable directory
    console.log("DEBUGGING - Using executable directory as default:", path.dirname(process.execPath));
    return path.dirname(process.execPath);
}

function createWindow() {
    // Increase height by 100px (from 500 to 600)
    mainWindow = new BrowserWindow({
        width: 600,
        height: 600, // Increased from 500 to 600
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'icon.ico'),
        resizable: true, // Allow resizing to avoid scroll issues
        autoHideMenuBar: true
    });

    mainWindow.loadFile('index.html');
    
    // Show developer tools in all modes to help with debugging
    mainWindow.webContents.openDevTools();
    
    // Log important paths
    console.log('App startup debugging:');
    console.log('App isPackaged:', app.isPackaged);
    console.log('Current directory:', process.cwd());
    console.log('App directory:', app.getAppPath());
    console.log('__dirname:', __dirname);
    console.log('Executable path:', process.execPath);
    console.log('Resources path:', process.resourcesPath);
    
    // Check if data.csv exists
    const appFolder = getAppFolder();
    const csvPath = path.join(appFolder, 'data.csv');
    console.log('Using app folder:', appFolder);
    console.log('Looking for CSV at:', csvPath);
    console.log('CSV exists:', fs.existsSync(csvPath));
    
    // Copy data.csv to multiple locations as a fallback (will help for testing)
    if (fs.existsSync(csvPath)) {
        try {
            // Copy to app.getAppPath()
            const appPathCsv = path.join(app.getAppPath(), 'data.csv');
            fs.copyFileSync(csvPath, appPathCsv);
            console.log('Copied CSV to app path:', appPathCsv);
            
            // If in packaged mode, copy to resources
            if (app.isPackaged && process.resourcesPath) {
                const resourcesPathCsv = path.join(process.resourcesPath, 'data.csv');
                fs.copyFileSync(csvPath, resourcesPathCsv);
                console.log('Copied CSV to resources path:', resourcesPathCsv);
            }
        } catch (err) {
            console.error('Error copying CSV file:', err);
        }
    }
}

app.whenReady().then(() => {
    createWindow();
    startServer();
});

app.on('window-all-closed', () => {
    stopServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Express server setup
function startServer() {
    const expressApp = express();
    
    // CSV handler
    expressApp.get('/data.csv', (req, res) => {
        try {
            const csvPath = path.join(getAppFolder(), 'data.csv');
            console.log('Server reading CSV from:', csvPath);
            
            if (fs.existsSync(csvPath)) {
                let csvContent = fs.readFileSync(csvPath, 'utf-8');
                csvContent = csvContent.replace(/^\uFEFF/, '');
                res.set('Content-Type', 'text/csv');
                res.send(csvContent);
            } else {
                console.log('CSV not found at:', csvPath);
                res.status(404).send('data.csv not found');
            }
        } catch (error) {
            console.error('Server error reading CSV:', error);
            res.status(500).send('Error reading data.csv');
        }
    });

    expressApp.use('/', express.static(getAppFolder()));

    // gfx.html handler
    expressApp.get('/gfx.html', (req, res) => {
        const lotNumber = req.query.lot || Object.keys(req.query)[0];
        const userGfxPath = path.join(getAppFolder(), 'gfx.html');
        
        console.log('Looking for gfx.html at:', userGfxPath);
        console.log('gfx.html exists:', fs.existsSync(userGfxPath));
        
        if (fs.existsSync(userGfxPath)) {
            let html = fs.readFileSync(userGfxPath, 'utf8');
            // Replace any existing lot parameter with the new one
            html = html.replace(/lot=[\"']?[^\"'&]*[\"']?/g, `${lotNumber}`);
            res.send(html);
        } else {
            res.status(404).send('gfx.html not found');
        }
    });

    server = expressApp.listen(PORT, () => {
        console.log(`Local server running on http://localhost:${PORT}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${PORT} already in use, continuing...`);
        } else {
            console.error('Server error:', err);
        }
    });
}

function stopServer() {
    if (server) {
        server.close();
    }
}

// Helper functions
async function ensureDirectories() {
    const dir = path.join(getAppFolder(), 'pgmGfx');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
}

async function getLotNumbersFromCSV() {
    try {
        const csvPath = path.join(getAppFolder(), 'data.csv');
        console.log('Reading lot numbers from:', csvPath);
        
        if (!fs.existsSync(csvPath)) {
            throw new Error(`CSV file not found at ${csvPath}`);
        }
        
        const csvContent = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
        const records = await new Promise((resolve, reject) => {
            parse(csvContent, { columns: true, skip_empty_lines: true }, (err, output) => {
                if (err) reject(err);
                else resolve(output);
            });
        });

        const lotColumn = Object.keys(records[0]).find(key => 
            key === 'Lot' ||
            key.toLowerCase().includes('lot')
        );

        if (!lotColumn) {
            throw new Error('Could not find Lot column in CSV');
        }

        return records.map(record => record[lotColumn].toString().trim());
    } catch (error) {
        console.error('Error reading CSV:', error.message);
        return [];
    }
}

// Screenshot capture using Electron's browser
async function captureScreenshot(lotNumber, options) {
    return new Promise(async (resolve, reject) => {
        const captureWindow = new BrowserWindow({
            width: 1920,
            height: 150,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: false
            }
        });

        try {
            const url = `http://localhost:${PORT}/gfx.html?${encodeURIComponent(lotNumber)}`;
            await captureWindow.loadURL(url);

            // Wait for page to be ready
            await captureWindow.webContents.executeJavaScript(`
                new Promise((resolve) => {
                    const checkReady = () => {
                        if (window.screenshotReady === true) {
                            resolve();
                        } else {
                            setTimeout(checkReady, 100);
                        }
                    };
                    checkReady();
                })
            `);

            // Set background based on options
            await captureWindow.webContents.executeJavaScript(`
                if ('${options.background}' === 'white') {
                    document.body.style.background = 'white';
                    document.documentElement.style.background = 'white';
                    const container = document.getElementById('bottomRowContainer');
                    if (container) {
                        container.style.background = 'white';
                    }
                } else {
                    document.body.style.background = 'transparent';
                    document.documentElement.style.background = 'transparent';
                    const container = document.getElementById('bottomRowContainer');
                    if (container) {
                        container.style.background = 'transparent';
                    }
                }
            `);

            // Apply scaling if needed
            if (options.scale !== 100) {
                await captureWindow.webContents.executeJavaScript(`
                    const container = document.querySelector('.main-container');
                    if (container) {
                        container.style.transform = 'scale(${options.scale / 100})';
                        container.style.transformOrigin = 'top left';
                    }
                `);
            }

            // Calculate scaled dimensions
            const baseWidth = 1920;
            const baseHeight = 150;
            const scaledWidth = Math.round(baseWidth * options.scale / 100);
            const scaledHeight = Math.round(baseHeight * options.scale / 100);

            // Capture the screenshot
            const image = await captureWindow.capturePage({
                x: 0,
                y: 0,
                width: scaledWidth,
                height: scaledHeight
            });

            await captureWindow.close();

            const outputPath = path.join(getAppFolder(), 'pgmGfx', `${lotNumber}.png`);
            fs.writeFileSync(outputPath, image.toPNG());
            
            console.log(`Saved ${outputPath} (${scaledWidth}x${scaledHeight})`);
            resolve(true);

        } catch (error) {
            await captureWindow.close();
            reject(error);
        }
    });
}

// Process lots with progress callback
async function processLots(options, progressCallback) {
    try {
        await ensureDirectories();
        
        const lotNumbers = await getLotNumbersFromCSV();
        if (lotNumbers.length === 0) {
            throw new Error('No records found in data.csv');
        }

        const lotsToProcess = options.lot ? [options.lot] : lotNumbers;
        
        if (options.lot && !lotNumbers.includes(options.lot)) {
            throw new Error(`Lot ${options.lot} not found in CSV data`);
        }

        for (let i = 0; i < lotsToProcess.length; i++) {
            const lotNumber = lotsToProcess[i];
            
            if (progressCallback) {
                progressCallback({
                    current: i + 1,
                    total: lotsToProcess.length,
                    lotNumber: lotNumber
                });
            }
            
            await captureScreenshot(lotNumber, options);
        }

        return { success: true, processed: lotsToProcess.length };
        
    } catch (error) {
        throw error;
    }
}

// IPC handlers
ipcMain.handle('check-csv-exists', () => {
    const csvPath = path.join(getAppFolder(), 'data.csv');
    console.log('Checking for CSV at:', csvPath);
    const exists = fs.existsSync(csvPath);
    console.log('CSV exists:', exists);
    return exists;
});

ipcMain.handle('get-lot-numbers', async () => {
    try {
        return await getLotNumbersFromCSV();
    } catch (error) {
        return [];
    }
});

ipcMain.handle('start-generation', async (event, options) => {
    try {
        const result = await processLots(options, (progress) => {
            // Send progress updates to renderer
            event.sender.send('generation-progress', progress);
        });
        return { success: true, result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Add a handler for cancel
let isCancelled = false;

ipcMain.handle('cancel-generation', () => {
    isCancelled = true;
    return true;
});

// Dev tools toggle
ipcMain.handle('toggle-devtools', () => {
    if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
    } else {
        mainWindow.webContents.openDevTools();
    }
});

// Add debug info handler
ipcMain.handle('get-debug-info', () => {
    return {
        appIsPackaged: app.isPackaged,
        currentDir: process.cwd(),
        appPath: app.getAppPath(),
        dirName: __dirname,
        exePath: process.execPath,
        resourcesPath: process.resourcesPath,
        appFolder: getAppFolder(),
        csvExists: fs.existsSync(path.join(getAppFolder(), 'data.csv')),
        csvPath: path.join(getAppFolder(), 'data.csv')
    };
});
