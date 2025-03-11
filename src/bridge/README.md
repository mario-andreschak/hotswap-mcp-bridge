# MCP Transport Bridge Core

This directory contains the core components of the MCP Transport Bridge. These components manage the connections between different MCP transport protocols and handle the routing of messages.

## Files

- `connection.ts` - Connection management for the bridge
- `manager.ts` - Bridge manager for creating and managing bridges between different transports
- `registry.ts` - Registry for tracking available MCP servers
- `types.ts` - TypeScript type definitions for the bridge components

## Purpose

The bridge core is responsible for:

1. Maintaining a registry of available MCP servers
2. Managing connections between clients and servers
3. Creating bridges between different transport protocols
4. Routing messages between connected endpoints
5. Monitoring and managing the lifecycle of connections

This directory implements the central functionality of the MCP Transport Bridge, allowing clients and servers using different transport protocols to communicate seamlessly.

## Architecture

The bridge follows a modular architecture:

- The `registry` maintains information about available MCP servers
- The `connection` manager tracks active connections
- The `manager` creates appropriate handlers for bridging different transport types
- The handlers (defined in the `../handlers` directory) perform the actual message translation and routing

This separation of concerns allows for easy extension with new transport protocols and connection types.
