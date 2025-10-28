const WebSocket = require('ws');

const wsUrl = 'wss://csapis.com/2.0/market/feed/full';
const headers = {
    'Authorization': 'Bearer aW50Z2VxIGY2ZjUxZjliMTgyMzJjMmUxZGFkZWQ1ZDRjMDFjNjZm',
    'Origin': 'https://csapis.com'
};

// Terminal setup
const terminalHeight = process.stdout.rows || 30;
const topHalfHeight = Math.floor(terminalHeight / 2) - 1;
const separatorLine = topHalfHeight + 1;
const bottomHalfStart = topHalfHeight + 2;

// ANSI escape codes
const clearScreen = '\x1b[2J';
const moveCursor = (row, col) => `\x1b[${row};${col}H`;
const clearLine = '\x1b[2K';

let messages = [];
let filteredSymbols = []; // Array to store objects with 's' and 'v' values from filtered messages
let mainFilterResults = []; // Array to store results from MainFilter1
let bottomInfo = {
    status: 'Starting...',
    time: new Date().toLocaleTimeString(),
    messageCount: 0,
    filteredCount: 0,
    mainFilterCount: 0
};

// Initialize the split terminal
function initTerminal() {
    process.stdout.write(clearScreen);
    
    // Draw separator
    process.stdout.write(moveCursor(separatorLine, 1));
    process.stdout.write('─'.repeat(process.stdout.columns || 80));
    
    updateBottomPanel();
}

// Update top panel with messages
function updateTopPanel(newMessage) {
    messages.push(newMessage);
    
    // Keep only recent messages that fit in top half
    // Estimate lines needed (rough calculation)
    let totalLines = 0;
    let recentMessages = [];
    
    for (let i = messages.length - 1; i >= 0; i--) {
        const messageLines = Math.ceil(messages[i].length / (process.stdout.columns || 80));
        if (totalLines + messageLines <= topHalfHeight) {
            recentMessages.unshift(messages[i]);
            totalLines += messageLines;
        } else {
            break;
        }
    }
    
    // Clear top area
    for (let i = 1; i <= topHalfHeight; i++) {
        process.stdout.write(moveCursor(i, 1));
        process.stdout.write(clearLine);
    }
    
    // Display recent messages
    let currentLine = 1;
    recentMessages.forEach(message => {
        if (currentLine <= topHalfHeight) {
            process.stdout.write(moveCursor(currentLine, 1));
            process.stdout.write(message);
            
            // Calculate how many lines this message will take
            const messageLines = Math.ceil(message.length / (process.stdout.columns || 80));
            currentLine += messageLines;
        }
    });
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
                    
                    if (existingIndex !== -1) {
                        // Update existing entry
                        mainFilterResults[existingIndex] = {
                            s: messageSymbol,
                            v: volume,
                            timestamp: new Date().toLocaleTimeString()
                        };
                    } else {
                        // Add new entry
                        mainFilterResults.push({
                            s: messageSymbol,
                            v: volume,
                            timestamp: new Date().toLocaleTimeString()
                        });
                        bottomInfo.mainFilterCount++;
                    }
                    
                    // Sort by volume in descending order
                    mainFilterResults.sort((a, b) => b.v - a.v);
                    
                    // Keep only top 10 results
                    if (mainFilterResults.length > 10) {
                        mainFilterResults = mainFilterResults.slice(0, 10);
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
                        
                        if (existingIndex !== -1) {
                            // Update existing symbol with new volume value
                            filteredSymbols[existingIndex].v = volume;
                        } else {
                            // Add new symbol with volume
                            filteredSymbols.push({ s: symbol, v: volume });
                            bottomInfo.filteredCount++;
                        }
                        
                        // Sort array by volume in descending order
                        filteredSymbols.sort((a, b) => b.v - a.v);
                        
                        // Keep only top 10 symbols (limit array size)
                        if (filteredSymbols.length > 10) {
                            filteredSymbols = filteredSymbols.slice(0, 10);
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

// Update bottom panel
function updateBottomPanel() {
    // Clear bottom area
    for (let i = bottomHalfStart; i <= terminalHeight; i++) {
        process.stdout.write(moveCursor(i, 1));
        process.stdout.write(clearLine);
    }
    
    // Display bottom information
    process.stdout.write(moveCursor(bottomHalfStart, 1));
    process.stdout.write(`Status: ${bottomInfo.status}`);
    
    process.stdout.write(moveCursor(bottomHalfStart + 1, 1));
    process.stdout.write(`Total: ${bottomInfo.messageCount} | Filtered: ${bottomInfo.filteredCount} | MainFilter: ${bottomInfo.mainFilterCount}`);
    
    // Display table header
    process.stdout.write(moveCursor(bottomHalfStart + 2, 1));
    process.stdout.write(`${'Filtered Symbol'.padEnd(18)} ${'Volume'.padEnd(12)} ${'Main Symbol'.padEnd(18)} ${'Volume'.padEnd(12)}`);
    
    // Display table separator
    process.stdout.write(moveCursor(bottomHalfStart + 3, 1));
    process.stdout.write('─'.repeat(62));
    
    // Display table rows (up to 10 rows)
    let displayLine = bottomHalfStart + 4;
    const maxRows = Math.min(10, Math.max(filteredSymbols.length, terminalHeight - displayLine - 1));
    
    for (let i = 0; i < maxRows; i++) {
        process.stdout.write(moveCursor(displayLine, 1));
        
        if (i < filteredSymbols.length) {
            const filteredItem = filteredSymbols[i];
            const matchingMain = findMatchingMainFilter(filteredItem);
            
            // Column 1: Filtered Symbol
            const filteredSymbol = filteredItem.s.padEnd(18);
            
            // Column 2: Filtered Volume
            const filteredVolume = filteredItem.v.toLocaleString().padEnd(12);
            
            // Column 3: Matching Main Symbol (or empty if no match)
            const mainSymbol = matchingMain ? matchingMain.s.padEnd(18) : ''.padEnd(18);
            
            // Column 4: Main Volume (or empty if no match)
            const mainVolume = matchingMain ? matchingMain.v.toLocaleString().padEnd(12) : ''.padEnd(12);
            
            process.stdout.write(`${filteredSymbol} ${filteredVolume} ${mainSymbol} ${mainVolume}`);
        } else {
            // Empty row
            process.stdout.write(' '.repeat(62));
        }
        
        displayLine++;
    }
}

const ws = new WebSocket(wsUrl, { headers });

// Initialize terminal layout
initTerminal();

ws.on('open', () => {
    bottomInfo.status = 'Connected to WebSocket feed';
    updateBottomPanel();
});

ws.on('message', (data) => {
    const message = data.toString();
    bottomInfo.messageCount++;
    bottomInfo.time = new Date().toLocaleTimeString();
    bottomInfo.status = 'Receiving data...';
    
    // Process message through filter layers
    processMessageFilters(message);
    
    // Update top panel with new message
    updateTopPanel(message);
    
    // Update bottom panel
    updateBottomPanel();
});

ws.on('error', (error) => {
    bottomInfo.status = `Error: ${error.message}`;
    updateBottomPanel();
});

ws.on('close', () => {
    bottomInfo.status = 'WebSocket connection closed';
    updateBottomPanel();
});

// Update time every second
setInterval(() => {
    bottomInfo.time = new Date().toLocaleTimeString();
    updateBottomPanel();
}, 1000);

// Handle graceful exit
process.on('SIGINT', () => {
    // process.stdout.write(clearScreen);
    process.stdout.write(moveCursor(1, 1));
    console.log('Application terminated');
    process.exit(0);
});