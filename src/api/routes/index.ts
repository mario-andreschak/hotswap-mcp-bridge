/**
 * API routes index
 */
import { Router } from "express";
import { serversRoutes } from "./servers.js";
import { connectionsRoutes } from "./connections.js";
import { ServerRegistry } from "../../bridge/registry.js";
import { ConnectionManager } from "../../bridge/connection.js";
import { BridgeManager } from "../../bridge/manager.js";

/**
 * Create API routes
 */
export function createRoutes(
  serverRegistry: ServerRegistry,
  connectionManager: ConnectionManager,
  bridgeManager: BridgeManager
): Router {
  const router = Router();
  
  // Mount routes
  router.use("/servers", serversRoutes(serverRegistry, bridgeManager));
  router.use("/connections", connectionsRoutes(connectionManager, bridgeManager));
  
  return router;
}
