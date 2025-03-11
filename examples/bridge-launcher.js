#!/usr/bin/env node
/**
 * MCP Bridge Launcher
 * 
 * This script acts as a proxy between Client B and Server C.
 * It launches the bridge and configures it to connect to the specified server.
 * 
 * Usage:
 *   node bridge-launcher.js --server-id <server-id> [--port <port>] [--host <host>]
 */
import { spawn } from 'node:child_process';
import { createApp } from '../dist/index.js';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

// Parse command line arguments
const args = process.argv.slice(2);
const serverIdIndex = args.indexOf('--server-id');
const serverId = serverIdIndex >= 0 ? args[serverIdIndex + 1] : null;
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? parseInt(args[portIndex + 1], 10) : 3000;
const hostIndex = args.indexOf('--host');
const host = hostIndex >= 0 ? args[hostIndex + 1] : 'localhost';

// Validate arguments
if (!serverId) {
  console.error('Server ID must be provided with --server-id');
  process.exit(1);
}

// Create a unique connection ID
const connectionId = randomUUID();

// Create readline interface for stdio
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Start the bridge
const app = createApp({
  port,
  host,
  logLevel: 'info'
});

// Main function
async function main() {
  try {
    // Start the bridge
    await app.start();
    console.error(`Bridge started on http://${host}:${port}`);
    
    // Create a connection to the server
    const response = await fetch(`http://${host}:${port}/api/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: connectionId,
        name: 'Bridge Launcher Connection',
        serverId: serverId,
        transport: 'stdio'
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to connect to server: ${error.error?.message || response.statusText}`);
    }
    
    const connectionData = await response.json();
    console.error(`Connected to server: ${connectionData.id}`);
    
    // Set up stdio forwarding
    rl.on('line', async (line) => {
      try {
        // Forward stdin to the bridge
        await fetch(`http://${host}:${port}/api/connections/${connectionId}/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: line
        });
      } catch (error) {
        console.error('Failed to forward message:', error);
      }
    });
    
    // Handle process signals
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
    
  } catch (error) {
    console.error('Failed to start bridge or connect to server:', error);
    await cleanup();
    process.exit(1);
  }
}

// Cleanup function
async function cleanup() {
  try {
    // Disconnect from the server
    await fetch(`http://${host}:${port}/api/connections/${connectionId}/disconnect`, {
      method: 'POST'
    });
    console.error('Disconnected from server');
    
    // Stop the bridge
    await app.stop();
    console.error('Bridge stopped');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
  
  // Close readline interface
  rl.close();
  
  // Exit process
  process.exit(0);
}

// Start the application
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
