/**
 * SSE transport adapter
 */
import { IncomingMessage, ServerResponse } from "node:http";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createLogger } from "../utils/logging.js";
import { ErrorCode, TransportError } from "../utils/errors.js";
import { BaseTransportAdapter } from "./base.js";
import { ServerConfig } from "../bridge/types.js";

const logger = createLogger({ prefix: "SSEAdapter" });

/**
 * SSE client adapter options
 */
export interface SSEClientAdapterOptions {
  url: URL;
}

/**
 * SSE client adapter
 */
export class SSEClientAdapter extends BaseTransportAdapter {
  private url: URL;
  
  /**
   * Constructor
   */
  constructor(options: SSEClientAdapterOptions) {
    super("SSEClient");
    this.url = options.url;
  }
  
  /**
   * Start the transport
   */
  async start(): Promise<void> {
    if (this.transport) {
      return;
    }
    
    logger.debug(`Starting SSE client transport for URL: ${this.url.href}`);
    
    try {
      // Create an SSE client transport
      const clientTransport = new SSEClientTransport(this.url);
      
      this.transport = clientTransport;
      this.setupTransportHandlers();
      
      // Start the transport
      await this.transport.start();
      
      logger.info(`SSE client transport started for URL: ${this.url.href}`);
    } catch (error) {
      logger.error(`Failed to start SSE client transport for URL: ${this.url.href}`, error);
      throw new TransportError(
        ErrorCode.TRANSPORT_ERROR,
        `Failed to start SSE client transport for URL: ${this.url.href}`,
        "sse",
        error
      );
    }
  }
}

/**
 * SSE server adapter options
 */
export interface SSEServerAdapterOptions {
  config: ServerConfig;
  endpoint: string;
  res: ServerResponse;
}

/**
 * SSE server adapter
 */
export class SSEServerAdapter extends BaseTransportAdapter {
  private config: ServerConfig;
  private endpoint: string;
  private res: ServerResponse;
  protected sessionId?: string;
  
  /**
   * Constructor
   */
  constructor(options: SSEServerAdapterOptions) {
    super("SSEServer");
    this.config = options.config;
    this.endpoint = options.endpoint;
    this.res = options.res;
  }
  
  /**
   * Start the transport
   */
  async start(): Promise<void> {
    if (this.transport) {
      return;
    }
    
    logger.debug(`Starting SSE server transport for endpoint: ${this.endpoint}`);
    
    try {
      // Create an SSE server transport
      const serverTransport = new SSEServerTransport(this.endpoint, this.res);
      
      this.transport = serverTransport;
      this.setupTransportHandlers();
      
      // Start the transport
      await this.transport.start();
      
      // Store the session ID
      this.sessionId = (serverTransport as SSEServerTransport).sessionId;
      
      logger.info(`SSE server transport started for endpoint: ${this.endpoint}`);
      logger.debug(`SSE session ID: ${this.sessionId}`);
    } catch (error) {
      logger.error(`Failed to start SSE server transport for endpoint: ${this.endpoint}`, error);
      throw new TransportError(
        ErrorCode.TRANSPORT_ERROR,
        `Failed to start SSE server transport for endpoint: ${this.endpoint}`,
        "sse",
        error
      );
    }
  }
  
  /**
   * Handle a POST message
   */
  async handlePostMessage(req: IncomingMessage, res: ServerResponse, parsedBody?: unknown): Promise<void> {
    if (!this.transport) {
      throw new Error("Transport not started");
    }
    
    const sseTransport = this.transport as SSEServerTransport;
    await sseTransport.handlePostMessage(req, res, parsedBody);
  }
  
  /**
   * Get the session ID
   */
  getSessionId(): string | undefined {
    return this.sessionId;
  }
}
