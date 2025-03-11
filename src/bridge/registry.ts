/**
 * Server registry for managing MCP servers
 */
import { randomUUID } from "node:crypto";
import { ChildProcess } from "node:child_process";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createLogger } from "../utils/logging.js";
import { ErrorCode, ServerError } from "../utils/errors.js";
import { ServerConfig, ServerInstance, ServerStatus } from "./types.js";

const logger = createLogger({ prefix: "Registry" });

/**
 * Server registry for managing MCP servers
 */
export class ServerRegistry {
  private servers: Map<string, ServerInstance> = new Map();
  
  /**
   * Register a new server
   */
  registerServer(config: ServerConfig): ServerInstance {
    const id = config.id ?? randomUUID();
    
    if (this.servers.has(id)) {
      throw new ServerError(
        ErrorCode.SERVER_ALREADY_EXISTS,
        `Server with ID ${id} already exists`,
        id
      );
    }
    
    logger.info(`Registering server: ${config.name} (${id})`);
    
    const server: ServerInstance = {
      id,
      config: {
        ...config,
        id
      },
      status: ServerStatus.STOPPED,
      restartCount: 0
    };
    
    this.servers.set(id, server);
    return server;
  }
  
  /**
   * Unregister a server
   */
  unregisterServer(id: string): void {
    const server = this.getServer(id);
    
    if (server.status !== ServerStatus.STOPPED) {
      throw new ServerError(
        ErrorCode.SERVER_STOP_FAILED,
        `Cannot unregister server ${id} because it is not stopped`,
        id
      );
    }
    
    logger.info(`Unregistering server: ${server.config.name} (${id})`);
    this.servers.delete(id);
  }
  
  /**
   * Get a server by ID
   */
  getServer(id: string): ServerInstance {
    const server = this.servers.get(id);
    
    if (!server) {
      throw new ServerError(
        ErrorCode.SERVER_NOT_FOUND,
        `Server with ID ${id} not found`,
        id
      );
    }
    
    return server;
  }
  
  /**
   * Get all servers
   */
  getAllServers(): ServerInstance[] {
    return Array.from(this.servers.values());
  }
  
  /**
   * Update server status
   */
  updateServerStatus(id: string, status: ServerStatus, error?: Error): void {
    const server = this.getServer(id);
    
    logger.debug(`Updating server status: ${server.config.name} (${id}) -> ${status}`);
    
    server.status = status;
    
    if (error) {
      server.error = error;
    } else if (status !== ServerStatus.ERROR) {
      server.error = undefined;
    }
    
    if (status === ServerStatus.RUNNING) {
      server.startTime = new Date();
    }
  }
  
  /**
   * Update server process
   */
  updateServerProcess(id: string, process?: ChildProcess): void {
    const server = this.getServer(id);
    server.process = process;
  }
  
  /**
   * Update server transport
   */
  updateServerTransport(id: string, transport?: Transport): void {
    const server = this.getServer(id);
    server.transport = transport;
  }
  
  /**
   * Increment server restart count
   */
  incrementRestartCount(id: string): number {
    const server = this.getServer(id);
    server.restartCount += 1;
    return server.restartCount;
  }
  
  /**
   * Reset server restart count
   */
  resetRestartCount(id: string): void {
    const server = this.getServer(id);
    server.restartCount = 0;
  }
  
  /**
   * Check if server should be restarted
   */
  shouldRestartServer(id: string): boolean {
    const server = this.getServer(id);
    
    if (!server.config.autoRestart) {
      return false;
    }
    
    if (server.config.maxRestarts !== undefined && 
        server.restartCount >= server.config.maxRestarts) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Get server restart delay
   */
  getServerRestartDelay(id: string): number {
    const server = this.getServer(id);
    return server.config.restartDelay ?? 1000;
  }
  
  /**
   * Update server environment variables
   * Returns true if the server needs to be restarted
   */
  updateServerEnvironment(id: string, env: Record<string, string>): boolean {
    const server = this.getServer(id);
    
    // Merge new environment variables with existing ones
    server.config.env = {
      ...(server.config.env || {}),
      ...env
    };
    
    logger.info(`Updated environment variables for server: ${server.config.name} (${id})`);
    
    // If server is running, it needs to be restarted with new environment
    if (server.status === ServerStatus.RUNNING) {
      return true; // Indicate that restart is needed
    }
    
    return false; // No restart needed
  }
}

/**
 * Create a server registry
 */
export function createServerRegistry(): ServerRegistry {
  return new ServerRegistry();
}
