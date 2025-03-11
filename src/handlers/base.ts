/**
 * Base protocol handler
 */
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { createLogger } from "../utils/logging.js";
import { BridgeHandler, MessageHandler, TransportAdapter } from "../bridge/types.js";

const logger = createLogger({ prefix: "BaseHandler" });

/**
 * Base protocol handler implementation
 */
export abstract class BaseProtocolHandler implements BridgeHandler {
  protected clientAdapter?: TransportAdapter;
  protected serverAdapter?: TransportAdapter;
  
  /**
   * Constructor
   */
  constructor(protected readonly name: string) {}
  
  /**
   * Set the client adapter
   */
  setClientAdapter(adapter: TransportAdapter): void {
    this.clientAdapter = adapter;
    
    // Set up message handler
    adapter.setMessageHandler(this.handleClientMessage.bind(this));
    
    // Set up error handler
    adapter.setErrorHandler((error) => {
      logger.error(`Error on client adapter (${this.name}):`, error);
    });
    
    // Set up close handler
    adapter.setCloseHandler(() => {
      logger.info(`Client adapter closed (${this.name})`);
    });
  }
  
  /**
   * Set the server adapter
   */
  setServerAdapter(adapter: TransportAdapter): void {
    this.serverAdapter = adapter;
    
    // Set up message handler
    adapter.setMessageHandler(this.handleServerMessage.bind(this));
    
    // Set up error handler
    adapter.setErrorHandler((error) => {
      logger.error(`Error on server adapter (${this.name}):`, error);
    });
    
    // Set up close handler
    adapter.setCloseHandler(() => {
      logger.info(`Server adapter closed (${this.name})`);
    });
  }
  
  /**
   * Start the bridge
   */
  async start(): Promise<void> {
    if (!this.clientAdapter || !this.serverAdapter) {
      throw new Error(`Both client and server adapters must be set for ${this.name}`);
    }
    
    logger.info(`Starting bridge handler: ${this.name}`);
    
    // Start the adapters
    await this.serverAdapter.start();
    await this.clientAdapter.start();
    
    logger.info(`Bridge handler started: ${this.name}`);
  }
  
  /**
   * Stop the bridge
   */
  async stop(): Promise<void> {
    logger.info(`Stopping bridge handler: ${this.name}`);
    
    // Stop the adapters
    if (this.clientAdapter) {
      await this.clientAdapter.stop();
    }
    
    if (this.serverAdapter) {
      await this.serverAdapter.stop();
    }
    
    logger.info(`Bridge handler stopped: ${this.name}`);
  }
  
  /**
   * Handle a message from the client
   */
  async handleClientMessage(message: JSONRPCMessage): Promise<void> {
    if (!this.serverAdapter) {
      throw new Error("Server adapter not set");
    }
    
    logger.debug(`Forwarding message from client to server (${this.name}):`, message);
    
    // Forward the message to the server
    await this.serverAdapter.send(message);
  }
  
  /**
   * Handle a message from the server
   */
  async handleServerMessage(message: JSONRPCMessage): Promise<void> {
    if (!this.clientAdapter) {
      throw new Error("Client adapter not set");
    }
    
    logger.debug(`Forwarding message from server to client (${this.name}):`, message);
    
    // Forward the message to the client
    await this.clientAdapter.send(message);
  }
}
