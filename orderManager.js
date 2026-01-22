const WebSocket = require('ws');
const SockJS = require('sockjs-client');
const Stomp = require('stompjs');
const fs = require('fs');
const path = require('path');

// WebSocket connection details
const wsUrl = 'https://trade.iel.net.pk:1219/order-dispatch-websocket';

// Order log file path
const ORDER_LOG_FILE = path.join(__dirname, 'order_logs.txt');

// Helper function to log to both console and file
function logToOrderFile(message) {
    const timestamp = new Date().toLocaleTimeString();
    const fullMessage = `[${timestamp}] ${message}`;
    
    // Log to console
    console.log(fullMessage);
    
    // Log to file
    try {
        fs.appendFileSync(ORDER_LOG_FILE, fullMessage + '\n');
    } catch (error) {
        console.error('Error writing to order log:', error);
    }
}

// Authentication credentials
const authHeaders = {
    'id': 'IPP2',
    'nostr': 'Lahore123'
};

let stompClient = null;
let isConnected = false;
let connectionCallback = null;

/**
 * Initialize the order WebSocket connection
 * @param {Function} onConnect - Callback function to execute when connected
 */
function initializeOrderConnection(onConnect) {
    connectionCallback = onConnect;
    
    logToOrderFile('🔄 Connecting to Order WebSocket...');
    logToOrderFile('📡 URL: ' + wsUrl);
    logToOrderFile('🔑 Auth ID: ' + authHeaders.id);
    logToOrderFile('');

    // Create SockJS connection
    const sock = new SockJS(wsUrl, null, {
        headers: authHeaders,
        transports: ['websocket', 'xhr-streaming', 'xhr-polling']
    });

    // Create STOMP client over SockJS
    stompClient = Stomp.over(sock);
    
    // Disable STOMP debug output (we'll handle logging ourselves)
    stompClient.debug = null;

    // Connect to STOMP
    stompClient.connect(authHeaders, function(frame) {
        logToOrderFile('✅ Connected to Order WebSocket via STOMP');
        logToOrderFile('📊 Frame: ' + JSON.stringify(frame));
        logToOrderFile('📊 Ready to place orders...');
        logToOrderFile('');
        isConnected = true;
        
        // Send login details to the destination (just the id as a string)
        const loginId = authHeaders.id;
        
        logToOrderFile('📤 Sending login details to /app/order-service/login-details');
        logToOrderFile('   Login ID: ' + loginId);
        logToOrderFile('');
        
        stompClient.send('/app/order-service/login-details', {}, loginId);
        
        // Subscribe to receive responses
        const subscriptionPath = `/user/${loginId}/order-service.notify`;
        logToOrderFile('📡 Subscribing to: ' + subscriptionPath);
        logToOrderFile('');
        
        stompClient.subscribe(subscriptionPath, function(message) {
            logToOrderFile('═'.repeat(80));
            logToOrderFile('📨 ORDER RESPONSE RECEIVED:');
            logToOrderFile('─'.repeat(80));
            
            // Log raw message
            logToOrderFile('Raw message body:');
            logToOrderFile(message.body);
            
            // Try to parse and pretty print if it's JSON
            try {
                const parsedMessage = JSON.parse(message.body);
                logToOrderFile('');
                logToOrderFile('Parsed message:');
                logToOrderFile(JSON.stringify(parsedMessage, null, 2));
            } catch (e) {
                // Not JSON, that's okay
                logToOrderFile('(Message is not JSON format)');
            }
            
            logToOrderFile('═'.repeat(80));
            logToOrderFile('');
        }, function(error) {
            logToOrderFile('❌ Subscription error: ' + JSON.stringify(error));
        });
        
        logToOrderFile('✅ Subscription established successfully');
        logToOrderFile('');
        
        // Call the connection callback if provided
        if (connectionCallback) {
            connectionCallback();
        }
        
    }, function(error) {
        logToOrderFile('');
        logToOrderFile('❌ STOMP connection error: ' + JSON.stringify(error));
        logToOrderFile('Error details: ' + error.toString());
        isConnected = false;
    });
}

