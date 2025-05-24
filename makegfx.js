const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const express = require('express');

// Simple server setup - just like original
const app = express();
const PORT = 3020;

// CSV handler - unchanged from original
app.get('/data.csv', (req, res) => {
    try {
        const csvPath = path.join(process.cwd(), 'data.csv');
        if (fs.existsSync(csvPath)) {
            let csvContent = fs.readFileSync(csvPath, 'utf-8');
            csvContent = csvContent.replace(/^\uFEFF/, '');
            res.set('Content-Type', 'text/csv');
            res.send(csvContent);
        } else {
            res.status(404).send('data.csv not found');
        }
    } catch (error) {
        res.status(500).send('Error reading data.csv');
    }
});

app.use('/', express.static(process.cwd()));

// gfx.html handler - unchanged from original
app.get('/gfx.html', (req, res) => {
    const lotNumber = req.query.lot;
    const userGfxPath = path.join(process.cwd(), 'gfx.html');
    
    if (fs.existsSync(userGfxPath)) {
        let html = fs.readFileSync(userGfxPath, 'utf8');
        html = html.replace(/lot=[\"']?[^\"'&]*[\"']?/g, `${lotNumber}`);
        res.send(html);
    } else {
        res.status(404).send('gfx.html not found');
    }
});

let server;

// Server functions - unchanged from original
async function startServer() {
    return new Promise((resolve, reject) => {
        server = app.listen(PORT, () => {
            console.log(`Local server running on http://localhost:${PORT}`);
            resolve();
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve();
            } else {
                reject(err);
            }
        });
    });
}

async function stopServer() {
    if (server) {
        await new Promise(resolve => server.close(resolve));
    }
}

// Create pgmGfx directory
async function ensureDirectories() {
    const dir = 'pgmGfx';
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
}

// CSV parsing - unchanged from original
async function getLotNumbersFromCSV() {
    try {
        const csvPath = path.join(process.cwd(), 'data.csv');
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

// Process each lot - refactored to use screenshotReady signal
async function processLot(page, lotNumber) {
    try {
        // FIXED: generate ?12345 instead of ?lot=12345
        const url = `http://localhost:${PORT}/gfx.html?${encodeURIComponent(lotNumber)}`;
        const outputPath = path.join('pgmGfx', `${lotNumber}.png`);
        
        console.log(`Processing lot ${lotNumber}`);
        
        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: 15000
        });

        // Wait for window.screenshotReady = true or timeout
        try {
            await page.waitForFunction('window.screenshotReady === true', { timeout: 10000 });
            console.log(`Page signaled ready for lot ${lotNumber}.`);
        } catch (e) {
            console.warn(`Timeout: screenshotReady not detected for lot ${lotNumber}, proceeding anyway.`);
        }

        // Make background transparent
        await page.evaluate(() => {
            document.body.style.background = 'transparent';
            document.documentElement.style.background = 'transparent';
        });

        await page.screenshot({
            path: outputPath,
            fullPage: false,
            omitBackground: true
        });
        
        console.log(`Saved ${outputPath}`);
        return true;
    } catch (error) {
        console.error(`Error processing lot ${lotNumber}:`, error.message);
        return false;
    }
}

// Main function - simplified
async function generateScreenshots() {
    try {
        await startServer();
        await ensureDirectories();
        
        const lotNumbers = await getLotNumbersFromCSV();
        if (lotNumbers.length === 0) {
            throw new Error('No records found in data.csv');
        }
        
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox']
        });
        
        const page = await browser.newPage();
        
        await page.setViewport({
            width: 1920,
            height: 150, // Only the height of the bottom row
            deviceScaleFactor: 1
        });

        const requestedLot = process.argv[2];
        
        if (!requestedLot) {
            // Process all lots
            for (const lotNumber of lotNumbers) {
                await processLot(page, lotNumber);
            }
        } else {
            // Process specific lot
            if (!lotNumbers.includes(requestedLot)) {
                console.error(`Lot ${requestedLot} not found in CSV data`);
            } else {
                await processLot(page, requestedLot);
            }
        }

        await browser.close();
        await stopServer();
        
    } catch (error) {
        console.error('Error:', error);
    }
}

generateScreenshots().catch(console.error);