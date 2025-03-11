/**
 * Transport adapter factory
 */
import { IncomingMessage, ServerResponse } from "node:http";
import { ChildProcess } from "node:child_process";
import { createLogger } from "../utils/logging.js";
import { ErrorCode, TransportError } from "../utils/errors.js";
import { ServerConfig, TransportType } from "../bridge/types.js";
import { TransportAdapter } from "../bridge/types.js";
import { StdioClientAdapter, StdioServerAdapter } from "./stdio.js";
import { SSEClientAdapter, SSEServerAdapter } from "./sse.js";
import { InMemoryAdapter, InMemoryAdapterOptions } from "./memory.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const logger = createLogger({ prefix: "AdapterFactory" });

/**
 * Create a client adapter
 */
export function createClientAdapter(
  transportType: TransportType,
  options: {
    serverProcess?: ChildProcess;
    url?: URL;
    otherTransport?: InMemoryTransport;
    sessionId?: string;
  }
): TransportAdapter {
  logger.debug(`Creating client adapter for transport type: ${transportType}`);
  
  switch (transportType) {
    case "stdio":
      if (!options.serverProcess) {
        throw new TransportError(
          ErrorCode.INVALID_CONFIGURATION,
          "Server process is required for stdio client adapter",
          "stdio"
        );
      }
      
      return new StdioClientAdapter({
        serverProcess: options.serverProcess
      });
      
    case "sse":
      if (!options.url) {
        throw new TransportError(
          ErrorCode.INVALID_CONFIGURATION,
          "URL is required for SSE client adapter",
          "sse"
        );
      }
      
      return new SSEClientAdapter({
        url: options.url
      });
      
    case "memory":
      return new InMemoryAdapter({
        otherTransport: options.otherTransport,
        sessionId: options.sessionId
      });
      
    default:
      throw new TransportError(
        ErrorCode.TRANSPORT_NOT_SUPPORTED,
        `Transport type not supported: ${transportType}`,
        transportType
      );
  }
}

/**
 * Create a server adapter
 */
export function createServerAdapter(
  transportType: TransportType,
  options: {
    config: ServerConfig;
    endpoint?: string;
    res?: ServerResponse;
    otherTransport?: InMemoryTransport;
    sessionId?: string;
  }
): TransportAdapter {
  logger.debug(`Creating server adapter for transport type: ${transportType}`);
  
  switch (transportType) {
    case "stdio":
      return new StdioServerAdapter({
        config: options.config
      });
      
    case "sse":
      if (!options.endpoint || !options.res) {
        throw new TransportError(
          ErrorCode.INVALID_CONFIGURATION,
          "Endpoint and response object are required for SSE server adapter",
          "sse"
        );
      }
      
      // Create the adapter and cast it to TransportAdapter
      return new SSEServerAdapter({
        config: options.config,
        endpoint: options.endpoint,
        res: options.res
      }) as unknown as TransportAdapter;
      
    case "memory":
      return new InMemoryAdapter({
        otherTransport: options.otherTransport,
        sessionId: options.sessionId
      });
      
    default:
      throw new TransportError(
        ErrorCode.TRANSPORT_NOT_SUPPORTED,
        `Transport type not supported: ${transportType}`,
        transportType
      );
  }
}

/**
 * Handle a POST message for an SSE server adapter
 */
export async function handleSSEPostMessage(
  adapter: SSEServerAdapter,
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody?: unknown
): Promise<void> {
  await adapter.handlePostMessage(req, res, parsedBody);
}

/**
 * Get the session ID for an SSE server adapter
 */
export function getSSESessionId(adapter: SSEServerAdapter): string | undefined {
  return adapter.getSessionId();
}

/**
 * Get the process for a stdio server adapter
 */
export function getStdioProcess(adapter: TransportAdapter): ChildProcess | undefined {
  if (adapter instanceof StdioServerAdapter) {
    return adapter.getProcess();
  }
  
  return undefined;
}

/**
 * Get the InMemoryTransport from an InMemoryAdapter
 */
export function getInMemoryTransport(adapter: TransportAdapter): InMemoryTransport | undefined {
  if (adapter instanceof InMemoryAdapter) {
    return adapter.getInMemoryTransport();
  }
  
  return undefined;
}

/**
 * Create a pair of linked in-memory transports
 */
export function createLinkedInMemoryTransports(): [InMemoryTransport, InMemoryTransport] {
  return InMemoryTransport.createLinkedPair();
}
