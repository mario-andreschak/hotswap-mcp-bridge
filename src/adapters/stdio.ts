/**
 * Stdio transport adapter
 */
import { ChildProcess } from "node:child_process";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLogger } from "../utils/logging.js";
import { ErrorCode, TransportError } from "../utils/errors.js";
import { spawnProcess } from "../utils/process.js";
import { BaseTransportAdapter } from "./base.js";
import { ServerConfig } from "../bridge/types.js";

const logger = createLogger({ prefix: "StdioAdapter" });

/**
 * Stdio client adapter options
 */
export interface StdioClientAdapterOptions {
  serverProcess: ChildProcess;
}

/**
 * Stdio client adapter
 */
export class StdioClientAdapter extends BaseTransportAdapter {
  private serverProcess: ChildProcess;
  
  /**
   * Constructor
   */
  constructor(options: StdioClientAdapterOptions) {
    super("StdioClient");
    this.serverProcess = options.serverProcess;
  }
  
  /**
   * Start the transport
   */
  async start(): Promise<void> {
    if (this.transport) {
      return;
    }
    
    logger.debug("Starting stdio client transport");
    
    try {
      // Create a stdio client transport that connects to the server process
      const clientTransport = new StdioClientTransport({
        command: "dummy", // Not used since we're providing the process directly
        args: [],
      });
      
      // Hack: Replace the _process property with our server process
      // This is a workaround since StdioClientTransport doesn't have a constructor
      // that accepts an existing process
      (clientTransport as any)._process = this.serverProcess;
      
      this.transport = clientTransport;
      this.setupTransportHandlers();
      
      // Start the transport
      await this.transport.start();
      
      logger.info("Stdio client transport started");
    } catch (error) {
      logger.error("Failed to start stdio client transport", error);
      throw new TransportError(
        ErrorCode.TRANSPORT_ERROR,
        "Failed to start stdio client transport",
        "stdio",
        error
      );
    }
  }
}

/**
 * Stdio server adapter options
 */
export interface StdioServerAdapterOptions {
  config: ServerConfig;
}

/**
 * Stdio server adapter
 */
export class StdioServerAdapter extends BaseTransportAdapter {
  private config: ServerConfig;
  private process?: ChildProcess;
  
  /**
   * Constructor
   */
  constructor(options: StdioServerAdapterOptions) {
    super("StdioServer");
    this.config = options.config;
  }
  
  /**
   * Start the transport
   */
  async start(): Promise<void> {
    if (this.transport) {
      return;
    }
    
    logger.debug(`Starting stdio server transport for: ${this.config.command}`);
    
    try {
      // Spawn the server process
      this.process = spawnProcess({
        command: this.config.command,
        args: this.config.args,
        cwd: this.config.cwd,
        env: this.config.env,
      });
      
      // Create a stdio server transport
      const serverTransport = new StdioServerTransport();
      
      // Note: The StdioServerTransport by default uses process.stdin and process.stdout
      // We don't need to pass them explicitly
      
      this.transport = serverTransport;
      this.setupTransportHandlers();
      
      // Start the transport
      await this.transport.start();
      
      logger.info(`Stdio server transport started for: ${this.config.command}`);
    } catch (error) {
      logger.error(`Failed to start stdio server transport for: ${this.config.command}`, error);
      throw new TransportError(
        ErrorCode.TRANSPORT_ERROR,
        `Failed to start stdio server transport for: ${this.config.command}`,
        "stdio",
        error
      );
    }
  }
  
  /**
   * Stop the transport
   */
  async stop(): Promise<void> {
    await super.stop();
    
    if (this.process) {
      // The process will be terminated by the server registry
      this.process = undefined;
    }
  }
  
  /**
   * Get the server process
   */
  getProcess(): ChildProcess | undefined {
    return this.process;
  }
}
