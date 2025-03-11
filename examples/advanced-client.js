#!/usr/bin/env node
/**
 * MCP Advanced Client Example
 * 
 * This example demonstrates advanced client features including:
 * - Setting roots
 * - Handling sampling requests
 * - Error handling
 * - Progress reporting
 * - Working with multiple servers
 * 
 * Usage:
 *   node advanced-client.js [--server <server-command>]
 */
import { Client } from '../mcp-protocol/src/client/index.js';
import { StdioClientTransport } from '../mcp-protocol/src/client/stdio.js';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// Parse command line arguments
const args = process.argv.slice(2);
const serverCmdIndex = args.indexOf('--server');
const serverCmd = serverCmdIndex >= 0 ? args[serverCmdIndex + 1] : 'node examples/tool-server.js';

// Split the server command into command and arguments
const [command, ...serverArgs] = serverCmd.split(' ');

// Create a readline interface for user input
const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

// Prompt for user input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Main function
async function main() {
  console.log('=== MCP Advanced Client Example ===');
  console.log(`Starting server: ${serverCmd}`);
  
  try {
    // Create a client
    const client = new Client(
      {
        name: 'advanced-client',
        version: '1.0.0'
      },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: {}
        }
      }
    );
    
    // Set up sampling handler
    client.setSamplingHandler(async (request) => {
      console.log('\n=== Sampling Request ===');
      console.log('Messages:');
      for (const message of request.messages) {
        console.log(`- ${message.role}: ${message.content.text}`);
      }
      
      console.log('\nSystem Prompt:', request.systemPrompt || '(none)');
      console.log('Max Tokens:', request.maxTokens || 'unlimited');
      
      // In a real application, this would send the request to an LLM
      // For this example, we'll simulate a response
      const userApproval = await prompt('\nApprove this sampling request? (y/n): ');
      
      if (userApproval.toLowerCase() !== 'y') {
        throw new Error('Sampling request rejected by user');
      }
      
      console.log('Generating response...');
      
      // Simulate LLM processing time
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        model: 'simulated-model-v1',
        role: 'assistant',
        content: {
          type: 'text',
          text: `This is a simulated response to the sampling request.\nThe request had ${request.messages.length} messages and ${request.systemPrompt ? 'included' : 'did not include'} a system prompt.`
        }
      };
    });
    
    // Set roots for the client
    client.setRoots([
      {
        uri: 'file:///examples',
        name: 'Examples Directory'
      },
      {
        uri: 'https://api.example.com',
        name: 'Example API'
      }
    ]);
    
    // Create and spawn the server process
    const serverProcess = spawn(command, serverArgs, {
      stdio: ['pipe', 'pipe', process.stderr]
    });
    
    // Create a transport connected to the server
    const transport = new StdioClientTransport({
      input: serverProcess.stdout,
      output: serverProcess.stdin
    });
    
    // Connect to the server
    console.log('Connecting to server...');
    await client.connect(transport);
    console.log('Connected to server');
    
    // Get server info
    const serverInfo = await client.getServerInfo();
    console.log('\n=== Server Info ===');
    console.log(`Name: ${serverInfo.name}`);
    console.log(`Version: ${serverInfo.version}`);
    console.log(`Protocol Version: ${serverInfo.protocolVersion}`);
    
    // List available tools
    console.log('\n=== Available Tools ===');
    const tools = await client.listTools();
    for (const tool of tools.tools) {
      console.log(`- ${tool.name}: ${tool.description || '(no description)'}`);
    }
    
    // List available resources
    console.log('\n=== Available Resources ===');
    const resources = await client.listResources();
    for (const resource of resources.resources) {
      console.log(`- ${resource.name}: ${resource.uri}`);
    }
    
    // List available prompts
    console.log('\n=== Available Prompts ===');
    const prompts = await client.listPrompts();
    for (const prompt of prompts.prompts) {
      console.log(`- ${prompt.name}: ${prompt.description || '(no description)'}`);
    }
    
    // Interactive mode
    console.log('\n=== Interactive Mode ===');
    console.log('Enter commands to interact with the server (type "exit" to quit):');
    console.log('- tool <name> <args>: Call a tool');
    console.log('- resource <uri>: Read a resource');
    console.log('- prompt <name> <args>: Get a prompt');
    console.log('- roots: Show current roots');
    console.log('- exit: Exit the client');
    
    let running = true;
    while (running) {
      const input = await prompt('\n> ');
      const [command, ...args] = input.trim().split(' ');
      
      try {
        switch (command.toLowerCase()) {
          case 'exit':
            running = false;
            break;
            
          case 'tool': {
            if (args.length < 1) {
              console.log('Usage: tool <name> [args as JSON]');
              break;
            }
            
            const toolName = args[0];
            let toolArgs = {};
            
            if (args.length > 1) {
              try {
                // Join the remaining args and parse as JSON
                toolArgs = JSON.parse(args.slice(1).join(' '));
              } catch (e) {
                console.log('Error parsing tool arguments. Please provide valid JSON.');
                break;
              }
            }
            
            console.log(`Calling tool: ${toolName}`);
            console.log('Arguments:', toolArgs);
            
            const result = await client.callTool({
              name: toolName,
              arguments: toolArgs
            });
            
            console.log('\nTool Result:');
            for (const content of result.content) {
              if (content.type === 'text') {
                console.log(content.text);
              } else if (content.type === 'image') {
                console.log(`[Image: ${content.mimeType}]`);
              } else if (content.type === 'resource') {
                console.log(`[Resource: ${content.resource.uri}]`);
              }
            }
            break;
          }
            
          case 'resource': {
            if (args.length < 1) {
              console.log('Usage: resource <uri>');
              break;
            }
            
            const uri = args[0];
            console.log(`Reading resource: ${uri}`);
            
            const resource = await client.readResource(uri);
            
            console.log('\nResource Content:');
            for (const content of resource.contents) {
              if (content.text) {
                console.log(content.text);
              } else if (content.blob) {
                console.log(`[Binary data: ${content.mimeType}]`);
              }
            }
            break;
          }
            
          case 'prompt': {
            if (args.length < 1) {
              console.log('Usage: prompt <name> [args as JSON]');
              break;
            }
            
            const promptName = args[0];
            let promptArgs = {};
            
            if (args.length > 1) {
              try {
                // Join the remaining args and parse as JSON
                promptArgs = JSON.parse(args.slice(1).join(' '));
              } catch (e) {
                console.log('Error parsing prompt arguments. Please provide valid JSON.');
                break;
              }
            }
            
            console.log(`Getting prompt: ${promptName}`);
            console.log('Arguments:', promptArgs);
            
            const prompt = await client.getPrompt(promptName, promptArgs);
            
            console.log('\nPrompt Messages:');
            for (const message of prompt.messages) {
              console.log(`\n[${message.role}]:`);
              if (message.content.type === 'text') {
                console.log(message.content.text);
              } else if (message.content.type === 'resource') {
                console.log(`[Resource: ${message.content.resource.uri}]`);
              }
            }
            break;
          }
            
          case 'roots': {
            console.log('\nCurrent Roots:');
            const roots = client.getRoots();
            for (const root of roots) {
              console.log(`- ${root.name}: ${root.uri}`);
            }
            break;
          }
            
          case '':
            // Ignore empty commands
            break;
            
          default:
            console.log(`Unknown command: ${command}`);
            break;
        }
      } catch (error) {
        console.error(`Error: ${error.message}`);
        if (error.code) {
          console.error(`Error code: ${error.code}`);
        }
        if (error.data) {
          console.error('Additional data:', error.data);
        }
      }
    }
    
    // Clean up
    console.log('\nClosing connection...');
    await client.close();
    
    // Kill the server process
    serverProcess.kill();
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close the readline interface
    rl.close();
  }
}

// Start the application
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
