# MCP (Model Context Protocol) Examples

This directory contains example scripts that demonstrate how to use the Model Context Protocol (MCP) in various scenarios. These examples showcase different features, transport protocols, and use cases of the MCP TypeScript SDK.

## Setup

Before running the examples, make sure you have built the project:

```bash
# From the project root
npm install
npm run build
```

## Core MCP Examples

### Simple Echo Server (`echo-server.js`)

A minimal MCP server that echoes back any messages it receives and logs its environment variables.

```bash
node examples/echo-server.js
```

### Tool Server (`tool-server.js`)

A comprehensive example of an MCP server that provides multiple tools with different capabilities and input schemas.

```bash
node examples/tool-server.js
```

Features:
- Calculator tool for basic math operations
- Text processing tool for string manipulations
- Data validation tool for checking emails, URLs, etc.

### Resource Server (`resource-server.js`)

An MCP server that demonstrates how to provide various resources with different content types and URI templates.

```bash
node examples/resource-server.js
```

Features:
- Static text and JSON resources
- Dynamic resources that change on each request
- Resource templates with parameters
- File content resources with security restrictions
- Binary resources (SVG image example)

### Prompt Server (`prompt-server.js`)

An MCP server that provides various prompt templates with different arguments and use cases.

```bash
node examples/prompt-server.js
```

Features:
- Simple greeting prompt with formal/casual options
- Code review prompt for different languages and focus areas
- Multi-turn conversation prompt for job interviews
- Document analysis prompt
- System prompt generator

### Advanced Client (`advanced-client.js`)

A client that demonstrates advanced MCP client features including roots, sampling, and interactive tool usage.

```bash
node examples/advanced-client.js [--server <server-command>]
```

Features:
- Setting roots for resource access
- Handling sampling requests
- Interactive mode for calling tools, reading resources, and getting prompts
- Error handling and recovery

### Error Handling (`error-handling.js`)

A demonstration of best practices for error handling in MCP clients and servers.

```bash
node examples/error-handling.js
```

Features:
- Standard error codes and custom errors
- Error recovery strategies
- Interactive error testing for tools, resources, and prompts

### HTTP Server (`http-server.js`)

An MCP server that uses HTTP with Server-Sent Events (SSE) for server-to-client communication.

```bash
node examples/http-server.js [--port <port>]
```

Features:
- HTTP transport with SSE for server-to-client messages
- Browser-based client interface
- Multiple tool examples (echo, timestamp, random number)

### Real-World Example: Code Assistant (`real-world-example.js`)

A practical use case for MCP: a code assistant server that provides tools for code analysis, generation, and documentation.

```bash
node examples/real-world-example.js [--project <project-path>]
```

Features:
- Code analysis tool that examines code and provides insights
- Code generation tool that creates code based on requirements
- Documentation generator that creates documentation for code
- Project structure analyzer that provides insights into project organization

## Bridge Examples

### Simple Bridge (`simple-bridge.js`)

A basic example that starts the bridge and provides example API calls for common operations.

```bash
node examples/simple-bridge.js
```

### Bridge Launcher (`bridge-launcher.js`)

Acts as a proxy between a client and server, forwarding stdin/stdout to the bridge.

```bash
node examples/bridge-launcher.js --server-id <server-id> [--port <port>] [--host <host>]
```

### Client A Example (`client-a.js`)

Demonstrates how a client can connect to the bridge and update environment variables.

```bash
node examples/client-a.js --server-id <server-id> [--port <port>] [--host <host>]
```

### Demo Workflow (`demo-workflow.js`)

A comprehensive example that demonstrates the complete workflow with multiple components.

```bash
node examples/demo-workflow.js [--port <port>] [--host <host>]
```

## In-Memory Examples

### Memory Bridge (`memory-bridge.js`)

Demonstrates using the in-memory transport for local testing without HTTP.

```bash
node examples/memory-bridge.js
```

### Memory Client (`memory-client.js`)

Shows how to use the in-memory transport client directly with the MCP SDK.

```bash
node examples/memory-client.js
```

## Common Patterns

These examples demonstrate several common patterns:

1. **Server Implementation**: Creating MCP servers with tools, resources, and prompts
2. **Client Implementation**: Creating MCP clients that connect to servers and use their capabilities
3. **Transport Mechanisms**: Using different transport protocols (stdio, HTTP with SSE, in-memory)
4. **Error Handling**: Implementing proper error handling and recovery
5. **Real-World Applications**: Building practical applications using MCP

## Key Concepts

### Tools

Tools are functions that servers expose for clients to execute. They have defined input schemas and return structured results.

Example from `tool-server.js`:
```javascript
server.tool(
  'calculator',
  'Perform basic calculations',
  {
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number()
  },
  async ({ operation, a, b }) => {
    // Implementation...
  }
);
```

### Resources

Resources represent data that servers expose to clients. Each resource has a unique URI and can contain text or binary data.

Example from `resource-server.js`:
```javascript
server.resource(
  'resource://static/greeting',
  'Greeting Message',
  'A simple greeting message',
  'text/plain',
  async () => {
    return 'Hello from the MCP Resource Server!';
  }
);
```

### Prompts

Prompts are reusable templates that servers can expose to clients.

Example from `prompt-server.js`:
```javascript
server.prompt(
  'greeting',
  'Generate a greeting message',
  {
    name: z.string(),
    formal: z.boolean().optional()
  },
  async ({ name, formal = false }) => {
    // Implementation...
  }
);
```

### Transports

MCP supports multiple transport mechanisms:

1. **Stdio transport**: Uses standard input/output for communication
2. **HTTP with SSE transport**: Uses Server-Sent Events for server-to-client messages and HTTP POST for client-to-server messages
3. **In-memory transport**: For local testing without network communication

## Further Reading

For more information about the Model Context Protocol, refer to the main [README.md](../README.md) file and the [MCP Protocol documentation](../mcp-protocol/README.md).
