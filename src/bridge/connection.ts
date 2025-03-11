/**
 * Connection management for MCP Transport Bridge
 */
import { randomUUID } from "node:crypto";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createLogger } from "../utils/logging.js";
import { ConnectionError, ErrorCode } from "../utils/errors.js";
import { ConnectionConfig, ConnectionInstance, ConnectionStatus } from "./types.js";

const logger = createLogger({ prefix: "Connection" });

/**
 * Connection manager for handling client connections
 */
export class ConnectionManager {
  private connections: Map<string, ConnectionInstance> = new Map();
  
  /**
   * Create a new connection
   */
  createConnection(config: ConnectionConfig): ConnectionInstance {
    const id = config.id ?? randomUUID();
    
    if (this.connections.has(id)) {
      throw new ConnectionError(
        ErrorCode.CONNECTION_ALREADY_EXISTS,
        `Connection with ID ${id} already exists`,
        id
      );
    }
    
    logger.info(`Creating connection: ${config.name || id} (${id})`);
    
    const connection: ConnectionInstance = {
      id,
      config: {
        ...config,
        id
      },
      status: ConnectionStatus.DISCONNECTED,
      reconnectCount: 0
    };
    
    this.connections.set(id, connection);
    return connection;
  }
  
  /**
   * Remove a connection
   */
  removeConnection(id: string): void {
    const connection = this.getConnection(id);
    
    if (connection.status !== ConnectionStatus.DISCONNECTED) {
      throw new ConnectionError(
        ErrorCode.CONNECTION_FAILED,
        `Cannot remove connection ${id} because it is not disconnected`,
        id
      );
    }
    
    logger.info(`Removing connection: ${connection.config.name || id} (${id})`);
    this.connections.delete(id);
  }
  
  /**
   * Get a connection by ID
   */
  getConnection(id: string): ConnectionInstance {
    const connection = this.connections.get(id);
    
    if (!connection) {
      throw new ConnectionError(
        ErrorCode.CONNECTION_NOT_FOUND,
        `Connection with ID ${id} not found`,
        id
      );
    }
    
    return connection;
  }
  
  /**
   * Get all connections
   */
  getAllConnections(): ConnectionInstance[] {
    return Array.from(this.connections.values());
  }
  
  /**
   * Get connections for a server
   */
  getConnectionsForServer(serverId: string): ConnectionInstance[] {
    return this.getAllConnections().filter(
      connection => connection.config.serverId === serverId
    );
  }
  
  /**
   * Update connection status
   */
  updateConnectionStatus(id: string, status: ConnectionStatus, error?: Error): void {
    const connection = this.getConnection(id);
    
    logger.debug(`Updating connection status: ${connection.config.name || id} (${id}) -> ${status}`);
    
    connection.status = status;
    
    if (error) {
      connection.error = error;
    } else if (status !== ConnectionStatus.ERROR) {
      connection.error = undefined;
    }
    
    if (status === ConnectionStatus.CONNECTED) {
      connection.connectTime = new Date();
    }
  }
  
  /**
   * Update connection transport
   */
  updateConnectionTransport(id: string, transport?: Transport): void {
    const connection = this.getConnection(id);
    connection.transport = transport;
  }
  
  /**
   * Increment connection reconnect count
   */
  incrementReconnectCount(id: string): number {
    const connection = this.getConnection(id);
    connection.reconnectCount += 1;
    return connection.reconnectCount;
  }
  
  /**
   * Reset connection reconnect count
   */
  resetReconnectCount(id: string): void {
    const connection = this.getConnection(id);
    connection.reconnectCount = 0;
  }
  
  /**
   * Check if connection should be reconnected
   */
  shouldReconnect(id: string): boolean {
    const connection = this.getConnection(id);
    
    if (!connection.config.reconnect) {
      return false;
    }
    
    if (connection.config.maxReconnects !== undefined && 
        connection.reconnectCount >= connection.config.maxReconnects) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Get connection reconnect delay
   */
  getReconnectDelay(id: string): number {
    const connection = this.getConnection(id);
    return connection.config.reconnectDelay ?? 1000;
  }
}

/**
 * Create a connection manager
 */
export function createConnectionManager(): ConnectionManager {
  return new ConnectionManager();
}
