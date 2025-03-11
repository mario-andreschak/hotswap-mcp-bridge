/**
 * Bridge manager for MCP Transport Bridge
 */
import { IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "../utils/logging.js";
import { ErrorCode, ServerError, ConnectionError } from "../utils/errors.js";
import { killProcess } from "../utils/process.js";
import { ServerRegistry } from "./registry.js";
import { ConnectionManager } from "./connection.js";
import { 
  ServerConfig, 
  ConnectionConfig, 
  ServerStatus, 
  ConnectionStatus,
  BridgeHandler,
  TransportType
} from "./types.js";
import { 
  createClientAdapter, 
  createServerAdapter,
  getStdioProcess,
  createLinkedInMemoryTransports
} from "../adapters/factory.js";
import { createStdioToSSEHandler } from "../handlers/stdio-to-sse.js";
import { createSSEToStdioHandler } from "../handlers/sse-to-stdio.js";
import { createMemoryToMemoryHandler } from "../handlers/memory-to-memory.js";

const logger = createLogger({ prefix: "BridgeManager" });

/**
 * Bridge manager options
 */
export interface BridgeManagerOptions {
  serverRegistry: ServerRegistry;
  connectionManager: ConnectionManager;
}

/**
 * Bridge manager for handling MCP servers and connections
 */
export class BridgeManager {
  private serverRegistry: ServerRegistry;
  private connectionManager: ConnectionManager;
  private bridges: Map<string, BridgeHandler> = new Map();
  
  /**
   * Constructor
   */
  constructor(options: BridgeManagerOptions) {
    this.serverRegistry = options.serverRegistry;
    this.connectionManager = options.connectionManager;
  }
  
  /**
   * Start a server
   */
  async startServer(id: string): Promise<void> {
    const server = this.serverRegistry.getServer(id);
    
    if (server.status === ServerStatus.RUNNING) {
      logger.warn(`Server ${id} is already running`);
      return;
    }
    
    if (server.status === ServerStatus.STARTING) {
      logger.warn(`Server ${id} is already starting`);
      return;
    }
    
    logger.info(`Starting server: ${server.config.name} (${id})`);
    
    try {
      // Update server status
      this.serverRegistry.updateServerStatus(id, ServerStatus.STARTING);
      
      // Create server adapter based on transport type
      const serverAdapter = createServerAdapter(server.config.transport, {
        config: server.config
      });
      
      // Start the server adapter
      await serverAdapter.start();
      
      // If it's a stdio server, get the process
      if (server.config.transport === "stdio") {
        const process = getStdioProcess(serverAdapter);
        
        if (process) {
          // Update server process
          this.serverRegistry.updateServerProcess(id, process);
          
          // Handle process exit
          process.on("exit", (code, signal) => {
            logger.info(`Server process exited: ${server.config.name} (${id}) with code ${code}, signal ${signal}`);
            
            // Update server status
            this.serverRegistry.updateServerStatus(id, ServerStatus.STOPPED);
            
            // Check if server should be restarted
            if (this.serverRegistry.shouldRestartServer(id)) {
              const restartCount = this.serverRegistry.incrementRestartCount(id);
              const delay = this.serverRegistry.getServerRestartDelay(id);
              
              logger.info(`Restarting server: ${server.config.name} (${id}) (attempt ${restartCount})`);
              
              setTimeout(() => {
                this.startServer(id).catch((error) => {
                  logger.error(`Failed to restart server: ${server.config.name} (${id})`, error);
                });
              }, delay);
            }
          });
        }
      }
      
      // Update server transport
      this.serverRegistry.updateServerTransport(id, serverAdapter);
      
      // Update server status
      this.serverRegistry.updateServerStatus(id, ServerStatus.RUNNING);
      
      // Reset restart count
      this.serverRegistry.resetRestartCount(id);
      
      logger.info(`Server started: ${server.config.name} (${id})`);
    } catch (error) {
      logger.error(`Failed to start server: ${server.config.name} (${id})`, error);
      
      // Update server status
      this.serverRegistry.updateServerStatus(id, ServerStatus.ERROR, error as Error);
      
      throw new ServerError(
        ErrorCode.SERVER_START_FAILED,
        `Failed to start server: ${server.config.name} (${id})`,
        id,
        error
      );
    }
  }
  
  /**
   * Stop a server
   */
  async stopServer(id: string): Promise<void> {
    const server = this.serverRegistry.getServer(id);
    
    if (server.status === ServerStatus.STOPPED) {
      logger.warn(`Server ${id} is already stopped`);
      return;
    }
    
    if (server.status === ServerStatus.STOPPING) {
      logger.warn(`Server ${id} is already stopping`);
      return;
    }
    
    logger.info(`Stopping server: ${server.config.name} (${id})`);
    
    try {
      // Update server status
      this.serverRegistry.updateServerStatus(id, ServerStatus.STOPPING);
      
      // Stop all connections to this server
      const connections = this.connectionManager.getConnectionsForServer(id);
      
      for (const connection of connections) {
        try {
          await this.disconnectConnection(connection.id);
        } catch (error) {
          logger.error(`Failed to disconnect connection: ${connection.id}`, error);
        }
      }
      
      // Stop the server transport
      if (server.transport) {
        await server.transport.close();
      }
      
      // Kill the server process if it's still running
      if (server.process) {
        await killProcess(server.process);
      }
      
      // Update server status
      this.serverRegistry.updateServerStatus(id, ServerStatus.STOPPED);
      
      // Clear server process and transport
      this.serverRegistry.updateServerProcess(id, undefined);
      this.serverRegistry.updateServerTransport(id, undefined);
      
      logger.info(`Server stopped: ${server.config.name} (${id})`);
    } catch (error) {
      logger.error(`Failed to stop server: ${server.config.name} (${id})`, error);
      
      // Update server status
      this.serverRegistry.updateServerStatus(id, ServerStatus.ERROR, error as Error);
      
      throw new ServerError(
        ErrorCode.SERVER_STOP_FAILED,
        `Failed to stop server: ${server.config.name} (${id})`,
        id,
        error
      );
    }
  }
  
  /**
   * Update server environment variables
   * This will restart the server if it's already running
   */
  async updateServerEnvironment(id: string, env: Record<string, string>): Promise<void> {
    // Update environment variables
    const needsRestart = this.serverRegistry.updateServerEnvironment(id, env);
    
    if (needsRestart) {
      logger.info(`Server ${id} needs to be restarted with new environment variables`);
      
      // Get all connections to this server
      const connections = this.connectionManager.getConnectionsForServer(id);
      
      // Remember connection configs for reconnection
      const connectionConfigs = connections.map(conn => conn.config);
      
      // Disconnect all connections
      for (const connection of connections) {
        await this.disconnectConnection(connection.id);
      }
      
      // Restart the server
      await this.stopServer(id);
      await this.startServer(id);
      
      // Reconnect all clients
      for (const config of connectionConfigs) {
        await this.connectToServer(config);
      }
      
      logger.info(`Server ${id} restarted with new environment variables`);
    }
  }

  /**
   * Connect to a server
   */
  async connectToServer(
    connectionConfig: ConnectionConfig,
    options?: {
      endpoint?: string;
      res?: ServerResponse;
      environmentVariables?: Record<string, string>; // New option for environment variables
    }
  ): Promise<string> {
    // Create a new connection
    const connection = this.connectionManager.createConnection(connectionConfig);
    const id = connection.id;
    
    try {
      // Get the server
      const server = this.serverRegistry.getServer(connectionConfig.serverId);
      
      // If environment variables are provided, update them
      if (options?.environmentVariables) {
        const needsRestart = this.serverRegistry.updateServerEnvironment(
          connectionConfig.serverId, 
          options.environmentVariables
        );
        
        // If server is running and needs restart, handle it
        if (needsRestart && server.status === ServerStatus.RUNNING) {
          await this.stopServer(connectionConfig.serverId);
          await this.startServer(connectionConfig.serverId);
        }
      }
      
      // Check if server is running, start if not
      if (server.status !== ServerStatus.RUNNING) {
        await this.startServer(connectionConfig.serverId);
      }
      
      logger.info(`Connecting to server: ${server.config.name} (${connectionConfig.serverId})`);
      
      // Update connection status
      this.connectionManager.updateConnectionStatus(id, ConnectionStatus.CONNECTING);
      
      // Create client and server adapters based on transport types
      const clientTransport = connectionConfig.transport;
      const serverTransport = server.config.transport;
      
      // Create bridge handler based on transport types
      let bridgeHandler: BridgeHandler;
      
      if (clientTransport === "stdio" && serverTransport === "sse") {
        // Stdio client to SSE server
        if (!options?.endpoint || !options?.res) {
          throw new ConnectionError(
            ErrorCode.INVALID_CONFIGURATION,
            "Endpoint and response object are required for SSE server",
            id
          );
        }
        
        const serverAdapter = createServerAdapter("sse", {
          config: server.config,
          endpoint: options.endpoint,
          res: options.res
        });
        
        const clientAdapter = createClientAdapter("stdio", {
          serverProcess: server.process
        });
        
        bridgeHandler = createStdioToSSEHandler(clientAdapter, serverAdapter);
      } else if (clientTransport === "sse" && serverTransport === "stdio") {
        // SSE client to Stdio server
        if (!server.process) {
          throw new ServerError(
            ErrorCode.SERVER_NOT_FOUND,
            `Server ${connectionConfig.serverId} process not found`,
            connectionConfig.serverId
          );
        }
        
        const serverAdapter = createServerAdapter("stdio", {
          config: server.config
        });
        
        const clientAdapter = createClientAdapter("sse", {
          url: new URL(options?.endpoint || "/", "http://localhost")
        });
        
        bridgeHandler = createSSEToStdioHandler(clientAdapter, serverAdapter);
      } else if (clientTransport === "memory" && serverTransport === "memory") {
        // Memory client to Memory server
        // Create a pair of linked in-memory transports
        const [clientMemory, serverMemory] = createLinkedInMemoryTransports();
        
        const clientAdapter = createClientAdapter("memory", {
          otherTransport: clientMemory
        });
        
        const serverAdapter = createServerAdapter("memory", {
          config: server.config,
          otherTransport: serverMemory
        });
        
        bridgeHandler = createMemoryToMemoryHandler(clientAdapter, serverAdapter);
      } else if (clientTransport === serverTransport) {
        // Direct connection (same transport type)
        throw new ConnectionError(
          ErrorCode.INVALID_CONFIGURATION,
          `Direct connection with same transport type (${clientTransport}) is not supported by the bridge`,
          id
        );
      } else {
        throw new ConnectionError(
          ErrorCode.INVALID_CONFIGURATION,
          `Unsupported transport combination: ${clientTransport} to ${serverTransport}`,
          id
        );
      }
      
      // Start the bridge
      await bridgeHandler.start();
      
      // Store the bridge
      this.bridges.set(id, bridgeHandler);
      
      // Update connection status
      this.connectionManager.updateConnectionStatus(id, ConnectionStatus.CONNECTED);
      
      // Reset reconnect count
      this.connectionManager.resetReconnectCount(id);
      
      logger.info(`Connected to server: ${server.config.name} (${connectionConfig.serverId})`);
      
      return id;
    } catch (error) {
      logger.error(`Failed to connect to server: ${connectionConfig.serverId}`, error);
      
      // Update connection status
      this.connectionManager.updateConnectionStatus(id, ConnectionStatus.ERROR, error as Error);
      
      // Remove the connection if it failed
      try {
        this.connectionManager.removeConnection(id);
      } catch (removeError) {
        logger.error(`Failed to remove connection: ${id}`, removeError);
      }
      
      throw new ConnectionError(
        ErrorCode.CONNECTION_FAILED,
        `Failed to connect to server: ${connectionConfig.serverId}`,
        id,
        error
      );
    }
  }
  
  /**
   * Disconnect a connection
   */
  async disconnectConnection(id: string): Promise<void> {
    const connection = this.connectionManager.getConnection(id);
    
    if (connection.status === ConnectionStatus.DISCONNECTED) {
      logger.warn(`Connection ${id} is already disconnected`);
      return;
    }
    
    if (connection.status === ConnectionStatus.DISCONNECTING) {
      logger.warn(`Connection ${id} is already disconnecting`);
      return;
    }
    
    logger.info(`Disconnecting connection: ${connection.config.name || id} (${id})`);
    
    try {
      // Update connection status
      this.connectionManager.updateConnectionStatus(id, ConnectionStatus.DISCONNECTING);
      
      // Stop the bridge
      const bridge = this.bridges.get(id);
      
      if (bridge) {
        await bridge.stop();
        this.bridges.delete(id);
      }
      
      // Update connection status
      this.connectionManager.updateConnectionStatus(id, ConnectionStatus.DISCONNECTED);
      
      // Update connection transport
      this.connectionManager.updateConnectionTransport(id, undefined);
      
      logger.info(`Disconnected connection: ${connection.config.name || id} (${id})`);
    } catch (error) {
      logger.error(`Failed to disconnect connection: ${connection.config.name || id} (${id})`, error);
      
      // Update connection status
      this.connectionManager.updateConnectionStatus(id, ConnectionStatus.ERROR, error as Error);
      
      throw new ConnectionError(
        ErrorCode.CONNECTION_FAILED,
        `Failed to disconnect connection: ${connection.config.name || id} (${id})`,
        id,
        error
      );
    }
  }
  
  /**
   * Handle an SSE POST message
   */
  async handleSSEPostMessage(
    connectionId: string,
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody?: unknown
  ): Promise<void> {
    const bridge = this.bridges.get(connectionId);
    
    if (!bridge) {
      throw new ConnectionError(
        ErrorCode.CONNECTION_NOT_FOUND,
        `Bridge for connection ${connectionId} not found`,
        connectionId
      );
    }
    
    // Forward the message to the bridge
    await bridge.handleClientMessage(parsedBody as any);
    
    // Send a success response
    res.writeHead(202).end("Accepted");
  }
}

/**
 * Create a bridge manager
 */
export function createBridgeManager(options: BridgeManagerOptions): BridgeManager {
  return new BridgeManager(options);
}
