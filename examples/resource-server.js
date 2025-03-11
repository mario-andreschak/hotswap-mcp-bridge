#!/usr/bin/env node
/**
 * MCP Resource Server Example
 * 
 * This example demonstrates how to create an MCP server that provides various resources
 * with different content types and URI templates.
 */
import { McpServer } from '../mcp-protocol/src/server/mcp.js';
import { StdioServerTransport } from '../mcp-protocol/src/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a server
const server = new McpServer({
  name: 'resource-server',
  version: '1.0.0'
});

// Register a static text resource
server.resource(
  'resource://static/greeting',
  'Greeting Message',
  'A simple greeting message',
  'text/plain',
  async () => {
    return 'Hello from the MCP Resource Server!';
  }
);

// Register a JSON resource
server.resource(
  'resource://static/config',
  'Configuration',
  'Server configuration in JSON format',
  'application/json',
  async () => {
    const config = {
      server: {
        name: 'resource-server',
        version: '1.0.0',
        startTime: new Date().toISOString()
      },
      resources: [
        'greeting',
        'config',
        'system-info',
        'file-contents',
        'user-data'
      ],
      features: {
        dynamicResources: true,
        templateResources: true,
        binaryResources: true
      }
    };
    
    return JSON.stringify(config, null, 2);
  }
);

// Register a dynamic resource that changes on each request
server.resource(
  'resource://dynamic/system-info',
  'System Information',
  'Current system information including memory usage and uptime',
  'application/json',
  async () => {
    const systemInfo = {
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version
      },
      env: {
        nodeEnv: process.env.NODE_ENV || 'development'
      }
    };
    
    return JSON.stringify(systemInfo, null, 2);
  }
);

// Register a resource template for file contents
server.resourceTemplate(
  'file://{path}',
  'File Contents',
  'Contents of a file on the server filesystem',
  async (uri) => {
    try {
      // Extract the path from the URI
      // Remove the 'file://' prefix and parse the remaining path
      const filePath = uri.replace('file://', '');
      
      // For security, restrict access to the examples directory
      const fullPath = path.join(__dirname, filePath);
      
      // Check if the path is within the examples directory
      const relativePath = path.relative(__dirname, fullPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('Access denied: Cannot access files outside the examples directory');
      }
      
      // Read the file
      const content = await fs.readFile(fullPath, 'utf-8');
      
      // Determine MIME type based on file extension
      const ext = path.extname(filePath).toLowerCase();
      let mimeType = 'text/plain';
      
      switch (ext) {
        case '.json': mimeType = 'application/json'; break;
        case '.js': mimeType = 'application/javascript'; break;
        case '.html': mimeType = 'text/html'; break;
        case '.css': mimeType = 'text/css'; break;
        case '.md': mimeType = 'text/markdown'; break;
        // Add more MIME types as needed
      }
      
      return {
        content,
        mimeType
      };
    } catch (error) {
      return {
        content: `Error: ${error.message}`,
        mimeType: 'text/plain'
      };
    }
  }
);

// Register a resource template with parameters
server.resourceTemplate(
  'user://{userId}/profile',
  'User Profile',
  'Profile information for a specific user',
  async (uri) => {
    try {
      // Extract the userId from the URI
      const match = uri.match(/user:\/\/([^/]+)\/profile/);
      if (!match) {
        throw new Error('Invalid user URI format');
      }
      
      const userId = match[1];
      
      // In a real application, you would fetch this from a database
      // Here we're just generating mock data
      const users = {
        'user1': {
          id: 'user1',
          name: 'Alice Johnson',
          email: 'alice@example.com',
          role: 'admin',
          joinDate: '2023-01-15'
        },
        'user2': {
          id: 'user2',
          name: 'Bob Smith',
          email: 'bob@example.com',
          role: 'user',
          joinDate: '2023-02-20'
        },
        'user3': {
          id: 'user3',
          name: 'Charlie Davis',
          email: 'charlie@example.com',
          role: 'user',
          joinDate: '2023-03-10'
        }
      };
      
      if (!users[userId]) {
        throw new Error(`User ${userId} not found`);
      }
      
      return {
        content: JSON.stringify(users[userId], null, 2),
        mimeType: 'application/json'
      };
    } catch (error) {
      return {
        content: `Error: ${error.message}`,
        mimeType: 'text/plain'
      };
    }
  }
);

// Register a binary resource (example: a simple SVG image)
server.resource(
  'resource://static/image',
  'Example Image',
  'A simple SVG image',
  'image/svg+xml',
  async () => {
    // Create a simple SVG circle
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <circle cx="50" cy="50" r="40" stroke="black" stroke-width="2" fill="blue" />
      </svg>
    `;
    
    return svg;
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);

console.error('Resource Server running...');
