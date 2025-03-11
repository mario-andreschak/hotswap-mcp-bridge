/**
 * Stdio to SSE protocol handler
 */
import { createLogger } from "../utils/logging.js";
import { BaseProtocolHandler } from "./base.js";
import { TransportAdapter } from "../bridge/types.js";

const logger = createLogger({ prefix: "StdioToSSE" });

/**
 * Stdio to SSE protocol handler
 * 
 * This handler bridges between a stdio client and an SSE server.
 * It allows clients that only support stdio to connect to servers that use SSE.
 */
export class StdioToSSEHandler extends BaseProtocolHandler {
  /**
   * Constructor
   */
  constructor(
    clientAdapter: TransportAdapter,
    serverAdapter: TransportAdapter
  ) {
    super("StdioToSSE");
    
    logger.debug("Creating stdio-to-sse handler");
    
    this.setClientAdapter(clientAdapter);
    this.setServerAdapter(serverAdapter);
  }
}

/**
 * Create a stdio-to-sse handler
 */
export function createStdioToSSEHandler(
  clientAdapter: TransportAdapter,
  serverAdapter: TransportAdapter
): StdioToSSEHandler {
  return new StdioToSSEHandler(clientAdapter, serverAdapter);
}
