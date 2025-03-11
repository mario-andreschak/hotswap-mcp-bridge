/**
 * SSE to Stdio protocol handler
 */
import { createLogger } from "../utils/logging.js";
import { BaseProtocolHandler } from "./base.js";
import { TransportAdapter } from "../bridge/types.js";

const logger = createLogger({ prefix: "SSEToStdio" });

/**
 * SSE to Stdio protocol handler
 * 
 * This handler bridges between an SSE client and a stdio server.
 * It allows clients that only support SSE to connect to servers that use stdio.
 */
export class SSEToStdioHandler extends BaseProtocolHandler {
  /**
   * Constructor
   */
  constructor(
    clientAdapter: TransportAdapter,
    serverAdapter: TransportAdapter
  ) {
    super("SSEToStdio");
    
    logger.debug("Creating sse-to-stdio handler");
    
    this.setClientAdapter(clientAdapter);
    this.setServerAdapter(serverAdapter);
  }
}

/**
 * Create an sse-to-stdio handler
 */
export function createSSEToStdioHandler(
  clientAdapter: TransportAdapter,
  serverAdapter: TransportAdapter
): SSEToStdioHandler {
  return new SSEToStdioHandler(clientAdapter, serverAdapter);
}
