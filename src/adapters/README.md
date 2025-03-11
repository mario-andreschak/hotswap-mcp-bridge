# MCP Transport Adapters

This directory contains transport adapters for the MCP Transport Bridge. These adapters provide standardized interfaces for different transport protocols used in the Model Context Protocol (MCP).

## Files

- `base.ts` - Base adapter interface and abstract implementations
- `factory.ts` - Factory for creating adapters based on configuration
- `memory.ts` - In-memory transport adapter for testing and local communication
- `sse.ts` - Server-Sent Events (SSE) transport adapter for HTTP-based communication
- `stdio.ts` - Standard I/O transport adapter for process-based communication

## Purpose

The adapters in this directory serve as the communication layer for the MCP Transport Bridge. They abstract away the details of different transport protocols, providing a consistent interface for the bridge to work with. This allows the bridge to connect clients and servers that use different transport mechanisms.

Each adapter implements methods for sending and receiving messages according to the specific transport protocol it represents. The factory pattern is used to create the appropriate adapter based on configuration.

## Usage

Adapters are typically not used directly by application code but are instead created and managed by the bridge. The bridge uses these adapters to establish connections between clients and servers using different transport protocols.
