/**
 * MCP Transport Bridge
 * 
 * A bridge between different MCP transport protocols
 */
import { createLogger, LogLevel } from "./utils/logging.js";
import { createServerRegistry } from "./bridge/registry.js";
import { createConnectionManager } from "./bridge/connection.js";
import { createBridgeManager } from "./bridge/manager.js";
import { createApiServer } from "./api/server.js";

const logger = createLogger({ prefix: "Main" });

/**
 * Application options
 */
export interface AppOptions {
  port: number;
  host?: string;
  logLevel?: LogLevel;
}

/**
 * Application class
 */
export class App {
  private port: number;
  private host?: string;
  private serverRegistry = createServerRegistry();
  private connectionManager = createConnectionManager();
  private bridgeManager = createBridgeManager({
    serverRegistry: this.serverRegistry,
    connectionManager: this.connectionManager
  });
  private apiServer: ReturnType<typeof createApiServer>;
  
  /**
   * Constructor
   */
  constructor(options: AppOptions) {
    this.port = options.port;
    this.host = options.host;
    
    // Set log level
    if (options.logLevel) {
      logger.setLevel(options.logLevel);
    }
    
    // Create API server
    this.apiServer = createApiServer({
      port: this.port,
      host: this.host,
      serverRegistry: this.serverRegistry,
      connectionManager: this.connectionManager,
      bridgeManager: this.bridgeManager
    });
  }
  
  /**
   * Start the application
   */
  async start(): Promise<void> {
    logger.info("Starting MCP Transport Bridge");
    
    // Start API server
    await this.apiServer.start();
    
    logger.info("MCP Transport Bridge started");
  }
  
  /**
   * Stop the application
   */
  async stop(): Promise<void> {
    logger.info("Stopping MCP Transport Bridge");
    
    // Stop API server
    await this.apiServer.stop();
    
    logger.info("MCP Transport Bridge stopped");
  }
}

/**
 * Create an application
 */
export function createApp(options: AppOptions): App {
  return new App(options);
}

/**
 * Main entry point
 */
if (process.argv[1] === import.meta.url) {
  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST;
  const logLevel = (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;
  
  const app = createApp({
    port,
    host,
    logLevel
  });
  
  app.start().catch((error) => {
    logger.error("Failed to start application", error);
    process.exit(1);
  });
  
  // Handle process signals
  process.on("SIGINT", async () => {
    logger.info("Received SIGINT signal");
    await app.stop();
    process.exit(0);
  });
  
  process.on("SIGTERM", async () => {
    logger.info("Received SIGTERM signal");
    await app.stop();
    process.exit(0);
  });
}
