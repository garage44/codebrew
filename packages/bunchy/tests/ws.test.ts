import WebSocket from 'ws'

console.log('Attempting to connect to ws://localhost:3030/bunchy...')

const ws = new WebSocket('ws://localhost:3030/bunchy')

ws.on('open', function open() {
    console.log('✅ Bunchy WebSocket connection established!')

    // Send a test message
    const testMessage = {
        data: 'Hello from bunchy test client',
        type: 'bunchy-test',
    }
    console.log('Sending test message:', testMessage)
    ws.send(JSON.stringify(testMessage))
})

ws.on('message', function message(data: WebSocket.Data) {
    console.log('📨 Received message:', data.toString())
})

ws.on('error', function error(err: Error) {
    console.error('❌ Bunchy WebSocket error:', err.message)
})

ws.on('close', function close(code: number, reason: Buffer) {
    console.log('🔌 Bunchy WebSocket connection closed:', code, reason)
})

// Close after 5 seconds
setTimeout(() => {
    console.log('Closing bunchy connection...')
    ws.close()
    process.exit(0)
}, 5000)
