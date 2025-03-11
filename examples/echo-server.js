#!/usr/bin/env node
/**
 * Simple Echo Server for MCP
 * 
 * This is a minimal MCP server that echoes back any messages it receives.
 * It also logs its environment variables on startup.
 */
import { McpServer } from '../mcp-protocol/src/server/mcp.js';
import { StdioServerTransport } from '../mcp-protocol/src/server/stdio.js';
import { z } from 'zod';

// Create a server
const server = new McpServer({
  name: 'echo-server',
  version: '1.0.0'
});

// Log environment variables on startup
console.error('Echo Server starting with environment variables:');
console.error(JSON.stringify(process.env, null, 2));

// Register an echo tool
server.tool(
  'echo',
  'Echo back the input message',
  {
    message: z.string().describe('Message to echo')
  },
  async ({ message }) => {
    console.error(`Received message: ${message}`);
    
    return {
      content: [
        {
          type: 'text',
          text: `Echo: ${message}\nEnvironment: ${JSON.stringify(process.env, null, 2)}`
        }
      ]
    };
  }
);

// Register a resource
server.resource(
  'echo://environment',
  'Environment Variables',
  'Current environment variables of the server',
  'application/json',
  async () => {
    return JSON.stringify(process.env, null, 2);
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);

console.error('Echo Server running...');
