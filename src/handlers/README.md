# MCP Transport Bridge Handlers

This directory contains handlers for bridging different MCP transport protocols. Each handler is responsible for translating messages between two specific transport types.

## Files

- `base.ts` - Base handler interface and abstract implementations
- `memory-to-memory.ts` - Handler for bridging between two in-memory transports
- `sse-to-stdio.ts` - Handler for bridging between SSE and stdio transports
- `stdio-to-sse.ts` - Handler for bridging between stdio and SSE transports

## Purpose

Handlers are the core components that enable the MCP Transport Bridge to connect clients and servers using different transport protocols. Each handler:

1. Listens for messages from one transport
2. Translates the messages to the format expected by the other transport
3. Forwards the translated messages
4. Manages the lifecycle of the connection

This bidirectional translation allows seamless communication between MCP clients and servers regardless of their underlying transport mechanisms.

## Architecture

Handlers follow a consistent pattern:

- They implement the base handler interface defined in `base.ts`
- They are instantiated by the bridge manager based on the transport types
- They maintain references to both transport adapters
- They set up event listeners for messages and connection events
- They handle error conditions and cleanup

New handlers can be added to support additional transport protocol combinations by following this pattern.
