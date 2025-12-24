const WebSocket = require('ws');
const SockJS = require('sockjs-client');
const Stomp = require('stompjs');

// WebSocket connection details
const wsUrl = 'https://trade.iel.net.pk:1219/order-dispatch-websocket';

// Authentication credentials
const authHeaders = {
    'id': '10020',
    'nostr': 'Lahore123'
};

console.log('🔄 Connecting to Order WebSocket...');
console.log('📡 URL:', wsUrl);
console.log('🔑 Auth ID:', authHeaders.id);
console.log('');

// Create SockJS connection
const sock = new SockJS(wsUrl, null, {
    headers: authHeaders,
    transports: ['websocket', 'xhr-streaming', 'xhr-polling']
});

// Create STOMP client over SockJS
const stompClient = Stomp.over(sock);

let isConnected = false;

// Connect to STOMP
stompClient.connect(authHeaders, function(frame) {
    console.log('✅ Connected to Order WebSocket via STOMP');
    console.log('📊 Ready to place orders...');
    console.log('');
    isConnected = true;
    
    // Send login details to the destination (just the id as a string)
    const loginId = authHeaders.id;
    
    console.log('📤 Sending login details to /app/order-service/login-details');
    console.log('Login ID:', loginId);
    console.log('');
    
    stompClient.send('/app/order-service/login-details', {}, loginId);
    
    // Subscribe to receive responses
    stompClient.subscribe(`/user/${loginId}/order-service.notify`, function(message) {
        const timestamp = new Date().toISOString();
        console.log(`📨 [${timestamp}] Login Response:`);
        console.log(message.body);
        console.log('─'.repeat(80));
    });
    
    // Subscribe to general responses
    // stompClient.subscribe(`/user/${loginId}/order-updates`, function(message) {
    //     const timestamp = new Date().toISOString();
    //     console.log(`� [${timestamp}] Order Update:`);
    //     console.log(message.body);
    //     console.log('─'.repeat(80));
    // });
    
    // Example: Place an order after connection
    // Uncomment and modify the parameters as needed
    
    placeOrder({
        clientCode: '10020',
        symbol: 'WTL',
        side: 'SELL',
        price: 1.75,
        volume: 15,
        triggerPrice: 0
    });
    
    
}, function(error) {
    console.log('');
    console.error('❌ STOMP error:', error);
});

/**
 * Place an order on the WebSocket
 * @param {Object} orderParams - Order parameters
 * @param {string} orderParams.clientCode - Client code
 * @param {string} orderParams.symbol - Trading symbol
 * @param {string} orderParams.side - Order side (BUY/SELL)
 * @param {number} orderParams.price - Order price (0 for market orders)
 * @param {number} orderParams.volume - Order volume
 * @param {number} orderParams.triggerPrice - Trigger price (0 if not applicable)
 */
function placeOrder(orderParams) {
    const {
        clientCode,
        symbol,
        side,
        price,
        volume,
        triggerPrice
    } = orderParams;
    
    if (!isConnected) {
        console.error('❌ WebSocket is not connected. Cannot place order.');
        return;
    }
    
    const payload = {
        clientCode: clientCode,
        symbol: symbol,
        side: side,
        refNo: 0,
        price: price ? parseFloat(price) : 0,
        volume: parseInt(volume),
        triggerPrice: triggerPrice ? parseFloat(triggerPrice) : 0,
        orderType: "MKT",
        marketType: "REG",
        userId: authHeaders.id, // Using the auth ID as userId
        actionType: "neworder",
        orignateSource: "W",
        discVolume: 0,
        orderProperty: 111,
        subClientCode: ""
    };
    
    console.log('📤 Placing order:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('');

    stompClient.send(`/app/order-service.${JSON.stringify(payload)}`, {}, JSON.stringify(payload));
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('');
    console.log('🛑 Shutting down...');
    if (isConnected) {
        stompClient.disconnect();
    }
    process.exit(0);
});

console.log('💡 Press Ctrl+C to stop');

// Export the placeOrder function for use in other modules
module.exports = {
    placeOrder,
    stompClient
};
