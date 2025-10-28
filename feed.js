const WebSocket = require('ws');

const wsUrl = 'wss://csapis.com/2.0/market/feed/full';
const headers = {
    'Authorization': 'Bearer aW50Z2VxIGY2ZjUxZjliMTgyMzJjMmUxZGFkZWQ1ZDRjMDFjNjZm',
    'Origin': 'https://csapis.com'
};

const ws = new WebSocket(wsUrl, { headers });

ws.on('open', () => {
    console.log('Connected to WebSocket feed');
});

ws.on('message', (data) => {
    console.log('Received:', data.toString());
});

ws.on('error', (error) => {
    console.error('WebSocket error:', error);
});

ws.on('close', () => {
    console.log('WebSocket connection closed');
});