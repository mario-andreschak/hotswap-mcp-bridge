/**
 * Types for the MCP Transport Bridge
 */
import { ChildProcess } from "node:child_process";

/**
 * Environment update for a server
 */
export interface EnvironmentUpdate {
  serverId: string;
  env: Record<string, string>;
}

// Import core SDK types
import { 
  JSONRPCMessage,
  ClientRequest,
  ServerRequest,
  ClientNotification,
  ServerNotification,
  Implementation,
  McpError,
  ErrorCode as SDKErrorCode,
  
  // Resource types
  Resource,
  ResourceTemplate,
  ListResourcesResult,
  ReadResourceResult,
  ResourceContents,
  TextResourceContents,
  BlobResourceContents,
  
  // Tool types
  Tool,
  ListToolsResult,
  CallToolResult,
  CallToolRequest,
  ListToolsRequest,
  
  // Prompt types
  Prompt,
  PromptArgument,
  ListPromptsResult,
  GetPromptResult,
  GetPromptRequest,
  ListPromptsRequest,
  
  // Completion types
  CompleteRequest,
  CompleteResult,
  PromptReference,
  ResourceReference,
} from "@modelcontextprotocol/sdk/types.js";

// Import transport types
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

// Import transport-specific types
import { StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";

// Import protocol types
import { 
  RequestHandlerExtra, 
  ProtocolOptions, 
  RequestOptions 
} from "@modelcontextprotocol/sdk/shared/protocol.js";

/**
 * Supported transport types
 */
export type TransportType = "stdio" | "sse" | "memory";

/**
 * Server configuration
 * Extends the SDK Implementation type
 */
export interface ServerConfig extends Implementation {
  // Server identification
  id?: string;                 // Auto-generated if not provided
  
  // Server process
  command: string;             // Command to run
  args?: string[];             // Command arguments
  cwd?: string;                // Working directory
  env?: Record<string, string>; // Environment variables
  
  // Transport
  transport: TransportType;    // Native transport protocol
  
  // SSE-specific options
  sseOptions?: {
    port?: number;             // Port for SSE server
    host?: string;             // Host for SSE server
  };
  
  // Lifecycle
  autoRestart?: boolean;       // Auto-restart on crash
  maxRestarts?: number;        // Maximum restart attempts
  restartDelay?: number;       // Delay between restarts (ms)
}

/**
 * Connection configuration
 * Extends the SDK Implementation type
 */
export interface ConnectionConfig extends Implementation {
  // Connection identification
  id?: string;                 // Auto-generated if not provided
  
  // Server reference
  serverId: string;            // ID of the server to connect to
  
  // Transport
  transport: TransportType;    // Client transport protocol
  
  // Connection options
  timeout?: number;            // Connection timeout (ms)
  reconnect?: boolean;         // Auto-reconnect on disconnect
  maxReconnects?: number;      // Maximum reconnection attempts
  reconnectDelay?: number;     // Delay between reconnects (ms)
}

/**
 * Server status
 */
export enum ServerStatus {
  STARTING = "starting",
  RUNNING = "running",
  STOPPING = "stopping",
  STOPPED = "stopped",
  ERROR = "error"
}

/**
 * Connection status
 */
export enum ConnectionStatus {
  CONNECTING = "connecting",
  CONNECTED = "connected",
  DISCONNECTING = "disconnecting",
  DISCONNECTED = "disconnected",
  ERROR = "error"
}

/**
 * Server instance
 */
export interface ServerInstance {
  id: string;
  config: ServerConfig;
  status: ServerStatus;
  process?: ChildProcess;
  transport?: Transport;
  error?: Error;
  startTime?: Date;
  restartCount: number;
}

/**
 * Connection instance
 */
export interface ConnectionInstance {
  id: string;
  config: ConnectionConfig;
  status: ConnectionStatus;
  transport?: Transport;
  error?: Error;
  connectTime?: Date;
  reconnectCount: number;
}

/**
 * Message handler functions
 * Using SDK message types
 */
export type MessageHandler = (message: JSONRPCMessage) => Promise<void>;
export type ClientMessageHandler = (message: ClientRequest | ClientNotification) => Promise<void>;
export type ServerMessageHandler = (message: ServerRequest | ServerNotification) => Promise<void>;

/**
 * Transport adapter interface
 * Extends the Transport interface from the MCP SDK
 */
export interface TransportAdapter extends Transport {
  /**
   * Stop the transport
   */
  stop(): Promise<void>;
  
  /**
   * Set a message handler
   */
  setMessageHandler(handler: MessageHandler): void;
  
  /**
   * Set an error handler
   */
  setErrorHandler(handler: (error: Error) => void): void;
  
  /**
   * Set a close handler
   */
  setCloseHandler(handler: () => void): void;
}

/**
 * Bridge handler interface
 * Using SDK message types
 */
export interface BridgeHandler {
  /**
   * Start the bridge
   */
  start(): Promise<void>;
  
  /**
   * Stop the bridge
   */
  stop(): Promise<void>;
  
  /**
   * Handle a message from the client
   */
  handleClientMessage(message: JSONRPCMessage): Promise<void>;
  
  /**
   * Handle a message from the server
   */
  handleServerMessage(message: JSONRPCMessage): Promise<void>;
}
