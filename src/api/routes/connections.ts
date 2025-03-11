/**
 * Connection routes for the MCP Transport Bridge API
 */
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createLogger } from "../../utils/logging.js";
import { ValidationError } from "../../utils/errors.js";
import { ConnectionManager } from "../../bridge/connection.js";
import { BridgeManager } from "../../bridge/manager.js";
import { ConnectionConfig, ConnectionStatus } from "../../bridge/types.js";

const logger = createLogger({ prefix: "ConnectionsRoutes" });

/**
 * Connection creation schema
 */
const ConnectionCreateSchema = z.object({
  name: z.string().min(1).max(100).default("Connection"), // Required by Implementation interface
  version: z.string().default("1.0.0"), // Required by Implementation interface
  serverId: z.string().uuid(),
  transport: z.enum(["stdio", "sse", "memory"]),
  timeout: z.number().int().positive().optional(),
  reconnect: z.boolean().optional(),
  maxReconnects: z.number().int().nonnegative().optional(),
  reconnectDelay: z.number().int().nonnegative().optional()
});

/**
 * Create connection routes
 */
export function connectionsRoutes(
  connectionManager: ConnectionManager,
  bridgeManager: BridgeManager
): Router {
  const router = Router();
  
  /**
   * List all connections
   */
  router.get("/", (req: Request, res: Response, next: NextFunction) => {
    try {
      const connections = connectionManager.getAllConnections();
      
      res.status(200).json({
        connections: connections.map(connection => ({
          id: connection.id,
          name: connection.config.name,
          serverId: connection.config.serverId,
          transport: connection.config.transport,
          status: connection.status,
          connectTime: connection.connectTime,
          error: connection.error?.message
        }))
      });
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * Get connection details
   */
  router.get("/:id", (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const connection = connectionManager.getConnection(id);
      
      res.status(200).json({
        id: connection.id,
        config: connection.config,
        status: connection.status,
        connectTime: connection.connectTime,
        error: connection.error?.message
      });
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * Create a new connection
   */
  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const validationResult = ConnectionCreateSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const errors: Record<string, string[]> = {};
        
        validationResult.error.errors.forEach(error => {
          const path = error.path.join(".");
          if (!errors[path]) {
            errors[path] = [];
          }
          errors[path].push(error.message);
        });
        
        throw new ValidationError("Invalid connection configuration", errors);
      }
      
      // Create connection
      const config: ConnectionConfig = validationResult.data;
      
      // Connect to server
      const connectionId = await bridgeManager.connectToServer(config);
      
      // Get connection
      const connection = connectionManager.getConnection(connectionId);
      
      res.status(201).json({
        id: connection.id,
        config: connection.config,
        status: connection.status,
        connectTime: connection.connectTime
      });
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * Delete a connection
   */
  router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      // Get existing connection
      const connection = connectionManager.getConnection(id);
      
      // Check if connection is active
      if (connection.status !== ConnectionStatus.DISCONNECTED) {
        // Disconnect
        await bridgeManager.disconnectConnection(id);
      }
      
      // Remove connection
      connectionManager.removeConnection(id);
      
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * Disconnect a connection
   */
  router.post("/:id/disconnect", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      // Disconnect
      await bridgeManager.disconnectConnection(id);
      
      // Get updated connection
      const connection = connectionManager.getConnection(id);
      
      res.status(200).json({
        id: connection.id,
        status: connection.status
      });
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * Reconnect a connection
   */
  router.post("/:id/reconnect", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      // Get existing connection
      const connection = connectionManager.getConnection(id);
      
      // Check if connection is disconnected
      if (connection.status !== ConnectionStatus.DISCONNECTED) {
        // Disconnect first
        await bridgeManager.disconnectConnection(id);
      }
      
      // Connect to server
      await bridgeManager.connectToServer(connection.config);
      
      // Get updated connection
      const updatedConnection = connectionManager.getConnection(id);
      
      res.status(200).json({
        id: updatedConnection.id,
        status: updatedConnection.status,
        connectTime: updatedConnection.connectTime
      });
    } catch (error) {
      next(error);
    }
  });
  
  return router;
}
