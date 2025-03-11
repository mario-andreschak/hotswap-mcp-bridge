/**
 * Simple MCP Transport Bridge Example
 * 
 * This example demonstrates how to:
 * 1. Start the bridge
 * 2. Register a server
 * 3. Start the server
 * 4. Connect to the server
 */
import { createApp } from '../dist/index.js';

// Create the app
const app = createApp({
  port: 3000,
  host: 'localhost'
});

// Start the app
await app.start();

console.log('MCP Transport Bridge started on http://localhost:3000');
console.log('');
console.log('Example API calls:');
console.log('');

// Example: Register a server
console.log('# Register a server');
console.log('curl -X POST http://localhost:3000/api/servers \\');
console.log('  -H "Content-Type: application/json" \\');
console.log('  -d \'{"name":"Example Server","command":"node","args":["server.js"],"transport":"stdio"}\'');
console.log('');

// Example: Start a server
console.log('# Start a server (replace SERVER_ID with the actual ID)');
console.log('curl -X POST http://localhost:3000/api/servers/SERVER_ID/start');
console.log('');

// Example: Connect to a server
console.log('# Connect to a server (replace SERVER_ID with the actual ID)');
console.log('curl -X POST http://localhost:3000/api/connections \\');
console.log('  -H "Content-Type: application/json" \\');
console.log('  -d \'{"serverId":"SERVER_ID","transport":"sse"}\'');
console.log('');

// Example: List servers
console.log('# List all servers');
console.log('curl http://localhost:3000/api/servers');
console.log('');

// Example: List connections
console.log('# List all connections');
console.log('curl http://localhost:3000/api/connections');
console.log('');

// Handle process signals
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await app.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await app.stop();
  process.exit(0);
});
