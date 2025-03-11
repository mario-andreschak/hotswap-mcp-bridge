/**
 * Example of using the in-memory transport bridge
 */
import { createBridgeManager } from '../dist/bridge/manager.js';
import { createServerRegistry } from '../dist/bridge/registry.js';
import { createConnectionManager } from '../dist/bridge/connection.js';

// Create the server registry and connection manager
const serverRegistry = createServerRegistry();
const connectionManager = createConnectionManager();

// Create the bridge manager
const bridgeManager = createBridgeManager({
  serverRegistry,
  connectionManager
});

async function main() {
  try {
    console.log('Creating in-memory server...');
    
    // Register an in-memory server
    const serverId = serverRegistry.registerServer({
      name: 'Example In-Memory Server',
      version: '1.0.0',
      command: 'node',
      args: ['examples/echo-server.js'],
      transport: 'memory'
    }).id;
    
    console.log(`Server registered with ID: ${serverId}`);
    
    // Start the server
    await bridgeManager.startServer(serverId);
    console.log('Server started');
    
    // Connect to the server using in-memory transport
    const connectionId = await bridgeManager.connectToServer({
      name: 'Example In-Memory Connection',
      version: '1.0.0',
      serverId,
      transport: 'memory'
    });
    
    console.log(`Connected to server with connection ID: ${connectionId}`);
    
    // Wait for a moment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Disconnect
    await bridgeManager.disconnectConnection(connectionId);
    console.log('Disconnected from server');
    
    // Stop the server
    await bridgeManager.stopServer(serverId);
    console.log('Server stopped');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
