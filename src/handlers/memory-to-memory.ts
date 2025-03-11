/**
 * Memory-to-memory protocol handler
 */
import { createLogger } from "../utils/logging.js";
import { BaseProtocolHandler } from "./base.js";
import { TransportAdapter } from "../bridge/types.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const logger = createLogger({ prefix: "MemoryToMemory" });

/**
 * Memory-to-memory protocol handler
 * 
 * This handler bridges between two in-memory transports.
 */
export class MemoryToMemoryHandler extends BaseProtocolHandler {
  /**
   * Constructor
   */
  constructor(
    clientAdapter: TransportAdapter,
    serverAdapter: TransportAdapter
  ) {
    super("MemoryToMemory");
    
    logger.debug("Creating memory-to-memory handler");
    
    this.setClientAdapter(clientAdapter);
    this.setServerAdapter(serverAdapter);
  }
}

/**
 * Create a memory-to-memory handler
 */
export function createMemoryToMemoryHandler(
  clientAdapter: TransportAdapter,
  serverAdapter: TransportAdapter
): MemoryToMemoryHandler {
  return new MemoryToMemoryHandler(clientAdapter, serverAdapter);
}
