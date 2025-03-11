/**
 * Error handling utilities
 */
import { ErrorCode as SDKErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

/**
 * Error codes for the MCP Transport Bridge
 * Extends the SDK's ErrorCode
 */
export enum ErrorCode {
  // Include all SDK error codes
  // We can't use spread syntax with enums, so we need to manually include the SDK error codes
  ConnectionClosed = SDKErrorCode.ConnectionClosed,
  RequestTimeout = SDKErrorCode.RequestTimeout,
  ParseError = SDKErrorCode.ParseError,
  InvalidRequest = SDKErrorCode.InvalidRequest,
  MethodNotFound = SDKErrorCode.MethodNotFound,
  InvalidParams = SDKErrorCode.InvalidParams,
  InternalError = SDKErrorCode.InternalError,
  
  // Bridge-specific error codes
  // Use numeric values starting at 1000 to avoid conflicts with SDK error codes
  UNKNOWN_ERROR = 1000,
  INVALID_CONFIGURATION = 1001,
  
  // Server errors
  SERVER_NOT_FOUND = 1010,
  SERVER_ALREADY_EXISTS = 1011,
  SERVER_START_FAILED = 1012,
  SERVER_STOP_FAILED = 1013,
  
  // Connection errors
  CONNECTION_NOT_FOUND = 1020,
  CONNECTION_ALREADY_EXISTS = 1021,
  CONNECTION_FAILED = 1022,
  
  // Transport errors
  TRANSPORT_ERROR = 1030,
  TRANSPORT_NOT_SUPPORTED = 1031,
  
  // Protocol errors
  PROTOCOL_ERROR = 1040,
  
  // API errors
  API_ERROR = 1050,
  VALIDATION_ERROR = 1051
}

/**
 * Base error class for the MCP Transport Bridge
 * Extends the SDK's McpError
 */
export class BridgeError extends McpError {
  constructor(
    code: ErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(code, message, cause);
    this.name = "BridgeError";
  }
}

/**
 * Server-related errors
 */
export class ServerError extends BridgeError {
  constructor(
    code: ErrorCode,
    message: string,
    public readonly serverId?: string,
    cause?: unknown
  ) {
    super(code, message, cause);
    this.name = "ServerError";
  }
}

/**
 * Connection-related errors
 */
export class ConnectionError extends BridgeError {
  constructor(
    code: ErrorCode,
    message: string,
    public readonly connectionId?: string,
    cause?: unknown
  ) {
    super(code, message, cause);
    this.name = "ConnectionError";
  }
}

/**
 * Transport-related errors
 */
export class TransportError extends BridgeError {
  constructor(
    code: ErrorCode,
    message: string,
    public readonly transportType?: string,
    cause?: unknown
  ) {
    super(code, message, cause);
    this.name = "TransportError";
  }
}

/**
 * Protocol-related errors
 */
export class ProtocolError extends BridgeError {
  constructor(
    code: ErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(code, message, cause);
    this.name = "ProtocolError";
  }
}

/**
 * API-related errors
 */
export class ApiError extends BridgeError {
  constructor(
    code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    cause?: unknown
  ) {
    super(code, message, cause);
    this.name = "ApiError";
  }
}

/**
 * Validation errors
 */
export class ValidationError extends ApiError {
  constructor(
    message: string,
    public readonly errors: Record<string, string[]>,
    cause?: unknown
  ) {
    super(ErrorCode.VALIDATION_ERROR, message, 400, cause);
    this.name = "ValidationError";
  }
}
