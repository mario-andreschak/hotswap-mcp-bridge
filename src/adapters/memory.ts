/**
 * In-memory transport adapter
 */
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLogger } from "../utils/logging.js";
import { ErrorCode, TransportError } from "../utils/errors.js";
import { BaseTransportAdapter } from "./base.js";

const logger = createLogger({ prefix: "MemoryAdapter" });

/**
 * In-memory adapter options
 */
export interface InMemoryAdapterOptions {
  otherTransport?: InMemoryTransport;
  sessionId?: string;
}

/**
 * In-memory adapter
 */
export class InMemoryAdapter extends BaseTransportAdapter {
  private otherTransport?: InMemoryTransport;
  public sessionId?: string;
  
  /**
   * Constructor
   */
  constructor(options?: InMemoryAdapterOptions) {
    super("InMemory");
    this.otherTransport = options?.otherTransport;
    this.sessionId = options?.sessionId;
  }
  
  /**
   * Start the transport
   */
  async start(): Promise<void> {
    if (this.transport) {
      return;
    }
    
    logger.debug("Starting in-memory transport");
    
    try {
      // Create an in-memory transport
      const transport = this.otherTransport || new InMemoryTransport();
      
      // Set the session ID if provided
      if (this.sessionId) {
        transport.sessionId = this.sessionId;
      }
      
      this.transport = transport;
      this.setupTransportHandlers();
      
      // Start the transport
      await this.transport.start();
      
      logger.info("In-memory transport started");
    } catch (error) {
      logger.error("Failed to start in-memory transport", error);
      throw new TransportError(
        ErrorCode.TRANSPORT_ERROR,
        "Failed to start in-memory transport",
        "memory",
        error
      );
    }
  }
  
  /**
   * Get the underlying InMemoryTransport
   */
  getInMemoryTransport(): InMemoryTransport | undefined {
    return this.transport as InMemoryTransport;
  }
}
