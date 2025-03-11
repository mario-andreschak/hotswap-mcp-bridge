#!/usr/bin/env node
/**
 * MCP Client A Example
 * 
 * This script demonstrates how Client A can connect to the bridge and update environment variables.
 * 
 * Usage:
 *   node client-a.js --server-id <server-id> [--port <port>] [--host <host>]
 */
import { createApp } from '../dist/index.js';
import { randomUUID } from 'node:crypto';

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

// Main function
async function main() {
  try {
    console.log(`Connecting to bridge at http://${host}:${port}`);
    
    // First, update the environment variables for the server
    console.log(`Updating environment variables for server ${serverId}...`);
    
    const envResponse = await fetch(`http://${host}:${port}/api/servers/${serverId}/environment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        CLIENT_A_CONNECTED: 'true',
        CLIENT_A_CONNECTION_TIME: new Date().toISOString(),
        CLIENT_A_ID: connectionId,
        // Add any other environment variables needed by the server
        CUSTOM_VAR1: 'value1',
        CUSTOM_VAR2: 'value2'
      })
    });
    
    if (!envResponse.ok) {
      const error = await envResponse.json();
      throw new Error(`Failed to update environment variables: ${error.error?.message || envResponse.statusText}`);
    }
    
    const envData = await envResponse.json();
    console.log(`Environment variables updated for server ${serverId}`);
    console.log('Server environment:', envData.env);
    
    // Now connect to the server using SSE
    console.log(`Connecting to server ${serverId} using SSE...`);
    
    const connectionResponse = await fetch(`http://${host}:${port}/api/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: connectionId,
        name: 'Client A Connection',
        serverId: serverId,
        transport: 'sse'
      })
    });
    
    if (!connectionResponse.ok) {
      const error = await connectionResponse.json();
      throw new Error(`Failed to connect to server: ${error.error?.message || connectionResponse.statusText}`);
    }
    
    const connectionData = await connectionResponse.json();
    console.log(`Connected to server: ${connectionData.id}`);
    
    // Keep the connection open for a while
    console.log('Connection established. Press Ctrl+C to disconnect.');
    
    // Handle process signals
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
  } catch (error) {
    console.error('Error:', error);
    await cleanup();
    process.exit(1);
  }
}

// Cleanup function
async function cleanup() {
  try {
    // Disconnect from the server
    console.log(`Disconnecting from server ${serverId}...`);
    
    const response = await fetch(`http://${host}:${port}/api/connections/${connectionId}/disconnect`, {
      method: 'POST'
    });
    
    if (response.ok) {
      console.log('Disconnected from server');
    } else {
      const error = await response.json();
      console.error(`Failed to disconnect: ${error.error?.message || response.statusText}`);
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
  
  // Exit process
  process.exit(0);
}

// Start the application
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