/**
 * Place an order on the WebSocket
 * @param {Object} orderParams - Order parameters
 * @param {string} orderParams.clientCode - Client code
 * @param {string} orderParams.symbol - Trading symbol
 * @param {string} orderParams.side - Order side (BUY/SELL)
 * @param {string} orderParams.orderType - Order type (MKT, SHS, etc.)
 * @param {string} orderParams.marketType - Market type (REG, FUT)
 * @param {number} orderParams.volume - Order volume
 * @param {number} orderParams.price - Order price (optional, defaults to 0 for market orders)
 * @param {number} orderParams.triggerPrice - Trigger price (0 if not applicable)
 * @param {number|string} orderParams.orderProperty - Order property (111 for regular, 'SHS' for short sell, etc.)
 */
function placeOrder(orderParams) {
    const {
        clientCode,
        symbol,
        side,
        orderType,
        marketType,
        volume,
        price,
        triggerPrice,
        orderProperty
    } = orderParams;
    
    if (!isConnected) {
        logToOrderFile('❌ WebSocket is not connected. Cannot place order.');
        return false;
    }
    
    const payload = {
        clientCode: authHeaders.id,
        symbol: symbol,
        side: side,
        refNo: 0,
        price: price !== undefined ? parseFloat(price) : 0, // Use provided price or default to 0 for market orders
        volume: parseInt(volume),
        triggerPrice: triggerPrice ? parseFloat(triggerPrice) : 0,
        orderType: orderType,
        marketType: marketType,
        userId: authHeaders.id, // Using the auth ID as userId
        actionType: "neworder",
        orignateSource: "W",
        discVolume: 0,
        orderProperty: orderProperty !== undefined ? orderProperty : 111, // Use provided orderProperty or default to 111
        subClientCode: ""
    };
    
    logToOrderFile('┌' + '─'.repeat(78) + '┐');
    logToOrderFile('│ 📤 PLACING ORDER:');
    logToOrderFile('├' + '─'.repeat(78) + '┤');
    logToOrderFile('│ Symbol: ' + symbol);
    logToOrderFile('│ Side: ' + side);
    logToOrderFile('│ Type: ' + orderType + ' / ' + marketType);
    logToOrderFile('│ Volume: ' + volume);
    logToOrderFile('│ Price: ' + payload.price);
    logToOrderFile('│ Order Property: ' + payload.orderProperty);
    logToOrderFile('├' + '─'.repeat(78) + '┤');
    logToOrderFile('│ Full payload:');
    logToOrderFile(JSON.stringify(payload, null, 2));
    logToOrderFile('└' + '─'.repeat(78) + '┘');
    logToOrderFile('');

    try {
        const destination = `/app/order-service.${JSON.stringify(payload)}`;
        logToOrderFile('📍 Destination: ' + destination);
        logToOrderFile('');
        
        stompClient.send(destination, {}, JSON.stringify(payload));
        logToOrderFile('✅ Order sent successfully');
        logToOrderFile('⏳ Waiting for server response...');
        logToOrderFile('');
        return true;
    } catch (error) {
        logToOrderFile('❌ Error sending order: ' + error.toString());
        logToOrderFile('');
        return false;
    }
}

/**
 * Check if order WebSocket is connected
 */
function isOrderConnectionReady() {
    return isConnected;
}

/**
 * Disconnect the order WebSocket
 */
function disconnectOrderConnection() {
    if (isConnected && stompClient) {
        logToOrderFile('🛑 Disconnecting Order WebSocket...');
        stompClient.disconnect();
        isConnected = false;
        logToOrderFile('✅ Order WebSocket disconnected');
    }
}

// Export the functions for use in other modules
module.exports = {
    initializeOrderConnection,
    placeOrder,
    isOrderConnectionReady,
    disconnectOrderConnection
};
