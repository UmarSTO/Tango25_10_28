const WebSocket = require('ws');
const path = require('path');
const { exec } = require('child_process');
const net = require('net');
const fs = require('fs');
const orderManager = require('./orderManager');

// Audio notification functions
function playF4Beep() {
    // Single beep for F4 trigger using Windows PowerShell
    try {
        const { exec } = require('child_process');
        exec('powershell -c "[console]::beep(800,200)"', (error) => {
            if (error) {
                // Fallback to process.stdout.write
                process.stdout.write('\x07');
            }
        });
    } catch (error) {
        // Final fallback
        process.stdout.write('\x07');
    }
}

function playF5Beep() {
    // Double beep for F5 trigger using Windows PowerShell
    try {
        const { exec } = require('child_process');
        exec('powershell -c "[console]::beep(1000,200)"', (error) => {
            if (error) {
                process.stdout.write('\x07');
            }
        });
        setTimeout(() => {
            exec('powershell -c "[console]::beep(1000,200)"', (error) => {
                if (error) {
                    process.stdout.write('\x07');
                }
            });
        }, 250);
    } catch (error) {
        // Final fallback
        process.stdout.write('\x07');
        setTimeout(() => {
            process.stdout.write('\x07');
        }, 200);
    }
}

const wsUrl = 'wss://feed.iel.net.pk';

// WebSocket connection function
function connectWebSocket() {
    try {
        connectionAttempts++;
        const timeSinceLastAttempt = Date.now() - lastConnectionAttempt;
        lastConnectionAttempt = Date.now();
        
        console.log(`🔄 Connection attempt #${connectionAttempts}`);
        console.log(`🕒 Time since last attempt: ${timeSinceLastAttempt}ms`);
        
        // Check for multiple connections
        if (wsConnection) {
            console.log(`🔍 Existing connection state: ${wsConnection.readyState}`);
            console.log(`🔍 OPEN=${WebSocket.OPEN}, CONNECTING=${WebSocket.CONNECTING}, CLOSING=${WebSocket.CLOSING}, CLOSED=${WebSocket.CLOSED}`);
            
            if (wsConnection.readyState === WebSocket.OPEN) {
                console.log('⚠️ MULTIPLE CONNECTION DETECTED - Connection already open - ABORTING');
                return;
            }
            if (wsConnection.readyState === WebSocket.CONNECTING) {
                console.log('⚠️ MULTIPLE CONNECTION DETECTED - Connection already connecting - ABORTING');
                return;
            }
        }
        
        console.log('🔄 Creating new WebSocket connection...');
        
        // Create WebSocket with Node.js specific options for stability
        const options = {
            // headers: headers,
            // Node.js WebSocket specific options
            rejectUnauthorized: false,  // Handle SSL issues
            followRedirects: false,     // Don't follow redirects
            maxRedirects: 0,           // No redirects
            // Remove any aggressive timeouts
            timeout: 0                  // No connection timeout
        };
        
        wsConnection = new WebSocket(wsUrl, options);
        
        wsConnection.on('open', () => {
            bottomInfo.status = 'Connected to WebSocket feed';
            console.log(`✅ WebSocket connected successfully (attempt #${connectionAttempts})`);
            console.log('🔍 Connection state:', wsConnection.readyState);
            console.log('🔍 Connection URL:', wsConnection.url);
            
            // Track connection time for debugging
            wsConnection.connectTime = Date.now();
            
            // Display will update when messages start flowing
        });
        
        wsConnection.on('message', (data) => {
            const message = data.toString();
            bottomInfo.messageCount++;
            bottomInfo.time = new Date().toLocaleTimeString();
            bottomInfo.status = 'Receiving data...';
            
            // Process message through filter layers
            processMessageFilters(message);
            
            // Check if we need to rebuild histogram data (after receiving some initial data)
            if (bottomInfo.messageCount === 100 && majorValues.length === 0 && filteredSymbols.length > 0) {
                rebuildHistogramData();
            }
            
            // Update display (throttled)
            updateDisplay();
        });
        
        // No pong handler needed - no heartbeat mechanism
        
        wsConnection.on('error', (error) => {
            bottomInfo.status = `Error: ${error.message}`;
            console.error('❌ WebSocket error:', error.message);
            
            // Save data on error
            saveArrayData();
            
            // NO AUTOMATIC RECONNECTION on errors either
            console.log('🛑 WebSocket error - no automatic reconnection');
        });
        
        wsConnection.on('close', (code, reason) => {
            bottomInfo.status = 'WebSocket connection closed';
            console.log(`🔌 WebSocket closed with code: ${code}, Reason: ${reason || 'No reason provided'}`);
            console.log('🔍 Connection duration:', Date.now() - (wsConnection.connectTime || 0), 'ms');
            console.log('🔍 Messages received:', bottomInfo.messageCount);
            console.log('🔍 Total connection attempts so far:', connectionAttempts);
            
            // Check if rapid disconnects are happening
            const connectionDuration = Date.now() - (wsConnection.connectTime || 0);
            if (connectionDuration < 5000) { // Less than 5 seconds
                console.log('⚠️ RAPID DISCONNECT DETECTED - Connection lasted less than 5 seconds!');
            }
            
            // Save data when connection closes
            saveArrayData();
            
            // NO AUTOMATIC RECONNECTION - let the connection stay closed
            console.log('� Connection closed - no automatic reconnection');
        });
        
    } catch (error) {
        console.error('❌ Failed to create WebSocket connection:', error);
        console.log('� Connection creation failed - no automatic retry');
    }
}

// Manual reconnection function (call manually if needed)
function manualReconnect() {
    console.log('🔄 Manual reconnection requested...');
    console.log('📞 MANUAL RECONNECT CALLED - This should only happen on user request');
    connectWebSocket();
}



let filteredSymbols = []; // Array to store objects with 's' and 'v' values from filtered messages
let mainFilterResults = []; // Array to store results from MainFilter1
let majorValues = []; // Array to store Major values with symbol combinations
let minorValues = []; // Array to store Minor values with symbol combinations

// WebSocket connection management
let wsConnection = null;
let connectionAttempts = 0;
let lastConnectionAttempt = 0;

// Data persistence
const DATA_DIR = './data';
let currentDataFile = null;

