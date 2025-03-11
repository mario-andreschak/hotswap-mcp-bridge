#!/usr/bin/env node
/**
 * MCP Bridge Demo Workflow
 * 
 * This script demonstrates the complete workflow with:
 * - Starting the bridge
 * - Registering Server C
 * - Client B connecting to Server C via the bridge
 * - Client A connecting and updating environment variables
 * - Server C being restarted with the new environment
 * 
 * Usage:
 *   node demo-workflow.js [--port <port>] [--host <host>]
 */
import { spawn } from 'node:child_process';
import { createApp } from '../dist/index.js';
import { randomUUID } from 'node:crypto';

// Parse command line arguments
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? parseInt(args[portIndex + 1], 10) : 3000;
const hostIndex = args.indexOf('--host');
const host = hostIndex >= 0 ? args[hostIndex + 1] : 'localhost';

// Generate IDs
const serverId = randomUUID();
const clientAId = randomUUID();
const clientBId = randomUUID();

// Create the app
const app = createApp({
  port,
  host,
  logLevel: 'info'
});

// Store child processes
const processes = [];

// Main function
async function main() {
  try {
    console.log('=== MCP Bridge Demo Workflow ===');
    console.log(`Bridge URL: http://${host}:${port}`);
    console.log(`Server ID: ${serverId}`);
    console.log(`Client A ID: ${clientAId}`);
    console.log(`Client B ID: ${clientBId}`);
    console.log('===============================');
    
    // Start the bridge
    console.log('\n1. Starting the bridge...');
    await app.start();
    console.log('Bridge started successfully');
    
    // Register Server C
    console.log('\n2. Registering Server C...');
    const serverResponse = await fetch(`http://${host}:${port}/api/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: serverId,
        name: 'Server C',
        command: 'node',
        args: ['examples/echo-server.js'],
        transport: 'stdio',
        autoRestart: true,
        env: {
          INITIAL_ENV: 'true'
        }
      })
    });
    
    if (!serverResponse.ok) {
      const error = await serverResponse.json();
      throw new Error(`Failed to register server: ${error.error?.message || serverResponse.statusText}`);
    }
    
    const serverData = await serverResponse.json();
    console.log(`Server registered: ${serverData.id}`);
    
    // Start Server C
    console.log('\n3. Starting Server C...');
    const startResponse = await fetch(`http://${host}:${port}/api/servers/${serverId}/start`, {
      method: 'POST'
    });
    
    if (!startResponse.ok) {
      const error = await startResponse.json();
      throw new Error(`Failed to start server: ${error.error?.message || startResponse.statusText}`);
    }
    
    console.log('Server started successfully');
    
    // Scenario 1: Client B connects first
    console.log('\n=== Scenario 1: Client B connects first ===');
    
    // Start Client B
    console.log('\n4. Starting Client B (connecting to Server C via bridge-launcher)...');
    const clientBProcess = spawn('node', [
      'examples/bridge-launcher.js',
      '--server-id', serverId,
      '--port', port.toString(),
      '--host', host
    ], {
      stdio: 'pipe',
      detached: false
    });
    
    processes.push(clientBProcess);
    
    clientBProcess.stdout.on('data', (data) => {
      console.log(`[Client B stdout] ${data.toString().trim()}`);
    });
    
    clientBProcess.stderr.on('data', (data) => {
      console.log(`[Client B stderr] ${data.toString().trim()}`);
    });
    
    // Wait for Client B to connect
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start Client A
    console.log('\n5. Starting Client A (updating environment variables)...');
    const clientAProcess = spawn('node', [
      'examples/client-a.js',
      '--server-id', serverId,
      '--port', port.toString(),
      '--host', host
    ], {
      stdio: 'pipe',
      detached: false
    });
    
    processes.push(clientAProcess);
    
    clientAProcess.stdout.on('data', (data) => {
      console.log(`[Client A stdout] ${data.toString().trim()}`);
    });
    
    clientAProcess.stderr.on('data', (data) => {
      console.log(`[Client A stderr] ${data.toString().trim()}`);
    });
    
    // Wait for Client A to connect and update environment
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get server details to verify environment variables
    console.log('\n6. Verifying server environment variables...');
    const serverDetailsResponse = await fetch(`http://${host}:${port}/api/servers/${serverId}`);
    const serverDetails = await serverDetailsResponse.json();
    
    console.log('Server environment variables:');
    console.log(serverDetails.config.env);
    
    // Keep the demo running for a while
    console.log('\nDemo is running. Press Ctrl+C to stop.');
    
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
  console.log('\nCleaning up...');
  
  // Kill all child processes
  for (const proc of processes) {
    if (!proc.killed) {
      proc.kill();
    }
  }
  
  try {
    // Stop the server
    await fetch(`http://${host}:${port}/api/servers/${serverId}/stop`, {
      method: 'POST'
    });
    console.log('Server stopped');
    
    // Stop the bridge
    await app.stop();
    console.log('Bridge stopped');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
  
  // Exit process
  process.exit(0);
}

// Start the application
main().catch(error => {
  console.error('Unhandled error:', error);
  cleanup().then(() => process.exit(1));
});
