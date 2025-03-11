#!/usr/bin/env node
/**
 * MCP Tool Server Example
 * 
 * This example demonstrates how to create an MCP server that provides multiple tools
 * with different capabilities and input schemas.
 */
import { McpServer } from '../mcp-protocol/src/server/mcp.js';
import { StdioServerTransport } from '../mcp-protocol/src/server/stdio.js';
import { z } from 'zod';

// Create a server
const server = new McpServer({
  name: 'tool-server',
  version: '1.0.0'
});

// Register a calculator tool
server.tool(
  'calculator',
  'Perform basic calculations',
  {
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('The operation to perform'),
    a: z.number().describe('First operand'),
    b: z.number().describe('Second operand')
  },
  async ({ operation, a, b }) => {
    console.error(`Calculating: ${a} ${operation} ${b}`);
    
    let result;
    switch (operation) {
      case 'add': result = a + b; break;
      case 'subtract': result = a - b; break;
      case 'multiply': result = a * b; break;
      case 'divide': 
        if (b === 0) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Error: Division by zero'
              }
            ]
          };
        }
        result = a / b; 
        break;
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `Result: ${result}`
        }
      ]
    };
  }
);

// Register a text processing tool
server.tool(
  'textProcessor',
  'Process text in various ways',
  {
    operation: z.enum(['uppercase', 'lowercase', 'reverse', 'count']).describe('The operation to perform'),
    text: z.string().describe('Text to process')
  },
  async ({ operation, text }) => {
    console.error(`Processing text with operation: ${operation}`);
    
    let result;
    switch (operation) {
      case 'uppercase': result = text.toUpperCase(); break;
      case 'lowercase': result = text.toLowerCase(); break;
      case 'reverse': result = text.split('').reverse().join(''); break;
      case 'count': result = `Characters: ${text.length}, Words: ${text.split(/\s+/).filter(Boolean).length}`; break;
    }
    
    return {
      content: [
        {
          type: 'text',
          text: result
        }
      ]
    };
  }
);

// Register a data validation tool
server.tool(
  'validator',
  'Validate data against schemas',
  {
    type: z.enum(['email', 'url', 'date', 'phone']).describe('Type of validation to perform'),
    value: z.string().describe('Value to validate')
  },
  async ({ type, value }) => {
    console.error(`Validating ${type}: ${value}`);
    
    let isValid = false;
    let message = '';
    
    switch (type) {
      case 'email':
        isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        message = isValid ? 'Valid email address' : 'Invalid email address';
        break;
      case 'url':
        try {
          new URL(value);
          isValid = true;
          message = 'Valid URL';
        } catch (e) {
          isValid = false;
          message = 'Invalid URL';
        }
        break;
      case 'date':
        const date = new Date(value);
        isValid = !isNaN(date.getTime());
        message = isValid ? 'Valid date' : 'Invalid date';
        break;
      case 'phone':
        isValid = /^\+?[\d\s-]{10,15}$/.test(value);
        message = isValid ? 'Valid phone number' : 'Invalid phone number';
        break;
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `Validation result: ${message}`
        }
      ]
    };
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);

console.error('Tool Server running...');
