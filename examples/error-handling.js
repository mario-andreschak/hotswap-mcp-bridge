#!/usr/bin/env node
/**
 * MCP Error Handling Example
 * 
 * This example demonstrates best practices for error handling in MCP clients and servers,
 * including standard error codes, custom errors, and recovery strategies.
 */
import { Client } from '../mcp-protocol/src/client/index.js';
import { StdioClientTransport } from '../mcp-protocol/src/client/stdio.js';
import { McpServer } from '../mcp-protocol/src/server/mcp.js';
import { StdioServerTransport } from '../mcp-protocol/src/server/stdio.js';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { createInterface } from 'node:readline';
import { ErrorCode } from '../mcp-protocol/src/types.js';

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

// Create an error-prone server for demonstration
async function createErrorServer() {
  const server = new McpServer({
    name: 'error-demo-server',
    version: '1.0.0'
  });
  
  // Register a tool that can generate different types of errors
  server.tool(
    'errorGenerator',
    'Generate different types of errors for testing',
    {
      errorType: z.enum([
        'none',
        'validation',
        'not_found',
        'permission',
        'timeout',
        'server_error',
        'unexpected'
      ]).describe('Type of error to generate'),
      message: z.string().optional().describe('Custom error message')
    },
    async ({ errorType, message }) => {
      console.error(`Generating error of type: ${errorType}`);
      
      // Handle different error types
      switch (errorType) {
        case 'none':
          return {
            content: [
              {
                type: 'text',
                text: 'No error generated. Operation completed successfully.'
              }
            ]
          };
          
        case 'validation':
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: message || 'Validation error: Invalid input parameters'
              }
            ]
          };
          
        case 'not_found':
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: message || 'Resource not found: The requested item does not exist'
              }
            ]
          };
          
        case 'permission':
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: message || 'Permission denied: You do not have access to this resource'
              }
            ]
          };
          
        case 'timeout':
          // Simulate a long operation that times out
          await new Promise(resolve => setTimeout(resolve, 2000));
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: message || 'Operation timed out: The request took too long to complete'
              }
            ]
          };
          
        case 'server_error':
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: message || 'Internal server error: Something went wrong on the server'
              }
            ]
          };
          
        case 'unexpected':
          // Throw an actual error instead of returning an error response
          throw new Error(message || 'Unexpected error occurred');
      }
    }
  );
  
  // Register a resource that can generate errors
  server.resourceTemplate(
    'error://{type}/{id}',
    'Error Resource',
    'A resource that generates different types of errors',
    async (uri) => {
      console.error(`Accessing error resource: ${uri}`);
      
      // Parse the URI to extract error type and ID
      const match = uri.match(/error:\/\/([^/]+)\/([^/]+)/);
      if (!match) {
        throw new Error('Invalid error resource URI');
      }
      
      const errorType = match[1];
      const id = match[2];
      
      // Handle different error types
      switch (errorType) {
        case 'none':
          return {
            content: `Resource ID: ${id}\nNo error generated. Resource accessed successfully.`,
            mimeType: 'text/plain'
          };
          
        case 'not_found':
          throw new Error(`Resource not found: ID ${id} does not exist`);
          
        case 'permission':
          throw new Error(`Permission denied: You do not have access to resource ${id}`);
          
        case 'timeout':
          // Simulate a long operation that times out
          await new Promise(resolve => setTimeout(resolve, 2000));
          throw new Error(`Operation timed out: Resource ${id} took too long to access`);
          
        case 'server_error':
          throw new Error(`Internal server error: Failed to process resource ${id}`);
          
        default:
          throw new Error(`Unknown error type: ${errorType}`);
      }
    }
  );
  
  // Register a prompt that can generate errors
  server.prompt(
    'errorPrompt',
    'A prompt that can generate different types of errors',
    {
      errorType: z.enum([
        'none',
        'validation',
        'not_found',
        'permission',
        'timeout',
        'server_error'
      ]).describe('Type of error to generate'),
      message: z.string().optional().describe('Custom error message')
    },
    async ({ errorType, message }) => {
      console.error(`Generating prompt error of type: ${errorType}`);
      
      // Handle different error types
      switch (errorType) {
        case 'none':
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: 'Generate a successful response.'
                }
              },
              {
                role: 'assistant',
                content: {
                  type: 'text',
                  text: 'This is a successful prompt response with no errors.'
                }
              }
            ]
          };
          
        case 'validation':
          throw new Error(message || 'Validation error: Invalid prompt parameters');
          
        case 'not_found':
          throw new Error(message || 'Prompt template not found');
          
        case 'permission':
          throw new Error(message || 'Permission denied: You do not have access to this prompt');
          
        case 'timeout':
          // Simulate a long operation that times out
          await new Promise(resolve => setTimeout(resolve, 2000));
          throw new Error(message || 'Operation timed out: The prompt took too long to generate');
          
        case 'server_error':
          throw new Error(message || 'Internal server error: Failed to generate prompt');
      }
    }
  );
  
  return server;
}