// Create data directory if it doesn't exist
function ensureDataDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`Created data directory: ${DATA_DIR}`);
    }
}

// Get current date string for filename
function getCurrentDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Save array data to file
function saveArrayData() {
    try {
        ensureDataDirectory();
        
        const dateString = getCurrentDateString();
        const filename = `market-data-${dateString}.json`;
        const filepath = path.join(DATA_DIR, filename);
        
        // Save essential state data and current histogram data
        const dataToSave = {
            timestamp: new Date().toISOString(),
            activeExecutions: activeExecutions, // Active trading states
            sessionStats: {
                messageCount: bottomInfo.messageCount,
                filteredCount: bottomInfo.filteredCount,
                mainFilterCount: bottomInfo.mainFilterCount
            },
            histogramData: {
                majorValues: majorValues, // Save current histogram calculations
                minorValues: minorValues,
                dataTimestamp: new Date().toISOString()
            }
        };
        
        fs.writeFileSync(filepath, JSON.stringify(dataToSave, null, 2));
        console.log(`📁 Data saved to: ${filename}`);
        currentDataFile = filepath;
        
    } catch (error) {
        console.error('Error saving array data:', error);
    }
}

// Load array data from file
function loadArrayData() {
    try {
        ensureDataDirectory();
        
        const dateString = getCurrentDateString();
        const filename = `market-data-${dateString}.json`;
        const filepath = path.join(DATA_DIR, filename);
        
        if (fs.existsSync(filepath)) {
            const fileContent = fs.readFileSync(filepath, 'utf8');
            const savedData = JSON.parse(fileContent);
            
            // Start fresh with symbol arrays but restore histogram data if available
            filteredSymbols = []; // Always start fresh from live feed
            mainFilterResults = []; // Always start fresh from live feed  
            activeExecutions = savedData.activeExecutions || {};
            
            // Restore histogram data if available and recent (within last hour)
            if (savedData.histogramData) {
                const dataAge = new Date() - new Date(savedData.histogramData.dataTimestamp);
                const oneHourMs = 60 * 60 * 1000;
                
                if (dataAge < oneHourMs) {
                    majorValues = savedData.histogramData.majorValues || [];
                    minorValues = savedData.histogramData.minorValues || [];
                    console.log(`📊 Restored histogram data: ${majorValues.length} major, ${minorValues.length} minor values`);
                } else {
                    majorValues = [];
                    minorValues = [];
                    console.log(`⏰ Histogram data expired (${Math.round(dataAge / 60000)} minutes old) - starting fresh`);
                }
            } else {
                majorValues = [];
                minorValues = [];
                console.log(`📊 No histogram data found - will rebuild from live feed`);
            }
            
            // Restore session stats if available
            if (savedData.sessionStats) {
                bottomInfo.messageCount = savedData.sessionStats.messageCount || 0;
                bottomInfo.filteredCount = savedData.sessionStats.filteredCount || 0;
                bottomInfo.mainFilterCount = savedData.sessionStats.mainFilterCount || 0;
            }
            
            console.log(`📂 State loaded from: ${filename}`);
            console.log(`   - Active executions: ${Object.keys(activeExecutions).length}`);
            console.log(`   - Symbol arrays will rebuild from live feed data`);
            
            currentDataFile = filepath;
            return true;
        } else {
            console.log(`📂 No existing state file found for today (${filename}) - starting fresh`);
            return false;
        }
        
    } catch (error) {
        console.error('Error loading state data:', error);
        return false;
    }
}

// Auto-save data periodically
function startAutoSave() {
    // Save data every 2 minutes for better histogram data preservation
    setInterval(() => {
        saveArrayData();
    }, 2 * 60 * 1000);
    
    // Clean up major/minor values arrays every 15 minutes to prevent memory bloat
    setInterval(() => {
        cleanupHistoricalValues();
    }, 15 * 60 * 1000);
    
    // Auto-save is now handled by the periodic interval above
    // WebSocket disconnect saves are handled directly in the connection handlers
}

// Clean up historical major/minor values to keep only recent entries
function cleanupHistoricalValues() {
    const maxEntries = 2000; // Keep last 2000 entries per array for better histogram continuity
    
    if (majorValues.length > maxEntries) {
        const removedCount = majorValues.length - maxEntries;
        majorValues = majorValues.slice(-maxEntries);
        console.log(`🧹 Cleaned up majorValues array: removed ${removedCount} old entries, kept last ${maxEntries}`);
    }
    
    if (minorValues.length > maxEntries) {
        const removedCount = minorValues.length - maxEntries;
        minorValues = minorValues.slice(-maxEntries);
        console.log(`🧹 Cleaned up minorValues array: removed ${removedCount} old entries, kept last ${maxEntries}`);
    }
}

// No heartbeat mechanism needed for active market data feed
// Continuous message flow naturally maintains connection health

// Connection health is now managed purely by heartbeat mechanism
// No artificial timeouts that could interfere with healthy connections

// Histogram tracking
let histogramWindowOpened = false;
let histogramServer = null;
let histogramClients = [];

// Execution monitoring
let activeExecutions = {}; // Track active symbol combinations and their stored Major values
let pythonSocketHost = 'localhost';
let pythonSocketPort = 9999;

// Order log management
const ORDER_LOG_FILE = path.join(__dirname, 'order_logs.txt');
let orderLogTerminalLaunched = false;

// Initialize order log file
function initOrderLogFile() {
    // Create/clear the order log file
    const timestamp = new Date().toLocaleString();
    fs.writeFileSync(ORDER_LOG_FILE, `=== Order Execution Logs - Session Started: ${timestamp} ===\n\n`);
    console.log(`📝 Order log file initialized: ${ORDER_LOG_FILE}`);
    
    // Launch a separate terminal to tail the order logs
    launchOrderLogTerminal();
}

