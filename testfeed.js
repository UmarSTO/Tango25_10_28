const WebSocket = require('ws');

// WebSocket connection details
const wsUrl = 'wss://feed.iel.net.pk';

// Symbols to subscribe to
const symbols = ["BOP", "TRG"];

console.log('🔄 Connecting to WebSocket feed...');
console.log('📡 URL:', wsUrl);
console.log('');

// Create WebSocket connection (no authentication, accept self-signed certificates)
const ws = new WebSocket(wsUrl, {
    rejectUnauthorized: false
});

let messageCount = 0;
let startTime = null;

ws.on('open', () => {
    console.log('✅ Connected to WebSocket feed');
    
    // Subscribe to symbols
    const subscribeMessage = {
        type: "subscribe",
        symbols: symbols
    };
    
    console.log('📤 Sending subscription request:', JSON.stringify(subscribeMessage));
    ws.send(JSON.stringify(subscribeMessage));
    
    console.log('📊 Listening for messages...');
    console.log('');
    startTime = Date.now();
});

ws.on('message', (data) => {
    messageCount++;
    const message = data.toString();
    const timestamp = new Date().toISOString();
    
    console.log(`[${messageCount}] ${timestamp}`);
    console.log(message);
    console.log('─'.repeat(80));
});

ws.on('close', (code, reason) => {
    const duration = startTime ? Date.now() - startTime : 0;
    console.log('');
    console.log('🔌 Connection closed');
    console.log(`📊 Code: ${code}`);
    console.log(`📝 Reason: ${reason || 'No reason provided'}`);
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📈 Messages received: ${messageCount}`);
});

ws.on('error', (error) => {
    console.log('');
    console.error('❌ WebSocket error:', error.message);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('');
    console.log('🛑 Shutting down...');
    ws.close();
    process.exit(0);
});

console.log('💡 Press Ctrl+C to stop');
