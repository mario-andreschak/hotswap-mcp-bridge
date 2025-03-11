/**
 * Server routes for the MCP Transport Bridge API
 */
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createLogger } from "../../utils/logging.js";
import { ApiError, ErrorCode, ValidationError } from "../../utils/errors.js";
import { ServerRegistry } from "../../bridge/registry.js";
import { BridgeManager } from "../../bridge/manager.js";
import { ServerConfig, ServerStatus } from "../../bridge/types.js";

const logger = createLogger({ prefix: "ServersRoutes" });

/**
 * Server creation schema
 */
const ServerCreateSchema = z.object({
  name: z.string().min(1).max(100),
  version: z.string().default("1.0.0"), // Required by Implementation interface
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  transport: z.enum(["stdio", "sse", "memory"]),
  sseOptions: z.object({
    port: z.number().int().positive().optional(),
    host: z.string().optional()
  }).optional(),
  autoRestart: z.boolean().optional(),
  maxRestarts: z.number().int().nonnegative().optional(),
  restartDelay: z.number().int().nonnegative().optional()
});

/**
 * Server update schema
 */
const ServerUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  version: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  sseOptions: z.object({
    port: z.number().int().positive().optional(),
    host: z.string().optional()
  }).optional(),
  autoRestart: z.boolean().optional(),
  maxRestarts: z.number().int().nonnegative().optional(),
  restartDelay: z.number().int().nonnegative().optional()
});

/**
 * Create server routes
 */
export function serversRoutes(
  serverRegistry: ServerRegistry,
  bridgeManager: BridgeManager
): Router {
  const router = Router();
  
  /**
   * List all servers
   */
  router.get("/", (req: Request, res: Response, next: NextFunction) => {
    try {
      const servers = serverRegistry.getAllServers();
      
      res.status(200).json({
        servers: servers.map(server => ({
          id: server.id,
          name: server.config.name,
          transport: server.config.transport,
          status: server.status,
          startTime: server.startTime,
          error: server.error?.message
        }))
      });
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * Get server details
   */
  router.get("/:id", (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const server = serverRegistry.getServer(id);
      
      res.status(200).json({
        id: server.id,
        config: server.config,
        status: server.status,
        startTime: server.startTime,
        error: server.error?.message
      });
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * Create a new server
   */
  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const validationResult = ServerCreateSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const errors: Record<string, string[]> = {};
        
        validationResult.error.errors.forEach(error => {
          const path = error.path.join(".");
          if (!errors[path]) {
            errors[path] = [];
          }
          errors[path].push(error.message);
        });
        
        throw new ValidationError("Invalid server configuration", errors);
      }
      
      // Create server
      const config: ServerConfig = validationResult.data;
      const server = serverRegistry.registerServer(config);
      
      res.status(201).json({
        id: server.id,
        config: server.config,
        status: server.status
      });
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * Update a server
   */
  router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      // Get existing server
      const server = serverRegistry.getServer(id);
      
      // Validate request body
      const validationResult = ServerUpdateSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const errors: Record<string, string[]> = {};
        
        validationResult.error.errors.forEach(error => {
          const path = error.path.join(".");
          if (!errors[path]) {
            errors[path] = [];
          }
          errors[path].push(error.message);
        });
        
        throw new ValidationError("Invalid server configuration", errors);
      }
      
      // Update server config
      const updates = validationResult.data;
      
      // Check if server is running
      if (server.status !== ServerStatus.STOPPED) {
        throw new ApiError(
          ErrorCode.SERVER_STOP_FAILED,
          "Cannot update server configuration while server is running",
          400
        );
      }
      
      // Update config
      server.config = {
        ...server.config,
        ...updates
      };
      
      res.status(200).json({
        id: server.id,
        config: server.config,
        status: server.status
      });
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * Delete a server
   */
  router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      // Get existing server
      const server = serverRegistry.getServer(id);
      
      // Check if server is running
      if (server.status !== ServerStatus.STOPPED) {
        // Stop the server
        await bridgeManager.stopServer(id);
      }
      
      // Unregister server
      serverRegistry.unregisterServer(id);
      
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * Start a server
   */
  router.post("/:id/start", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      // Start server
      await bridgeManager.startServer(id);
      
      // Get updated server
      const server = serverRegistry.getServer(id);
      
      res.status(200).json({
        id: server.id,
        status: server.status,
        startTime: server.startTime
      });
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * Stop a server
   */
  router.post("/:id/stop", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      // Stop server
      await bridgeManager.stopServer(id);
      
      // Get updated server
      const server = serverRegistry.getServer(id);
      
      res.status(200).json({
        id: server.id,
        status: server.status
      });
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * Update server environment variables
   */
  router.post("/:id/environment", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      // Validate request body
      if (!req.body || typeof req.body !== 'object') {
        throw new ValidationError("Invalid environment variables", { 
          body: ["Must be an object"] 
        });
      }
      
      // Update environment variables
      await bridgeManager.updateServerEnvironment(id, req.body);
      
      // Get updated server
      const server = serverRegistry.getServer(id);
      
      res.status(200).json({
        id: server.id,
        env: server.config.env,
        status: server.status
      });
    } catch (error) {
      next(error);
    }
  });
  
  return router;
}