// Launch a separate terminal to display order logs
function launchOrderLogTerminal() {
    if (orderLogTerminalLaunched) return;
    orderLogTerminalLaunched = true;
    
    let terminalCommand;
    
    // Detect OS and use appropriate terminal command
    if (process.platform === 'linux') {
        // Linux - try common terminal emulators
        terminalCommand = `gnome-terminal --title="Order Execution Logs" -- bash -c "tail -f '${ORDER_LOG_FILE}'; exec bash" || xterm -T "Order Execution Logs" -e "tail -f '${ORDER_LOG_FILE}'" || konsole --title "Order Execution Logs" -e "tail -f '${ORDER_LOG_FILE}'"`;
    } else if (process.platform === 'darwin') {
        // macOS
        terminalCommand = `osascript -e 'tell app "Terminal" to do script "tail -f ${ORDER_LOG_FILE}"'`;
    } else if (process.platform === 'win32') {
        // Windows
        terminalCommand = `start cmd /k "type ${ORDER_LOG_FILE} & timeout /t 1 > nul & powershell Get-Content ${ORDER_LOG_FILE} -Wait"`;
    }
    
    if (terminalCommand) {
        exec(terminalCommand, (error) => {
            if (error) {
                console.error('⚠️  Could not launch order log terminal:', error.message);
                console.log('💡 You can manually tail the order logs with: tail -f ' + ORDER_LOG_FILE);
            } else {
                console.log('✅ Order log terminal launched');
            }
        });
    }
}

// Function to add order log message
function addOrderLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logLine = `[${timestamp}] ${message}\n`;
    
    // Append to order log file
    try {
        fs.appendFileSync(ORDER_LOG_FILE, logLine);
    } catch (error) {
        console.error('Error writing to order log file:', error);
    }
}

// Function to create histogram WebSocket server
function createHistogramServer() {
    histogramServer = new WebSocket.Server({ port: 8080 });
    
    histogramServer.on('connection', (ws) => {
        console.log('Histogram window connected');
        histogramClients.push(ws);
        
        // Rebuild histogram data from current symbols if arrays are empty
        if (majorValues.length === 0 && minorValues.length === 0 && filteredSymbols.length > 0) {
            rebuildHistogramData();
        }
        
        // Send initial data if available
        sendHistogramUpdate();
        
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'major-activated') {
                    // Initialize or update execution with Major value tracking
                    if (!activeExecutions[data.symbolKey]) {
                        activeExecutions[data.symbolKey] = { timestamp: new Date().toISOString() };
                    }
                    
                    activeExecutions[data.symbolKey].storedMajor = data.storedMajor;
                    activeExecutions[data.symbolKey].majorDepth = data.majorDepth;
                    activeExecutions[data.symbolKey].majorRemaining = data.majorRemaining;
                    activeExecutions[data.symbolKey].majorState = 'Active';
                    
                    console.log(`🎯 Major monitoring activated for ${data.symbolKey}, target: ${data.storedMajor}, depth: ${data.majorDepth}`);
                    
                } else if (data.type === 'minor-activated') {
                    // Initialize or update execution with Minor value tracking
                    if (!activeExecutions[data.symbolKey]) {
                        activeExecutions[data.symbolKey] = { timestamp: new Date().toISOString() };
                    }
                    
                    activeExecutions[data.symbolKey].storedMinor = data.storedMinor;
                    activeExecutions[data.symbolKey].minorDepth = data.minorDepth;
                    activeExecutions[data.symbolKey].minorRemaining = data.minorRemaining;
                    activeExecutions[data.symbolKey].minorState = 'Active';
                    
                    console.log(`🎯 Minor monitoring activated for ${data.symbolKey}, target: ${data.storedMinor}, depth: ${data.minorDepth}`);
                    
                } else if (data.type === 'major-released') {
                    // Remove Major value monitoring
                    if (activeExecutions[data.symbolKey]) {
                        delete activeExecutions[data.symbolKey].storedMajor;
                        delete activeExecutions[data.symbolKey].majorDepth;
                        delete activeExecutions[data.symbolKey].majorRemaining;
                        delete activeExecutions[data.symbolKey].majorState;
                        
                        // If no minor monitoring either, remove completely
                        if (!activeExecutions[data.symbolKey].storedMinor) {
                            delete activeExecutions[data.symbolKey];
                        }
                    }
                    console.log(`⏹️ Major monitoring released for ${data.symbolKey}`);
                    
                } else if (data.type === 'minor-released') {
                    // Remove Minor value monitoring
                    if (activeExecutions[data.symbolKey]) {
                        delete activeExecutions[data.symbolKey].storedMinor;
                        delete activeExecutions[data.symbolKey].minorDepth;
                        delete activeExecutions[data.symbolKey].minorRemaining;
                        delete activeExecutions[data.symbolKey].minorState;
                        
                        // If no major monitoring either, remove completely
                        if (!activeExecutions[data.symbolKey].storedMajor) {
                            delete activeExecutions[data.symbolKey];
                        }
                    }
                    console.log(`⏹️ Minor monitoring released for ${data.symbolKey}`);
                    
                } else if (data.type === 'execution-activated') {
                    // Legacy support - convert to separate major/minor activations
                    if (!activeExecutions[data.symbolKey]) {
                        activeExecutions[data.symbolKey] = { timestamp: new Date().toISOString() };
                    }
                    
                    activeExecutions[data.symbolKey].storedMajor = data.storedMajor;
                    activeExecutions[data.symbolKey].storedMinor = data.storedMinor;
                    activeExecutions[data.symbolKey].majorDepth = data.depth || 1;
                    activeExecutions[data.symbolKey].majorRemaining = data.remainingTriggers || data.depth || 1;
                    activeExecutions[data.symbolKey].majorState = 'Active';
                    
                    console.log(`🎯 Legacy monitoring activated for ${data.symbolKey}, Major: ${data.storedMajor}, Minor: ${data.storedMinor}`);
                    sendStateUpdate(data.symbolKey, 'Active');
                    
                } else if (data.type === 'execution-deactivated') {
                    // Remove from active monitoring
                    delete activeExecutions[data.symbolKey];
                    console.log(`⏹️ Monitoring stopped for ${data.symbolKey}`);
                }
            } catch (error) {
                console.error('Error parsing message from histogram client:', error);
            }
        });
        
        ws.on('close', () => {
            console.log('Histogram window disconnected');
            histogramClients = histogramClients.filter(client => client !== ws);
        });
    });
    
    console.log('Histogram WebSocket server started on port 8080');
}

