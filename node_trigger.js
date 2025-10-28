const net = require('net');

/**
 * Simple Node.js client to trigger F4 keystroke in Python app controller
 */

function sendTrigger() {
    const client = net.createConnection(9999, 'localhost');
    
    client.on('connect', () => {
        console.log('Connected to Python app controller');
        console.log('Sending TRIGGER_F4 command...');
        client.write('TRIGGER_F4');
    });
    
    client.on('data', (data) => {
        console.log('Response from server:', data.toString().trim());
        client.end();
    });
    
    client.on('error', (err) => {
        console.error('Connection error:', err.message);
        console.log('Make sure the Python script is running and waiting for triggers');
    });
    
    client.on('close', () => {
        console.log('Connection closed');
    });
}

// Example usage scenarios:

// 1. Send trigger immediately
console.log('Sending F4 trigger to Python app controller...');
sendTrigger();

// 2. Send trigger after delay (uncomment to use)
// setTimeout(() => {
//     console.log('Sending delayed trigger...');
//     sendTrigger();
// }, 3000);

// 3. Send trigger based on some condition (example)
// const fs = require('fs');
// const watchFile = './trigger_condition.txt';
// 
// fs.watchFile(watchFile, (curr, prev) => {
//     console.log('File changed, sending trigger...');
//     sendTrigger();
// });