// Main function
async function main() {
  console.log('=== MCP Error Handling Example ===');
  
  try {
    // Create and start the error server
    console.log('Starting error demonstration server...');
    const server = await createErrorServer();
    
    // Create a pair of connected stdio streams
    const { stdin: serverStdin, stdout: serverStdout } = {
      stdin: { write: data => clientTransport.receive(data) },
      stdout: { on: (event, callback) => {
        if (event === 'data') {
          serverTransport.onReceive = callback;
        }
      }}
    };
    
    // Set up transports
    const serverTransport = new StdioServerTransport({
      input: { on: (event, callback) => {
        if (event === 'data') {
          serverStdin.onReceive = callback;
        }
      }},
      output: serverStdout
    });
    
    const clientTransport = new StdioClientTransport({
      input: { on: (event, callback) => {
        if (event === 'data') {
          serverStdout.onReceive = callback;
        }
      }},
      output: serverStdin
    });
    
    // Connect the server
    await server.connect(serverTransport);
    console.log('Server started');
    
    // Create a client
    const client = new Client({
      name: 'error-handling-client',
      version: '1.0.0'
    });
    
    // Connect the client
    await client.connect(clientTransport);
    console.log('Client connected to server');
    
    // Interactive error testing
    console.log('\n=== Error Handling Demonstration ===');
    console.log('This example demonstrates how to handle different types of errors in MCP.');
    console.log('Enter commands to test different error scenarios (type "exit" to quit):');
    console.log('- tool <error-type> [message]: Test tool error handling');
    console.log('- resource <error-type> [id]: Test resource error handling');
    console.log('- prompt <error-type> [message]: Test prompt error handling');
    console.log('- exit: Exit the demo');
    console.log('\nAvailable error types:');
    console.log('- none: No error (successful operation)');
    console.log('- validation: Input validation error');
    console.log('- not_found: Resource not found error');
    console.log('- permission: Permission denied error');
    console.log('- timeout: Operation timeout error');
    console.log('- server_error: Internal server error');
    console.log('- unexpected: Unexpected error (for tools only)');
    
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
              console.log('Usage: tool <error-type> [message]');
              break;
            }
            
            const errorType = args[0];
            const message = args.slice(1).join(' ') || undefined;
            
            console.log(`Testing tool error handling: ${errorType}`);
            
            try {
              const result = await client.callTool({
                name: 'errorGenerator',
                arguments: {
                  errorType,
                  message
                }
              });
              
              console.log('\nTool Result:');
              for (const content of result.content) {
                if (content.type === 'text') {
                  console.log(content.text);
                }
              }
            } catch (error) {
              handleError(error);
            }
            break;
          }
            
          case 'resource': {
            if (args.length < 1) {
              console.log('Usage: resource <error-type> [id]');
              break;
            }
            
            const errorType = args[0];
            const id = args.length > 1 ? args[1] : 'test-id';
            
            console.log(`Testing resource error handling: ${errorType}`);
            
            try {
              const resource = await client.readResource(`error://${errorType}/${id}`);
              
              console.log('\nResource Content:');
              for (const content of resource.contents) {
                if (content.text) {
                  console.log(content.text);
                }
              }
            } catch (error) {
              handleError(error);
            }
            break;
          }
            
          case 'prompt': {
            if (args.length < 1) {
              console.log('Usage: prompt <error-type> [message]');
              break;
            }
            
            const errorType = args[0];
            const message = args.slice(1).join(' ') || undefined;
            
            console.log(`Testing prompt error handling: ${errorType}`);
            
            try {
              const prompt = await client.getPrompt('errorPrompt', {
                errorType,
                message
              });
              
              console.log('\nPrompt Messages:');
              for (const message of prompt.messages) {
                console.log(`\n[${message.role}]:`);
                if (message.content.type === 'text') {
                  console.log(message.content.text);
                }
              }
            } catch (error) {
              handleError(error);
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
        console.error(`Unexpected error: ${error.message}`);
      }
    }
    
    // Clean up
    console.log('\nClosing connection...');
    await client.close();
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close the readline interface
    rl.close();
  }
}

// Helper function to handle errors
function handleError(error) {
  console.log('\n=== Error Occurred ===');
  console.log(`Message: ${error.message}`);
  
  // Check for standard error codes
  if (error.code) {
    console.log(`Error Code: ${error.code}`);
    
    switch (error.code) {
      case ErrorCode.ParseError:
        console.log('Type: Parse Error - The server could not parse the request');
        console.log('Recovery: Check the format of your request and try again');
        break;
        
      case ErrorCode.InvalidRequest:
        console.log('Type: Invalid Request - The request was invalid');
        console.log('Recovery: Modify your request to match the expected format');
        break;
        
      case ErrorCode.MethodNotFound:
        console.log('Type: Method Not Found - The requested method does not exist');
        console.log('Recovery: Check the method name and available methods');
        break;
        
      case ErrorCode.InvalidParams:
        console.log('Type: Invalid Parameters - The parameters provided were invalid');
        console.log('Recovery: Check the parameter types and requirements');
        break;
        
      case ErrorCode.InternalError:
        console.log('Type: Internal Error - An internal error occurred on the server');
        console.log('Recovery: Report the issue to the server administrator');
        break;
        
      default:
        console.log(`Type: Custom Error Code (${error.code})`);
        console.log('Recovery: Refer to the server documentation for this error code');
    }
  } else {
    console.log('Type: Unspecified Error (no error code)');
    console.log('Recovery: Check the error message for details');
  }
  
  // Check for additional error data
  if (error.data) {
    console.log('\nAdditional Error Data:');
    console.log(error.data);
  }
}

// Start the application
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