// Function to open histogram window
function openHistogramWindow() {
    if (histogramWindowOpened) return;
    
    histogramWindowOpened = true;
    createHistogramServer();
    
    // Open the HTML file in default browser
    const histogramPath = path.join(__dirname, 'histogram.html');
    
    // Detect OS and use appropriate command
    let openCommand;
    if (process.platform === 'win32') {
        openCommand = `start "" "${histogramPath}"`;
    } else if (process.platform === 'darwin') {
        openCommand = `open "${histogramPath}"`;
    } else {
        // Linux
        openCommand = `xdg-open "${histogramPath}"`;
    }
    
    exec(openCommand, (error) => {
        if (error) {
            console.error('Error opening histogram window:', error);
        } else {
            console.log('Histogram window opened');
        }
    });
}

// Function to rebuild histogram data from current live symbols
function rebuildHistogramData() {
    if (filteredSymbols.length === 0 || mainFilterResults.length === 0) return;
    
    console.log('🔄 Rebuilding histogram data from current live symbols...');
    
    // Generate initial major/minor values for existing symbol combinations
    for (let i = 0; i < Math.min(50, filteredSymbols.length); i++) {
        const filteredItem = filteredSymbols[i];
        const matchingMain = findMatchingMainFilter(filteredItem);
        
        if (matchingMain && filteredItem.bp && matchingMain.ap && filteredItem.ap && matchingMain.bp) {
            const symbolKey = `${filteredItem.s}-${matchingMain.s}`;
            
            // Calculate and store Major value
            const major = filteredItem.bp - matchingMain.ap;
            majorValues.push({ key: symbolKey, value: major });
            
            // Calculate and store Minor value
            const minor = Math.abs(matchingMain.bp - filteredItem.ap);
            minorValues.push({ key: symbolKey, value: minor });
        }
    }
    
    console.log(`📊 Rebuilt histogram data: ${majorValues.length} major values, ${minorValues.length} minor values`);
    
    // Send immediate histogram update if clients are connected
    if (histogramClients.length > 0) {
        sendHistogramUpdate();
    }
}

