/**
 * Base transport adapter interface
 */
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createLogger } from "../utils/logging.js";
import { MessageHandler, TransportAdapter } from "../bridge/types.js";

const logger = createLogger({ prefix: "BaseAdapter" });

/**
 * Base transport adapter implementation
 */
export abstract class BaseTransportAdapter implements TransportAdapter {
  protected transport?: Transport;
  protected messageHandler?: MessageHandler;
  protected errorHandler?: (error: Error) => void;
  protected closeHandler?: () => void;
  
  /**
   * Constructor
   */
  constructor(protected readonly name: string) {}
  
  /**
   * Start the transport
   */
  abstract start(): Promise<void>;
  
  /**
   * Stop the transport
   */
  async stop(): Promise<void> {
    if (this.transport) {
      logger.debug(`Stopping transport: ${this.name}`);
      await this.transport.close();
      this.transport = undefined;
    }
  }
  
  /**
   * Close the transport (alias for stop to implement Transport interface)
   */
  async close(): Promise<void> {
    return this.stop();
  }
  
  /**
   * Send a message through the transport
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.transport) {
      throw new Error(`Transport not started: ${this.name}`);
    }
    
    logger.debug(`Sending message through ${this.name}:`, message);
    await this.transport.send(message);
  }
  
  /**
   * Set a message handler
   */
  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
    
    if (this.transport) {
      this.transport.onmessage = async (message) => {
        logger.debug(`Received message on ${this.name}:`, message);
        
        if (this.messageHandler) {
          try {
            await this.messageHandler(message);
          } catch (error) {
            logger.error(`Error handling message on ${this.name}:`, error);
            this.handleError(error as Error);
          }
        }
      };
    }
  }
  
  /**
   * Set an error handler
   */
  setErrorHandler(handler: (error: Error) => void): void {
    this.errorHandler = handler;
    
    if (this.transport) {
      this.transport.onerror = (error) => {
        logger.error(`Error on ${this.name}:`, error);
        this.handleError(error);
      };
    }
  }
  
  /**
   * Set a close handler
   */
  setCloseHandler(handler: () => void): void {
    this.closeHandler = handler;
    
    if (this.transport) {
      this.transport.onclose = () => {
        logger.debug(`Transport closed: ${this.name}`);
        this.handleClose();
      };
    }
  }
  
  /**
   * Handle an error
   */
  protected handleError(error: Error): void {
    if (this.errorHandler) {
      this.errorHandler(error);
    }
  }
  
  /**
   * Handle a close event
   */
  protected handleClose(): void {
    if (this.closeHandler) {
      this.closeHandler();
    }
  }
  
  /**
   * Setup transport event handlers
   */
  protected setupTransportHandlers(): void {
    if (!this.transport) {
      return;
    }
    
    this.transport.onmessage = async (message) => {
      logger.debug(`Received message on ${this.name}:`, message);
      
      if (this.messageHandler) {
        try {
          await this.messageHandler(message);
        } catch (error) {
          logger.error(`Error handling message on ${this.name}:`, error);
          this.handleError(error as Error);
        }
      }
    };
    
    this.transport.onerror = (error) => {
      logger.error(`Error on ${this.name}:`, error);
      this.handleError(error);
    };
    
    this.transport.onclose = () => {
      logger.debug(`Transport closed: ${this.name}`);
      this.handleClose();
    };
  }
}
