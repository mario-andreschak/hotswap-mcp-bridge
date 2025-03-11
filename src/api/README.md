# MCP Transport Bridge API

This directory contains the API server implementation for the MCP Transport Bridge. The API provides HTTP endpoints for managing and monitoring bridge connections.

## Files

- `server.ts` - Main API server implementation
- `middleware/` - Express middleware for the API server
- `routes/` - API route handlers
  - `connections.ts` - Endpoints for managing connections
  - `index.ts` - Main router and route registration
  - `servers.ts` - Endpoints for managing servers

## Purpose

The API server provides a RESTful interface for interacting with the MCP Transport Bridge. It allows clients to:

1. Register and manage MCP servers
2. Create and monitor bridge connections
3. Configure bridge settings
4. View bridge status and statistics

The API is designed to be used by management tools, monitoring systems, and other applications that need to interact with the bridge.

## Usage

The API server is automatically started when the MCP Transport Bridge application is launched. It listens on the configured port and host, providing HTTP endpoints for bridge management.

API endpoints follow RESTful conventions and return JSON responses. Authentication and authorization mechanisms may be implemented in the middleware directory.
