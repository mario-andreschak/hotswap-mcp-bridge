# MCP Transport Bridge

A bridge between different MCP transport protocols that enables seamless integration with existing implementations.
![image](https://github.com/user-attachments/assets/cfe18033-e1eb-4bc9-a362-175f399a76e5)


## Overview

The MCP Transport Bridge allows different MCP clients to connect to the same MCP server using different transport protocols. It also supports environment variable management and server hot-swapping.

## Key Features

- **Transport Protocol Bridging**: Connect clients and servers using different transport protocols (stdio, SSE, memory)
- **Environment Variable Management**: Update server environment variables dynamically
- **Server Hot-Swapping**: Restart servers with new environment variables while maintaining client connections
- **API-Driven**: RESTful API for managing servers and connections

## Use Cases

### Scenario 1: Client B connects first, then Client A

1. Client B connects to the bridge using stdio
2. The bridge starts Server C with default environment
3. Client A connects to the bridge and updates environment variables
4. The bridge restarts Server C with the new environment
5. The bridge reconnects Client B to the restarted Server C

### Scenario 2: Client A connects first, then Client B

1. Client A connects to the bridge and sets environment variables
2. The bridge starts Server C with Client A's environment
3. Client B connects to the bridge
4. The bridge connects Client B to Server C (which already has Client A's environment)

## Getting Started

### Installation

```bash
npm install
npm run build
```

### Running the Demo

```bash
node examples/demo-workflow.js
```

This will demonstrate the complete workflow with:
- Starting the bridge
- Registering Server C
- Client B connecting to Server C via the bridge
- Client A connecting and updating environment variables
- Server C being restarted with the new environment

### Using the Bridge Launcher

The bridge launcher acts as a proxy between Client B and Server C:

```bash
node examples/bridge-launcher.js --server-id <server-id> [--port <port>] [--host <host>]
```

### Using Client A

Client A can connect to the bridge and update environment variables:

```bash
node examples/client-a.js --server-id <server-id> [--port <port>] [--host <host>]
```

## API Reference

### Servers

- `GET /api/servers`: List all servers
- `GET /api/servers/:id`: Get server details
- `POST /api/servers`: Create a new server
- `PUT /api/servers/:id`: Update a server
- `DELETE /api/servers/:id`: Delete a server
- `POST /api/servers/:id/start`: Start a server
- `POST /api/servers/:id/stop`: Stop a server
- `POST /api/servers/:id/environment`: Update server environment variables

### Connections

- `GET /api/connections`: List all connections
- `GET /api/connections/:id`: Get connection details
- `POST /api/connections`: Create a new connection
- `DELETE /api/connections/:id`: Delete a connection
- `POST /api/connections/:id/disconnect`: Disconnect a connection
- `POST /api/connections/:id/reconnect`: Reconnect a connection

## Integration Guide

### For Client B

1. Configure Client B to point to the bridge launcher instead of directly to Server C
2. The bridge launcher will handle the connection to Server C via the bridge

### For Client A

1. Connect to the bridge API
2. Update environment variables for Server C
3. Connect to Server C via the bridge

## Architecture

```
┌─────────────┐     ┌─────────────────────────────────┐     ┌─────────────┐
│   Client A  │     │           MCP Bridge            │     │   Server C   │
│  (SSE/WS)   │────▶│                                 │────▶│   (stdio)    │
└─────────────┘     │  ┌─────────────┐ ┌───────────┐  │     └─────────────┘
                    │  │Environment  │ │  Server   │  │             ▲
┌─────────────┐     │  │  Manager    │ │ Registry  │  │             │
│   Client B  │     │  └─────────────┘ └───────────┘  │             │
│   (stdio)   │────▶│                                 │─────────────┘
└─────────────┘     └─────────────────────────────────┘
```

## License

MIT
