#!/usr/bin/env node
/**
 * MCP HTTP Server Example
 * 
 * This example demonstrates how to create an MCP server that uses HTTP with SSE transport
 * for server-to-client communication and HTTP POST for client-to-server communication.
 * 
 * Usage:
 *   node http-server.js [--port <port>]
 */
import { McpServer } from '../mcp-protocol/src/server/mcp.js';
import { createServer } from 'node:http';
import { z } from 'zod';
import { createInterface } from 'node:readline';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

// Parse command line arguments
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? parseInt(args[portIndex + 1], 10) : 3001;

// Create a readline interface for user input
const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

// Create an Express app
const app = express();

// Configure middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.text());

// Create an HTTP server
const httpServer = createServer(app);

// Create a simple HTML client for testing
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MCP HTTP Client</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 {
          color: #333;
        }
        .container {
          display: flex;
          gap: 20px;
        }
        .panel {
          flex: 1;
          border: 1px solid #ccc;
          border-radius: 5px;
          padding: 15px;
        }
        .log {
          background-color: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 3px;
          padding: 10px;
          height: 300px;
          overflow-y: auto;
          font-family: monospace;
          margin-bottom: 10px;
        }
        .controls {
          margin-top: 15px;
        }
        button {
          background-color: #4CAF50;
          color: white;
          border: none;
          padding: 8px 16px;
          text-align: center;
          text-decoration: none;
          display: inline-block;
          font-size: 14px;
          margin: 4px 2px;
          cursor: pointer;
          border-radius: 4px;
        }
        input, select, textarea {
          width: 100%;
          padding: 8px;
          margin: 5px 0;
          box-sizing: border-box;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <h1>MCP HTTP Client</h1>
      <div class="container">
        <div class="panel">
          <h2>Server Connection</h2>
          <div class="log" id="connectionLog"></div>
          <div class="controls">
            <button id="connectBtn">Connect</button>
            <button id="disconnectBtn" disabled>Disconnect</button>
          </div>
        </div>
        <div class="panel">
          <h2>Tool Execution</h2>
          <div class="log" id="toolLog"></div>
          <div class="controls">
            <select id="toolSelect">
              <option value="echo">Echo Tool</option>
              <option value="timestamp">Timestamp Tool</option>
              <option value="random">Random Number Tool</option>
            </select>
            <textarea id="toolArgs" rows="4" placeholder='{"message": "Hello, world!"}'></textarea>
            <button id="executeBtn" disabled>Execute Tool</button>
          </div>
        </div>
      </div>
      
      <script>
        // Client state
        let eventSource = null;
        let connected = false;
        let serverUrl = window.location.origin;
        let clientId = 'browser-client-' + Math.random().toString(36).substring(2, 15);
        
        // DOM elements
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        const executeBtn = document.getElementById('executeBtn');
        const toolSelect = document.getElementById('toolSelect');
        const toolArgs = document.getElementById('toolArgs');
        const connectionLog = document.getElementById('connectionLog');
        const toolLog = document.getElementById('toolLog');
        
        // Log functions
        function logConnection(message) {
          const entry = document.createElement('div');
          entry.textContent = new Date().toLocaleTimeString() + ': ' + message;
          connectionLog.appendChild(entry);
          connectionLog.scrollTop = connectionLog.scrollHeight;
        }
        
        function logTool(message) {
          const entry = document.createElement('div');
          entry.textContent = new Date().toLocaleTimeString() + ': ' + message;
          toolLog.appendChild(entry);
          toolLog.scrollTop = toolLog.scrollHeight;
        }
        
        // Initialize default tool arguments
        toolArgs.value = JSON.stringify({ message: "Hello, world!" }, null, 2);
        
        // Update tool arguments based on selected tool
        toolSelect.addEventListener('change', () => {
          switch (toolSelect.value) {
            case 'echo':
              toolArgs.value = JSON.stringify({ message: "Hello, world!" }, null, 2);
              break;
            case 'timestamp':
              toolArgs.value = JSON.stringify({ format: "iso" }, null, 2);
              break;
            case 'random':
              toolArgs.value = JSON.stringify({ min: 1, max: 100 }, null, 2);
              break;
          }
        });
        
        // Connect button handler
        connectBtn.addEventListener('click', async () => {
          if (connected) return;
          
          try {
            logConnection('Connecting to server...');
            
            // Initialize connection
            const initResponse = await fetch(serverUrl + '/initialize', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                id: clientId,
                name: 'Browser Client',
                version: '1.0.0',
                protocolVersion: '0.1.0',
                capabilities: {
                  tools: {},
                  resources: {},
                  prompts: {}
                }
              })
            });
            
            if (!initResponse.ok) {
              throw new Error('Failed to initialize connection: ' + initResponse.statusText);
            }
            
            const initData = await initResponse.json();
            logConnection('Connection initialized: ' + JSON.stringify(initData));
            
            // Send initialized notification
            await fetch(serverUrl + '/initialized', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-MCP-Client-ID': clientId
              },
              body: JSON.stringify({})
            });
            
            // Set up SSE connection
            eventSource = new EventSource(serverUrl + '/events/' + clientId);
            
            eventSource.onopen = () => {
              logConnection('SSE connection established');
              connected = true;
              connectBtn.disabled = true;
              disconnectBtn.disabled = false;
              executeBtn.disabled = false;
            };
            
            eventSource.onmessage = (event) => {
              const data = JSON.parse(event.data);
              logConnection('Received message: ' + JSON.stringify(data));
            };
            
            eventSource.onerror = (error) => {
              logConnection('SSE error: ' + JSON.stringify(error));
              disconnect();
            };
            
          } catch (error) {
            logConnection('Error: ' + error.message);
            disconnect();
          }
        });
        
        // Disconnect button handler
        disconnectBtn.addEventListener('click', () => {
          disconnect();
        });
        
        // Execute tool button handler
        executeBtn.addEventListener('click', async () => {
          if (!connected) return;
          
          try {
            const toolName = toolSelect.value;
            let toolArguments;
            
            try {
              toolArguments = JSON.parse(toolArgs.value);
            } catch (e) {
              logTool('Error parsing arguments: ' + e.message);
              return;
            }
            
            logTool('Executing tool: ' + toolName);
            logTool('Arguments: ' + JSON.stringify(toolArguments));
            
            const response = await fetch(serverUrl + '/call-tool', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-MCP-Client-ID': clientId
              },
              body: JSON.stringify({
                name: toolName,
                arguments: toolArguments
              })
            });
            
            if (!response.ok) {
              throw new Error('Failed to execute tool: ' + response.statusText);
            }
            
            const result = await response.json();
            logTool('Tool result: ' + JSON.stringify(result));
            
          } catch (error) {
            logTool('Error: ' + error.message);
          }
        });
        
        // Disconnect function
        function disconnect() {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          
          if (connected) {
            fetch(serverUrl + '/disconnect', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-MCP-Client-ID': clientId
              }
            }).catch(error => {
              logConnection('Error during disconnect: ' + error.message);
            });
          }
          
          connected = false;
          connectBtn.disabled = false;
          disconnectBtn.disabled = true;
          executeBtn.disabled = true;
          logConnection('Disconnected from server');
        }
        
        // Handle page unload
        window.addEventListener('beforeunload', () => {
          disconnect();
        });
      </script>
    </body>
    </html>
  `);
});

// Create an MCP server
const server = new McpServer({
  name: 'http-server-example',
  version: '1.0.0'
});

// Store connected clients
const clients = new Map();

// Register an echo tool
server.tool(
  'echo',
  'Echo back the input message',
  {
    message: z.string().describe('Message to echo')
  },
  async ({ message }) => {
    console.log(`Echo tool called with message: ${message}`);
    
    return {
      content: [
        {
          type: 'text',
          text: `Echo: ${message}`
        }
      ]
    };
  }
);

// Register a timestamp tool
server.tool(
  'timestamp',
  'Get the current timestamp in various formats',
  {
    format: z.enum(['iso', 'unix', 'locale']).describe('Timestamp format')
  },
  async ({ format }) => {
    console.log(`Timestamp tool called with format: ${format}`);
    
    const now = new Date();
    let timestamp;
    
    switch (format) {
      case 'iso':
        timestamp = now.toISOString();
        break;
      case 'unix':
        timestamp = Math.floor(now.getTime() / 1000);
        break;
      case 'locale':
        timestamp = now.toLocaleString();
        break;
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `Current timestamp (${format}): ${timestamp}`
        }
      ]
    };
  }
);

// Register a random number generator tool
server.tool(
  'random',
  'Generate a random number within a range',
  {
    min: z.number().describe('Minimum value (inclusive)'),
    max: z.number().describe('Maximum value (inclusive)')
  },
  async ({ min, max }) => {
    console.log(`Random tool called with range: ${min}-${max}`);
    
    const randomValue = Math.floor(Math.random() * (max - min + 1)) + min;
    
    return {
      content: [
        {
          type: 'text',
          text: `Random number between ${min} and ${max}: ${randomValue}`
        }
      ]
    };
  }
);

// Set up API routes
app.post('/initialize', (req, res) => {
  const clientInfo = req.body;
  const clientId = clientInfo.id;
  
  console.log(`Client ${clientId} initializing connection`);
  
  // Store client information
  clients.set(clientId, {
    id: clientId,
    info: clientInfo,
    events: [],
    connected: false
  });
  
  // Send server information
  res.json({
    name: server.name,
    version: server.version,
    protocolVersion: '0.1.0',
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    }
  });
});

app.post('/initialized', (req, res) => {
  const clientId = req.headers['x-mcp-client-id'];
  
  if (!clientId || !clients.has(clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  
  console.log(`Client ${clientId} sent initialized notification`);
  
  // Mark client as connected
  const client = clients.get(clientId);
  client.connected = true;
  
  res.status(204).end();
});

app.get('/events/:clientId', (req, res) => {
  const clientId = req.params.clientId;
  
  if (!clientId || !clients.has(clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  
  console.log(`Client ${clientId} connected to SSE endpoint`);
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send initial message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  
  // Store the response object for sending events
  const client = clients.get(clientId);
  client.res = res;
  
  // Handle client disconnect
  req.on('close', () => {
    console.log(`Client ${clientId} SSE connection closed`);
    if (clients.has(clientId)) {
      const client = clients.get(clientId);
      client.res = null;
    }
  });
});

app.post('/call-tool', async (req, res) => {
  const clientId = req.headers['x-mcp-client-id'];
  
  if (!clientId || !clients.has(clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  
  const { name, arguments: args } = req.body;
  
  console.log(`Client ${clientId} calling tool: ${name}`);
  
  try {
    // Call the tool
    const result = await server.callTool(name, args);
    
    // Send the result
    res.json(result);
  } catch (error) {
    console.error(`Error calling tool ${name}:`, error);
    res.status(500).json({
      error: {
        message: error.message,
        code: error.code
      }
    });
  }
});

app.post('/disconnect', (req, res) => {
  const clientId = req.headers['x-mcp-client-id'];
  
  if (!clientId || !clients.has(clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  
  console.log(`Client ${clientId} disconnecting`);
  
  // Clean up client resources
  const client = clients.get(clientId);
  if (client.res) {
    client.res.end();
  }
  
  clients.delete(clientId);
  
  res.status(204).end();
});

// Start the server
httpServer.listen(port, () => {
  console.log(`MCP HTTP Server running at http://localhost:${port}`);
  console.log('Open this URL in a browser to test the server');
  console.log('\nPress Ctrl+C to stop the server');
});

// Handle process signals
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down server...');
  httpServer.close();
  process.exit(0);
});
