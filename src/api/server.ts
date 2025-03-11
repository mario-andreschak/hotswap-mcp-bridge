/**
 * Express server for the MCP Transport Bridge API
 */
import express, { Request, Response, NextFunction, Application } from "express";
import { Server } from "node:http";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { createLogger } from "../utils/logging.js";
import { ApiError, ErrorCode } from "../utils/errors.js";
import { ServerRegistry } from "../bridge/registry.js";
import { ConnectionManager } from "../bridge/connection.js";
import { BridgeManager } from "../bridge/manager.js";
import { createRoutes } from "./routes/index.js";

const logger = createLogger({ prefix: "ApiServer" });

/**
 * API server options
 */
export interface ApiServerOptions {
  port: number;
  host?: string;
  serverRegistry: ServerRegistry;
  connectionManager: ConnectionManager;
  bridgeManager: BridgeManager;
}

/**
 * API server for the MCP Transport Bridge
 */
export class ApiServer {
  private app: express.Application;
  private port: number;
  private host?: string;
  private serverRegistry: ServerRegistry;
  private connectionManager: ConnectionManager;
  private bridgeManager: BridgeManager;
  private server?: Server;
  
  /**
   * Constructor
   */
  constructor(options: ApiServerOptions) {
    this.port = options.port;
    this.host = options.host;
    this.serverRegistry = options.serverRegistry;
    this.connectionManager = options.connectionManager;
    this.bridgeManager = options.bridgeManager;
    
    // Create Express app
    this.app = express();
    
    // Configure middleware
    this.configureMiddleware();
    
    // Configure routes
    this.configureRoutes();
    
    // Configure error handling
    this.configureErrorHandling();
  }
  
  /**
   * Configure middleware
   */
  private configureMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Enable CORS
    this.app.use(cors());
    
    // Add rate limiting
    this.app.use(
      rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        standardHeaders: true,
        legacyHeaders: false,
      })
    );
    
    // Add request logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.url}`);
      next();
    });
  }
  
  /**
   * Configure routes
   */
  private configureRoutes(): void {
    // Create API routes
    const apiRoutes = createRoutes(
      this.serverRegistry,
      this.connectionManager,
      this.bridgeManager
    );
    
    // Mount API routes
    this.app.use("/api", apiRoutes);
    
    // Health check
    this.app.get("/health", (req, res) => {
      res.status(200).json({ status: "ok" });
    });
    
    // 404 handler
    this.app.use((req, res, next) => {
      next(new ApiError(
        ErrorCode.API_ERROR,
        `Not found: ${req.method} ${req.url}`,
        404
      ));
    });
  }
  
  /**
   * Configure error handling
   */
  private configureErrorHandling(): void {
    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error(`API error: ${err.message}`, err);
      
      if (err instanceof ApiError) {
        res.status(err.statusCode).json({
          error: {
            code: err.code,
            message: err.message
          }
        });
      } else {
        res.status(500).json({
          error: {
            code: ErrorCode.API_ERROR,
            message: "Internal server error"
          }
        });
      }
    });
  }
  
  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      const callback = () => {
        logger.info(`API server listening on ${this.host || "localhost"}:${this.port}`);
        resolve();
      };
      
      if (this.host) {
        this.server = this.app.listen(this.port, this.host, callback);
      } else {
        this.server = this.app.listen(this.port, callback);
      }
    });
  }
  
  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      
      this.server.close((err?: Error) => {
        if (err) {
          reject(err);
        } else {
          logger.info("API server stopped");
          resolve();
        }
      });
    });
  }
  
  /**
   * Get the Express app
   */
  getApp(): express.Application {
    return this.app;
  }
}

/**
 * Create an API server
 */
export function createApiServer(options: ApiServerOptions): ApiServer {
  return new ApiServer(options);
}