// Function to send histogram data to connected clients
function sendHistogramUpdate() {
    if (histogramClients.length === 0) return;
    
    // Get currently active symbol combinations from top 50 filtered symbols
    const activeSymbolKeys = new Set();
    const symbolMinGaps = {}; // Store Min Gap values for each symbol combination
    const symbolPrices = {}; // Store Price values for each symbol combination
    
    for (let i = 0; i < Math.min(50, filteredSymbols.length); i++) {
        const filteredItem = filteredSymbols[i];
        const matchingMain = findMatchingMainFilter(filteredItem);
        if (matchingMain) {
            const symbolKey = `${filteredItem.s}-${matchingMain.s}`;
            activeSymbolKeys.add(symbolKey);
            
            // Calculate Min Gap and Price for this symbol combination
            const priceValue = matchingMain.lt && matchingMain.lt.x ? matchingMain.lt.x : 0;
            const minGapValue = priceValue ? (parseFloat(priceValue) * 0.0005).toFixed(3) : '0.000';
            const priceDisplayValue = priceValue ? parseFloat(priceValue).toFixed(1) : '0.0';
            
            symbolMinGaps[symbolKey] = minGapValue;
            symbolPrices[symbolKey] = priceDisplayValue;
        }
    }
    
    // Organize data by active symbol combinations only
    const symbolCombinations = {};
    
    // Process majorValues for active symbols only
    majorValues.forEach(item => {
        if (activeSymbolKeys.has(item.key)) {
            if (!symbolCombinations[item.key]) {
                symbolCombinations[item.key] = { majorValues: [], minorValues: [] };
            }
            symbolCombinations[item.key].majorValues.push(item.value);
        }
    });
    
    // Process minorValues for active symbols only
    minorValues.forEach(item => {
        if (activeSymbolKeys.has(item.key)) {
            if (!symbolCombinations[item.key]) {
                symbolCombinations[item.key] = { majorValues: [], minorValues: [] };
            }
            symbolCombinations[item.key].minorValues.push(item.value);
        }
    });
    
    const message = JSON.stringify({
        type: 'histogram-update',
        symbols: symbolCombinations,
        activeSymbols: Array.from(activeSymbolKeys), // Send list of active symbols
        minGaps: symbolMinGaps, // Send Min Gap values for each symbol
        prices: symbolPrices // Send Price values for each symbol
    });
    
    histogramClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Function to send execution reset cue to histogram clients
function sendExecutionReset(symbolKey) {
    if (histogramClients.length === 0) return;
    
    const message = JSON.stringify({
        type: 'execution-reset',
        symbolKey: symbolKey
    });
    
    histogramClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    
    console.log(`Sent execution reset for ${symbolKey}`);
}

// Function to send trigger count update to histogram clients
function sendTriggerCountUpdate(symbolKey, remainingTriggers) {
    if (histogramClients.length === 0) return;
    
    const message = JSON.stringify({
        type: 'trigger-count-update',
        symbolKey: symbolKey,
        remainingTriggers: remainingTriggers
    });
    
    histogramClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    
    console.log(`Updated trigger count for ${symbolKey}: ${remainingTriggers} remaining`);
}

// Function to send state update to histogram clients
function sendStateUpdate(symbolKey, state) {
    if (histogramClients.length === 0) return;
    
    const message = JSON.stringify({
        type: 'state-update',
        symbolKey: symbolKey,
        state: state
    });
    
    histogramClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    
    console.log(`Updated state for ${symbolKey}: ${state}`);
}

// Function to send major trigger count update to histogram clients
function sendMajorTriggerCountUpdate(symbolKey, remainingTriggers) {
    if (histogramClients.length === 0) return;
    
    const message = JSON.stringify({
        type: 'major-trigger-update',
        symbolKey: symbolKey,
        remainingTriggers: remainingTriggers
    });
    
    histogramClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    
    console.log(`Updated major trigger count for ${symbolKey}: ${remainingTriggers} remaining`);
}

// Function to send minor trigger count update to histogram clients
function sendMinorTriggerCountUpdate(symbolKey, remainingTriggers) {
    if (histogramClients.length === 0) return;
    
    const message = JSON.stringify({
        type: 'minor-trigger-update',
        symbolKey: symbolKey,
        remainingTriggers: remainingTriggers
    });
    
    histogramClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    
    console.log(`Updated minor trigger count for ${symbolKey}: ${remainingTriggers} remaining`);
}

// Function to send major execution reset cue to histogram clients
function sendMajorExecutionReset(symbolKey) {
    if (histogramClients.length === 0) return;
    
    const message = JSON.stringify({
        type: 'major-reset',
        symbolKey: symbolKey
    });
    
    histogramClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    
    console.log(`Sent major execution reset for ${symbolKey}`);
}

// Function to send minor execution reset cue to histogram clients
function sendMinorExecutionReset(symbolKey) {
    if (histogramClients.length === 0) return;
    
    const message = JSON.stringify({
        type: 'minor-reset',
        symbolKey: symbolKey
    });
    
    histogramClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    
    console.log(`Sent minor execution reset for ${symbolKey}`);
}

// Function to send TRIGGER_F4 to Order API via orderManager
function sendTriggerF4(symbolKey, scripSymbol, futScrip, futScripBp) {
    return new Promise((resolve, reject) => {
        // Check if order connection is ready
        if (!orderManager.isOrderConnectionReady()) {
            reject(new Error('Order WebSocket is not connected'));
            return;
        }
        
        // F4: Buy the main scrip (REG market) and Short Sell the future scrip (FUT market)
        
        // Order 1: BUY main scrip (regular market)
        const buyMainOrder = orderManager.placeOrder({
            clientCode: '10020',
            symbol: scripSymbol,
            side: 'Buy',
            orderType: 'MKT',
            marketType: 'REG',
            volume: 500,
            triggerPrice: 0,
            orderProperty: 111
        });
        
        // Wait 100ms before placing second order
        setTimeout(() => {
            // Order 2: SHORT SELL future scrip
            const shortSellFutureOrder = orderManager.placeOrder({
                clientCode: '10020',
                symbol: futScrip,
                side: 'Buy',
                orderType: 'SHS',
                marketType: 'FUT',
                volume: 500,
                price: futScripBp,
                triggerPrice: 0,
                orderProperty: 111
            });
            
            if (buyMainOrder && shortSellFutureOrder) {
                const logMsg = `✅ F4: BUY ${scripSymbol} (500@REG) + SHORT SELL ${futScrip} (500@FUT@${futScripBp})`;
                addOrderLog(logMsg);
                console.log(logMsg);
                resolve(true);
            } else {
                reject(new Error('Failed to place F4 orders'));
            }
        }, 1000); // 1000ms delay
    });
}

// Function to send TRIGGER_F5 to Order API via orderManager
function sendTriggerF5(symbolKey, scripSymbol, futScrip) {
    return new Promise((resolve, reject) => {
        // Check if order connection is ready
        if (!orderManager.isOrderConnectionReady()) {
            reject(new Error('Order WebSocket is not connected'));
            return;
        }
        
        // F5: Buy the future scrip (FUT market) and Sell the main scrip (REG market)
        
        // Order 1: BUY future scrip
        const buyFutureOrder = orderManager.placeOrder({
            clientCode: '10020',
            symbol: futScrip,
            side: 'BUY',
            orderType: 'MKT',
            marketType: 'FUT',
            volume: 500,
            triggerPrice: 0,
            orderProperty: 111
        });
        
        // Order 2: SELL main scrip (regular market)
        const sellMainOrder = orderManager.placeOrder({
            clientCode: '10020',
            symbol: scripSymbol,
            side: 'SELL',
            orderType: 'MKT',
            marketType: 'REG',
            volume: 500,
            triggerPrice: 0,
            orderProperty: 111
        });
        
        if (buyFutureOrder && sellMainOrder) {
            const logMsg = `✅ F5: BUY ${futScrip} (500@FUT) + SELL ${scripSymbol} (500@REG)`;
            addOrderLog(logMsg);
            console.log(logMsg);
            resolve(true);
        } else {
            reject(new Error('Failed to place F5 orders'));
        }
    });
}

let bottomInfo = {
    status: 'Starting...',
    time: new Date().toLocaleTimeString(),
    messageCount: 0,
    filteredCount: 0,
    mainFilterCount: 0
};

// Initialize the display
function initDisplay() {
    console.log('Market Data Feed - Starting...');
}

// Filter_1: Check if message has data.m = 'FUT'
function filter1(messageObj) {
    try {
        if (messageObj.data && messageObj.data.m === 'FUT') {
            return true;
        }
    } catch (error) {
        // Ignore parsing errors
    }
    return false;
}

// Filter_2: Check if message has v > 100000
function filter2(messageObj) {
    try {
        if (messageObj.data && messageObj.data.v && parseFloat(messageObj.data.v) > 100000) {
            return true;
        }
    } catch (error) {
        // Ignore parsing errors
    }
    return false;
}

// Banned postfix array
const bannedPostfixes = ['OCT', 'OCTB'];

// Helper function to get symbol postfix (after '-' character)
function getSymbolPostfix(symbol) {
    const dashIndex = symbol.indexOf('-');
    return dashIndex !== -1 ? symbol.substring(dashIndex + 1) : '';
}

// Check if symbol has a banned postfix
function hasBannedPostfix(symbol) {
    const postfix = getSymbolPostfix(symbol);
    return bannedPostfixes.includes(postfix);
}

// Helper function to get symbol prefix (before '-' character)
function getSymbolPrefix(symbol) {
    const dashIndex = symbol.indexOf('-');
    return dashIndex !== -1 ? symbol.substring(0, dashIndex) : symbol;
}

// MainFilter1: Compare message symbol prefix with filteredSymbols prefixes
function mainFilter1(messageObj) {
    try {
        if (messageObj.data && messageObj.data.s) {
            const messageSymbol = messageObj.data.s;
            const messagePrefix = getSymbolPrefix(messageSymbol);
            
            // Check if this prefix matches any in filteredSymbols
            const matchFound = filteredSymbols.some(item => {
                const filteredPrefix = getSymbolPrefix(item.s);
                return messagePrefix === filteredPrefix;
            });
            
            if (matchFound) {
                // Only add symbols that do NOT contain '-' character
                if (!messageSymbol.includes('-')) {
                    // Add to mainFilterResults if not already present
                    const existingIndex = mainFilterResults.findIndex(item => item.s === messageSymbol);
                    const volume = messageObj.data.v ? parseFloat(messageObj.data.v) : 0;
                    
                    // Extract additional values
                    const ap = messageObj.data.ap ? parseFloat(messageObj.data.ap) : 0;
                    const bp = messageObj.data.bp ? parseFloat(messageObj.data.bp) : 0;
                    const av = messageObj.data.av ? parseFloat(messageObj.data.av) : 0;
                    const bv = messageObj.data.bv ? parseFloat(messageObj.data.bv) : 0;
                    const lt = messageObj.data.lt || null; // Extract lt object
                    
                    if (existingIndex !== -1) {
                        // Update existing entry, retain previous lt if new one is null
                        const existingLt = mainFilterResults[existingIndex].lt;
                        mainFilterResults[existingIndex] = {
                            s: messageSymbol,
                            v: volume,
                            ap: ap,
                            bp: bp,
                            av: av,
                            bv: bv,
                            lt: lt || existingLt, // Keep previous lt if new one is null
                            timestamp: new Date().toLocaleTimeString()
                        };
                        addRecentlyUpdated(messageSymbol); // Mark as recently updated
                    } else {
                        // Add new entry
                        mainFilterResults.push({
                            s: messageSymbol,
                            v: volume,
                            ap: ap,
                            bp: bp,
                            av: av,
                            bv: bv,
                            lt: lt,
                            timestamp: new Date().toLocaleTimeString()
                        });
                        addRecentlyUpdated(messageSymbol); // Mark as recently updated
                        bottomInfo.mainFilterCount++;
                    }
                    
                    // Sort by volume in descending order
                    mainFilterResults.sort((a, b) => b.v - a.v);
                    
                    // Keep only top 50 results
                    if (mainFilterResults.length > 50) {
                        mainFilterResults = mainFilterResults.slice(0, 50);
                    }
                }
                
                return true;
            }
        }
    } catch (error) {
        // Ignore parsing errors
    }
    return false;
}

// Process message through filter layers
function processMessageFilters(rawMessage) {
    try {
        // Parse the JSON message
        const messageObj = JSON.parse(rawMessage);
        
        // Apply Filter_1
        if (filter1(messageObj)) {
            // Apply Filter_2
            if (filter2(messageObj)) {
                // Message passed both filters, extract 's' and 'v' values
                if (messageObj.data && messageObj.data.s && messageObj.data.v) {
                    const symbol = messageObj.data.s;
                    const volume = parseFloat(messageObj.data.v);
                    
                    // Check if symbol has a banned postfix
                    if (!hasBannedPostfix(symbol)) {
                        // Find if symbol already exists
                        const existingIndex = filteredSymbols.findIndex(item => item.s === symbol);
                        
                        // Extract additional values
                        const ap = messageObj.data.ap ? parseFloat(messageObj.data.ap) : 0;
                        const bp = messageObj.data.bp ? parseFloat(messageObj.data.bp) : 0;
                        const av = messageObj.data.av ? parseFloat(messageObj.data.av) : 0;
                        const bv = messageObj.data.bv ? parseFloat(messageObj.data.bv) : 0;
                        const lt = messageObj.data.lt || null; // Extract lt object
                        
                        if (existingIndex !== -1) {
                            // Update existing symbol with new values, retain previous lt if new one is null
                            const existingLt = filteredSymbols[existingIndex].lt;
                            filteredSymbols[existingIndex].v = volume;
                            filteredSymbols[existingIndex].ap = ap;
                            filteredSymbols[existingIndex].bp = bp;
                            filteredSymbols[existingIndex].av = av;
                            filteredSymbols[existingIndex].bv = bv;
                            filteredSymbols[existingIndex].lt = lt || existingLt; // Keep previous lt if new one is null
                            addRecentlyUpdated(symbol); // Mark as recently updated
                        } else {
                            // Add new symbol with all values
                            filteredSymbols.push({ s: symbol, v: volume, ap: ap, bp: bp, av: av, bv: bv, lt: lt });
                            bottomInfo.filteredCount++;
                            addRecentlyUpdated(symbol); // Mark as recently updated
                        }
                        
                        // Sort array by volume in descending order
                        filteredSymbols.sort((a, b) => b.v - a.v);
                        
                        // Keep only top 50 symbols (limit array size)
                        if (filteredSymbols.length > 50) {
                            filteredSymbols = filteredSymbols.slice(0, 50);
                        }
                    }
                }
            }
        }
        
        // Apply MainFilter1 (independent of other filters)
        mainFilter1(messageObj);
        
    } catch (error) {
        // Ignore JSON parsing errors
    }
}

// Helper function to find matching MainFilter result by prefix
function findMatchingMainFilter(filteredSymbol) {
    const filteredPrefix = getSymbolPrefix(filteredSymbol.s);
    return mainFilterResults.find(mainItem => {
        const mainPrefix = getSymbolPrefix(mainItem.s);
        return filteredPrefix === mainPrefix;
    });
}

let lastDisplayTime = 0;
const DISPLAY_THROTTLE = 2000; // Only update display every 2 seconds
let recentlyUpdated = new Set(); // Track recently updated symbols
let updateTimeouts = new Map(); // Track timeouts for each symbol

// Function to add symbol with 0.5 second timeout
function addRecentlyUpdated(symbol) {
    // Clear any existing timeout for this symbol
    if (updateTimeouts.has(symbol)) {
        clearTimeout(updateTimeouts.get(symbol));
    }
    
    // Add symbol to recently updated set
    recentlyUpdated.add(symbol);
    
    // Set timeout to remove after 0.5 seconds
    const timeoutId = setTimeout(() => {
        recentlyUpdated.delete(symbol);
        updateTimeouts.delete(symbol);
    }, 500);
    
    updateTimeouts.set(symbol, timeoutId);
}

// Update display (throttled)
function updateDisplay(forceUpdate = false) {
    const currentTime = Date.now();
    
    // Only update display every 2 seconds or if forced
    if (!forceUpdate && (currentTime - lastDisplayTime) < DISPLAY_THROTTLE) {
        return;
    }
    
    lastDisplayTime = currentTime;
    console.clear();
    
    // Display status information
    console.log(`Status: ${bottomInfo.status}`);
    console.log(`Total: ${bottomInfo.messageCount} | Filtered: ${bottomInfo.filteredCount} | MainFilter: ${bottomInfo.mainFilterCount}`);
    console.log('');
    
    // Set smaller font size and display table header
    console.log('\x1b]50;SetProfile=;FontSize=11\x07'); // Reduce font size
    console.log('Filtered Symbol'.padEnd(15) + ' │ ' + 'Price'.padEnd(9) + ' │ ' + 'Min Gap'.padEnd(8) + ' │ ' + 'Main Symbol'.padEnd(15) + ' │ ' + 'Volume'.padEnd(9) + ' │ ' + 'Major'.padEnd(9) + ' │ ' + 'Minor'.padEnd(9) + ' │ ' + 'High Major'.padEnd(9) + ' │ ' + 'Low Minor'.padEnd(9));
    console.log('─'.repeat(15) + '─┼─' + '─'.repeat(9) + '─┼─' + '─'.repeat(8) + '─┼─' + '─'.repeat(15) + '─┼─' + '─'.repeat(9) + '─┼─' + '─'.repeat(9) + '─┼─' + '─'.repeat(9) + '─┼─' + '─'.repeat(9) + '─┼─' + '─'.repeat(9));
    
    // Display table rows (full 20 rows now - no need to reserve space for logs)
    for (let i = 0; i < Math.min(20, filteredSymbols.length); i++) {
        const filteredItem = filteredSymbols[i];
        const matchingMain = findMatchingMainFilter(filteredItem);
        
        // Check if this row was recently updated
        const isUpdated = recentlyUpdated.has(filteredItem.s) || (matchingMain && recentlyUpdated.has(matchingMain.s));
        const bgColor = isUpdated ? '\x1b[100m' : ''; // Bright gray background for updates
        const resetColor = '\x1b[0m';
        
        // Column 1: Filtered Symbol (with background color if updated)
        const filteredSymbol = isUpdated ? 
            `${bgColor}${filteredItem.s.padEnd(15)}${resetColor}` : 
            filteredItem.s.padEnd(15);
        
        // Column 2: Price (lt.x value from main symbol)
        const priceValue = matchingMain && matchingMain.lt && matchingMain.lt.x ? matchingMain.lt.x.toFixed(1) : '';
        const priceColumn = priceValue.padEnd(9);
        
        // Column 3: Min Gap (Price × 0.223%)
        const minGapValue = priceValue ? (parseFloat(priceValue) * 0.00223).toFixed(3) : '';
        const minGapColumn = minGapValue.padEnd(8);
        
        // Column 4: Matching Main Symbol (or empty if no match)
        const mainSymbol = matchingMain ? matchingMain.s.padEnd(15) : ''.padEnd(15);
        
        // Column 5: Main Volume (in millions, or empty if no match)
        const mainVolumeM = matchingMain ? (matchingMain.v / 1000000).toFixed(1) + 'M' : '';
        const mainVolume = mainVolumeM.padEnd(9);
        
        // Column 6: Major (filteredSymbol.bp - mainFilterResults.ap)
        let majorValue = '';
        let minorValue = '';
        let highestMajorValue = '';
        let lowestMinorValue = '';
        
        if (matchingMain && filteredItem.bp && matchingMain.ap) {
            // Open histogram window when Major/Minor calculations begin (first time only)
            if (!histogramWindowOpened) {
                openHistogramWindow();
            }
            
            const major = filteredItem.bp - matchingMain.ap;
            majorValue = major.toFixed(4);
            
            // Create symbol combination key
            const symbolKey = `${filteredItem.s}-${matchingMain.s}`;
            
            // Store Major value in tracking array
            majorValues.push({ key: symbolKey, value: major });
            
            // Calculate highest Major for this symbol combination
            const majorForSymbol = majorValues.filter(item => item.key === symbolKey).map(item => item.value);
            const highestMajor = Math.max(...majorForSymbol);
            highestMajorValue = highestMajor.toFixed(4);
            
            // Check if this symbol combination is being monitored for execution
            if (activeExecutions[symbolKey]) {
                const execution = activeExecutions[symbolKey];
                const currentMajor = parseFloat(majorValue);
                
                // Check Major value monitoring (F4 triggers)
                if (execution.storedMajor !== undefined && execution.majorState === 'Active') {
                    const targetMajor = parseFloat(execution.storedMajor);
                    const isTriggered = currentMajor >= targetMajor;
                    
                    if (isTriggered && execution.majorRemaining > 0) {
                        // Play single beep for F4 trigger
                        playF4Beep();
                        
                        // Get the scrip symbol (main symbol from mainFilterResults)
                        const scripSymbol = matchingMain.s;
                        
                        // Add log message for F4 trigger
                        addOrderLog(`🔔 F4 TRIGGERED: ${symbolKey} - Major: ${currentMajor.toFixed(4)} >= ${targetMajor.toFixed(4)}`);
                        
                        // Send F4 trigger to Order API
                        sendTriggerF4(symbolKey, scripSymbol, filteredItem.s, filteredItem.bp).then(() => {
                            // Decrement major remaining triggers
                            activeExecutions[symbolKey].majorRemaining--;
                            const newMajorRemaining = activeExecutions[symbolKey].majorRemaining;
                            
                            // Send updated major trigger count to histogram clients
                            sendMajorTriggerCountUpdate(symbolKey, newMajorRemaining);
                            
                            // If no major triggers remaining, reset major monitoring
                            if (newMajorRemaining <= 0) {
                                console.log(`🏁 All major triggers used for ${symbolKey}. Resetting major monitoring.`);
                                sendMajorExecutionReset(symbolKey);
                                delete activeExecutions[symbolKey].storedMajor;
                                delete activeExecutions[symbolKey].majorDepth;
                                delete activeExecutions[symbolKey].majorRemaining;
                                delete activeExecutions[symbolKey].majorState;
                                
                                // If no minor monitoring either, remove completely
                                if (!activeExecutions[symbolKey].storedMinor) {
                                    delete activeExecutions[symbolKey];
                                }
                            }
                        }).catch(error => {
                            addOrderLog(`❌ F4 Order Failed: ${symbolKey} - ${error.message}`);
                        });
                    }
                }
            }
        }
        const majorColumn = majorValue.padEnd(9);
        
        // Column 7: Minor (mainFilterResults.bp - filteredSymbol.ap) - absolute value
        if (matchingMain && matchingMain.bp && filteredItem.ap) {
            const minor = Math.abs(matchingMain.bp - filteredItem.ap);
            minorValue = minor.toFixed(4);
            
            // Create symbol combination key
            const symbolKey = `${filteredItem.s}-${matchingMain.s}`;
            
            // Store Minor value in tracking array
            minorValues.push({ key: symbolKey, value: minor });
            
            // Calculate lowest Minor for this symbol combination
            const minorForSymbol = minorValues.filter(item => item.key === symbolKey).map(item => item.value);
            const lowestMinor = Math.min(...minorForSymbol);
            lowestMinorValue = lowestMinor.toFixed(4);
            
            // Check Minor value monitoring (F5 triggers)
            if (activeExecutions[symbolKey] && activeExecutions[symbolKey].storedMinor !== undefined && activeExecutions[symbolKey].minorState === 'Active') {
                const execution = activeExecutions[symbolKey];
                const currentMinor = parseFloat(minorValue);
                const targetMinor = parseFloat(execution.storedMinor);
                const isTriggered = currentMinor <= targetMinor;
                
                if (isTriggered && execution.minorRemaining > 0) {
                    // Play double beep for F5 trigger
                    playF5Beep();
                    
                    // Get the scrip symbol (main symbol from mainFilterResults)
                    const scripSymbol = matchingMain.s;
                    
                    // Add log message for F5 trigger
                    addOrderLog(`🔔 F5 TRIGGERED: ${symbolKey} - Minor: ${currentMinor.toFixed(4)} <= ${targetMinor.toFixed(4)}`);
                    
                    // Send F5 trigger to Order API
                    sendTriggerF5(symbolKey, scripSymbol, filteredItem.s).then(() => {
                        // Decrement minor remaining triggers
                        activeExecutions[symbolKey].minorRemaining--;
                        const newMinorRemaining = activeExecutions[symbolKey].minorRemaining;
                        
                        // Send updated minor trigger count to histogram clients
                        sendMinorTriggerCountUpdate(symbolKey, newMinorRemaining);
                        
                        // If no minor triggers remaining, reset minor monitoring
                        if (newMinorRemaining <= 0) {
                            console.log(`🏁 All minor triggers used for ${symbolKey}. Resetting minor monitoring.`);
                            sendMinorExecutionReset(symbolKey);
                            delete activeExecutions[symbolKey].storedMinor;
                            delete activeExecutions[symbolKey].minorDepth;
                            delete activeExecutions[symbolKey].minorRemaining;
                            delete activeExecutions[symbolKey].minorState;
                            
                            // If no major monitoring either, remove completely
                            if (!activeExecutions[symbolKey].storedMajor) {
                                delete activeExecutions[symbolKey];
                            }
                        }
                    }).catch(error => {
                        addOrderLog(`❌ F5 Order Failed: ${symbolKey} - ${error.message}`);
                    });
                }
            }
        }
        const minorColumn = minorValue.padEnd(9);
        
        // Send histogram update if calculations were performed
        if ((majorValue || minorValue) && histogramWindowOpened) {
            sendHistogramUpdate();
        }
        
        // Column 8: Highest Major for this symbol combination
        const highMajorColumn = highestMajorValue.padEnd(9);
        
        // Column 9: Lowest Minor for this symbol combination
        const lowMinorColumn = lowestMinorValue.padEnd(9);
        
        console.log(`${filteredSymbol} │ ${priceColumn} │ ${minGapColumn} │ ${mainSymbol} │ ${mainVolume} │ ${majorColumn} │ ${minorColumn} │ ${highMajorColumn} │ ${lowMinorColumn}`);
    }
    
    console.log('');
    console.log('💡 Order execution logs are displayed in a separate terminal window');
    console.log('📝 Log file: ' + ORDER_LOG_FILE);
}

// Initialize application
function initializeApplication() {
    // Initialize display
    initDisplay();
    
    // Initialize order log file and terminal
    initOrderLogFile();
    
    // Load existing data for today
    const dataLoaded = loadArrayData();
    
    if (dataLoaded) {
        console.log('📊 Restored active trading states and histogram data');
        
        // If histogram data was loaded, send immediate update when histogram client connects
        if (majorValues.length > 0 || minorValues.length > 0) {
            console.log('📈 Histogram data ready for immediate display');
        }
    } else {
        console.log('🆕 Starting fresh session for today');
    }
    
    // Start auto-save mechanism
    startAutoSave();
    
    // Initialize Order WebSocket connection
    console.log('🔌 Initializing Order API WebSocket...');
    orderManager.initializeOrderConnection(() => {
        const msg = '✅ Order API WebSocket ready for order execution';
        console.log(msg);
        addOrderLog(msg);
    });
    
    // Connect to Market Data WebSocket
    connectWebSocket();
    
    // Set up a delayed histogram rebuild check after WebSocket has time to receive initial data
    setTimeout(() => {
        if (filteredSymbols.length > 0 && majorValues.length === 0) {
            rebuildHistogramData();
        }
    }, 10000); // Wait 10 seconds for initial data to populate
}

// Start the application
initializeApplication();



// Update time every second (but don't force display update)
setInterval(() => {
    bottomInfo.time = new Date().toLocaleTimeString();
    // Don't call updateDisplay() here to avoid flickering
}, 1000);



// Handle graceful exit
process.on('SIGINT', () => {
    console.log('🛑 Application shutting down...');
    
    // Save data before exit
    console.log('💾 Saving data before exit...');
    saveArrayData();
    
    // Clean up WebSocket connection
    if (wsConnection) {
        wsConnection.close();
    }
    
    // Close histogram server
    if (histogramServer) {
        histogramServer.close();
    }
    
    // Disconnect order WebSocket
    orderManager.disconnectOrderConnection();
    
    console.log('✅ Application terminated gracefully');
    process.exit(0);
});

// Handle other exit scenarios
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    saveArrayData();
    orderManager.disconnectOrderConnection();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    saveArrayData();
    orderManager.disconnectOrderConnection();
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    saveArrayData();
});