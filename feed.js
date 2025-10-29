const WebSocket = require('ws');

const wsUrl = 'wss://csapis.com/2.0/market/feed/full';
const headers = {
    'Authorization': 'Bearer aW50Z2VxIGY2ZjUxZjliMTgyMzJjMmUxZGFkZWQ1ZDRjMDFjNjZm',
    'Origin': 'https://csapis.com'
};



let filteredSymbols = []; // Array to store objects with 's' and 'v' values from filtered messages
let mainFilterResults = []; // Array to store results from MainFilter1
let majorValues = []; // Array to store Major values with symbol combinations
let minorValues = []; // Array to store Minor values with symbol combinations

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
                    
                    // Keep only top 20 results
                    if (mainFilterResults.length > 20) {
                        mainFilterResults = mainFilterResults.slice(0, 20);
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
                        
                        // Keep only top 20 symbols (limit array size)
                        if (filteredSymbols.length > 20) {
                            filteredSymbols = filteredSymbols.slice(0, 20);
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
    
    // Display table rows
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
        
        // Column 3: Min Gap (Price × 0.112%)
        const minGapValue = priceValue ? (parseFloat(priceValue) * 0.00112).toFixed(3) : '';
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
        }
        const minorColumn = minorValue.padEnd(9);
        
        // Column 7: Highest Major for this symbol combination
        const highMajorColumn = highestMajorValue.padEnd(9);
        
        // Column 8: Lowest Minor for this symbol combination
        const lowMinorColumn = lowestMinorValue.padEnd(9);
        
        console.log(`${filteredSymbol} │ ${priceColumn} │ ${minGapColumn} │ ${mainSymbol} │ ${mainVolume} │ ${majorColumn} │ ${minorColumn} │ ${highMajorColumn} │ ${lowMinorColumn}`);
    }
    
    // Note: recentlyUpdated symbols are now cleared automatically after 0.5 seconds via setTimeout
}

const ws = new WebSocket(wsUrl, { headers });

// Initialize display
initDisplay();

ws.on('open', () => {
    bottomInfo.status = 'Connected to WebSocket feed';
    updateDisplay(true); // Force initial display
});

ws.on('message', (data) => {
    const message = data.toString();
    bottomInfo.messageCount++;
    bottomInfo.time = new Date().toLocaleTimeString();
    bottomInfo.status = 'Receiving data...';
    
    // Process message through filter layers
    processMessageFilters(message);
    
    // Update display (throttled)
    updateDisplay();
});

ws.on('error', (error) => {
    bottomInfo.status = `Error: ${error.message}`;
    updateDisplay(true); // Force display for errors
});

ws.on('close', () => {
    bottomInfo.status = 'WebSocket connection closed';
    updateDisplay(true); // Force display for connection close
});



// Update time every second (but don't force display update)
setInterval(() => {
    bottomInfo.time = new Date().toLocaleTimeString();
    // Don't call updateDisplay() here to avoid flickering
}, 1000);



// Handle graceful exit
process.on('SIGINT', () => {
    console.log('Application terminated');
    process.exit(0);
});