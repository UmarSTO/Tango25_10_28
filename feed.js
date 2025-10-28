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
let bottomInfo = {
    status: 'Starting...',
    time: new Date().toLocaleTimeString(),
    messageCount: 0
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
    process.stdout.write(`Time: ${bottomInfo.time}`);
    
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
    process.stdout.write(clearScreen);
    process.stdout.write(moveCursor(1, 1));
    console.log('Application terminated');
    process.exit(0);
});