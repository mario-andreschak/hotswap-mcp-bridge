import { Server } from '@modelcontextprotocol/server';
import type { Client, RequestOptions } from '@modelcontextprotocol/client';
import type { BridgeManager } from './manager.js';

/** The upstream SDK owns IDs/envelopes. Never forward caller protocol metadata into the shared child. */
function clean<T extends object>(value: T): T {
  const { _meta: ignoredMeta, resultType: ignoredType, ...rest } = value as T & { _meta?: unknown; resultType?: unknown };
  return rest as T;
}
export function createProxy(manager: BridgeManager, connectionId: string): Server {
  const capabilities = manager.connectionCapabilities(connectionId);
  const server = new Server({ name: 'mcp-transport-bridge', version: '0.2.0' }, { capabilities });
  // Track cancellation through the public API, including numeric id 0 (SDK 2.0.0 ignores it).
  const requests = new Map<string | number, AbortController>();
  server.setNotificationHandler('notifications/cancelled', notification => {
    const id = notification.params?.requestId;
    if (id !== undefined) requests.get(id)?.abort();
  });
  async function forward<T>(id: string | number, signal: AbortSignal, call: (client: Client, options: RequestOptions) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    requests.set(id, controller);
    try { return await manager.request(connectionId, AbortSignal.any([signal, controller.signal]), call); }
    finally { if (requests.get(id) === controller) requests.delete(id); }
  }
  if (capabilities.tools) {
    server.setRequestHandler('tools/list', async (request, context) => clean(await forward(context.mcpReq.id, context.mcpReq.signal,
      (client, options) => client.listTools({ cursor: request.params?.cursor }, options))));
    server.setRequestHandler('tools/call', async (request, context) => {
      try {
        return clean(await forward(context.mcpReq.id, context.mcpReq.signal,
          (client, options) => client.callTool({ name: request.params.name, arguments: request.params.arguments }, options)));
      } catch {
        return { content: [{ type: 'text', text: 'Downstream tool failed, was cancelled, or timed out.' }], isError: true };
      }
    });
  }
  if (capabilities.resources) {
    server.setRequestHandler('resources/list', async (request, context) => clean(await forward(context.mcpReq.id, context.mcpReq.signal,
      (client, options) => client.listResources({ cursor: request.params?.cursor }, options))));
    server.setRequestHandler('resources/templates/list', async (request, context) => clean(await forward(context.mcpReq.id, context.mcpReq.signal,
      (client, options) => client.listResourceTemplates({ cursor: request.params?.cursor }, options))));
    server.setRequestHandler('resources/read', async (request, context) => clean(await forward(context.mcpReq.id, context.mcpReq.signal,
      (client, options) => client.readResource({ uri: request.params.uri }, options))));
  }
  if (capabilities.prompts) {
    server.setRequestHandler('prompts/list', async (request, context) => clean(await forward(context.mcpReq.id, context.mcpReq.signal,
      (client, options) => client.listPrompts({ cursor: request.params?.cursor }, options))));
    server.setRequestHandler('prompts/get', async (request, context) => clean(await forward(context.mcpReq.id, context.mcpReq.signal,
      (client, options) => client.getPrompt({ name: request.params.name, arguments: request.params.arguments }, options))));
  }
  manager.trackFront(connectionId, server);
  return server;
}
