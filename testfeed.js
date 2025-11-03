const WebSocket = require('ws');

// WebSocket connection details
const wsUrl = 'wss://csapis.com/2.0/market/feed/full';
const headers = {
    'Authorization': 'Bearer aW50Z2VxIGY2ZjUxZjliMTgyMzJjMmUxZGFkZWQ1ZDRjMDFjNjZm',
    'Origin': 'https://csapis.com'
};

console.log('🔄 Connecting to WebSocket feed...');
console.log('📡 URL:', wsUrl);
console.log('🔑 Authorization: Bearer aW50Z2VxIGY2ZjUxZjliMTgyMzJjMmUxZGFkZWQ1ZDRjMDFjNjZm');
console.log('');

// Create WebSocket connection
const ws = new WebSocket(wsUrl, { headers });

let messageCount = 0;
let startTime = null;

ws.on('open', () => {
    console.log('✅ Connected to WebSocket feed');
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
