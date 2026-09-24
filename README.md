# MCP Transport Bridge

Run and manage MCP child processes, expose them over authenticated HTTP, and replace their environment without dropping healthy requests. The `mcp-transport-bridge` package also connects an HTTP or explicitly selected legacy SSE MCP server to a stdio-only client.

Requires Node.js 22 or later. Version 0.2 uses the MCP TypeScript SDK 2 and supports the 2026-07-28 protocol plus explicit legacy compatibility. This is a **single-owner administration service**: every holder of its token can execute configured commands and intentionally shares the same downstream servers. It is not a multi-tenant gateway or an OAuth authorization server.

## Start the HTTP service

```sh
npm install mcp-transport-bridge
export MCP_BRIDGE_TOKEN="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
npx mcp-transport-bridge --host 127.0.0.1 --port 3000
```

Use an environment variable or your secret manager for the token. It must contain 32–4096 characters and is required on **every** route, including health checks and MCP requests. The default listener binds to loopback. `HOST` and `PORT` can replace the command-line options. `--port 0` selects an available port; the ready message goes to stderr.

```sh
curl -H "Authorization: Bearer $MCP_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My MCP server","transport":"stdio","command":"node","args":["/absolute/path/server.js"],"env":{"API_KEY":"replace-me"}}' \
  http://127.0.0.1:3000/api/servers
```

Use the returned server ID:

```sh
curl -H "Authorization: Bearer $MCP_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"serverId":"SERVER_UUID","transport":"http"}' \
  http://127.0.0.1:3000/api/connections
```

The response includes an immutable `mcpPath`, such as `/mcp/CONNECTION_UUID`. Connect an MCP HTTP client to that URL with the same bearer header. Each HTTP request is handled by the SDK with its own upstream context; client request IDs are never copied into the shared child.

The service accepts exact local Host headers. Behind a reverse proxy, set `MCP_BRIDGE_ALLOWED_HOSTS=bridge.example.com` and use TLS at that proxy. Browser Origins must also match an exact allowed origin; `MCP_BRIDGE_ALLOWED_ORIGINS=https://console.example.com` adds one. Lists are comma-separated. There are no wildcard origins or permissive CORS responses.

## HTTP or legacy SSE to stdio

Configure your stdio MCP client with:

```json
{
  "mcpServers": {
    "bridge": {
      "command": "mcp-transport-bridge",
      "args": ["--url", "http://127.0.0.1:3000/mcp/CONNECTION_UUID"],
      "env": { "MCP_BRIDGE_TOKEN": "YOUR_ADMIN_TOKEN" }
    }
  }
}
```

The installed executable works through npm's bin symlink and keeps stdout exclusively for MCP. It negotiates modern or legacy stdio clients. For a legacy SSE remote server, add `"--transport", "sse"` and use its SSE URL. SSE is never selected by guessing after an HTTP error.

A connection created with `"transport":"sse"` returns `ssePath`. Its authenticated GET stream advertises the authenticated `/messages?sessionId=...` POST endpoint. This is deprecated legacy compatibility, not MCP v2's HTTP transport. Idle SSE sessions expire after ten minutes.

## Management API

All bodies are JSON, all routes require the bearer token, and the registry is in memory.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | /health | Listener health |
| GET / POST | /api/servers | List / register servers |
| GET / PUT / DELETE | /api/servers/:id | Read metadata / update stopped server / stop and remove |
| POST | /api/servers/:id/start | Start explicitly |
| POST | /api/servers/:id/stop | Stop without restarting |
| POST | /api/servers/:id/environment | Merge a raw environment object and atomically replace a running child |
| GET / POST | /api/connections | List / create a logical connection |
| GET / DELETE | /api/connections/:id | Read metadata / disconnect and remove |
| POST | /api/connections/:id/disconnect | Close this connection's frontends |
| POST | /api/connections/:id/reconnect | Reconnect using the same connection ID and URL |

For an environment change, send `{"API_KEY":"new-value"}` directly, without an `env` wrapper. Empty string is a value; to replace the whole environment, stop the server and PUT its new `env` object. A replacement starts and negotiates successfully before it becomes active. New calls use the replacement; old calls may finish within the drain limit. Startup failure or capability changes retain the old configuration and child. Existing clients should list tools/resources/prompts again after a successful swap; change notifications are not advertised.

STDIO registration accepts `name`, `version`, `command`, `args`, optional `cwd`, and `env`. Only the SDK's minimal default process environment plus that explicit `env` reaches the child: the bridge's bearer token and unrelated parent secrets are not inherited.

Remote registration accepts `transport:"http"` or `"sse"`, `url`, and optional `headers`. Redirects are rejected. Put credentials in headers, not URL user info or query strings. Metadata responses show environment key and header names; they do not return commands, arguments, working directories, environment values or header values. Child stderr is drained without recording its contents. Tool results and resources remain application data and may contain whatever the configured server returns.

Configuration edits while running are rejected; use the environment endpoint for live replacement. A connection starts its server explicitly when created or reconnected. Stopped or failed children never restart automatically. Deleting a server also removes its connections.

## Programmatic use

```js
import { createApp } from 'mcp-transport-bridge';

const app = createApp({ port: 3000, token: process.env.MCP_BRIDGE_TOKEN });
const server = app.registerServer({
  name: 'Local server', transport: 'stdio',
  command: 'node', args: ['/absolute/path/server.js'], env: {}
});
const connection = await app.createConnection({ serverId: server.id, transport: 'http' });
await app.start();
console.log(connection.mcpPath);
// Later: await app.updateServerEnvironment(server.id, { API_KEY: 'replacement' });
// Shutdown: await app.stop();
```

`App`, `createApp`, and `BridgeManager` are public exports. `registerMemoryServer(config, async env => transport)` accepts a factory returning a **new** connected client-side SDK Transport for each backend generation. This preserves in-process integration without exposing memory transport registration over REST. A `"memory"` connection can be served with `app.createMcpServer(connection.id)` and an SDK serving entry point. A stopped App cannot be restarted; construct a new instance.

Default limits: 32 registered servers, 128 connections, 64 concurrent downstream requests per server, 10-second startup, 30-second request deadline, and 5-second drain. Programmatic `limits` overrides these. HTTP accepts at most 1 MiB JSON bodies, 128 active requests and 32 SSE sessions. Shutdown aborts outstanding requests and bounds transport cleanup. The bridge forwards cancellation to the child; an uncooperative downstream implementation can continue work until its process is closed.

Only core tools, resources/templates and prompts are proxied. Capability advertisements reflect these supported features. Task execution, sampling, elicitation/multi-round-trip input, roots, logging, subscriptions, list-change delivery and arbitrary server-to-client requests are not forwarded. Clients never grant additional capabilities to the shared child. This scope supports existing server tools without claiming every optional MCP feature.

## Docker

```sh
docker build -t mcp-transport-bridge .
docker run --rm -p 127.0.0.1:3000:3000 \
  -e MCP_BRIDGE_TOKEN -e MCP_BRIDGE_ALLOWED_HOSTS=127.0.0.1:3000 \
  mcp-transport-bridge
```

The image installs the built npm tarball and runs as the `node` user. Child commands run inside the container; install or mount their runtime and files there.

## Migration from 0.1

The package name and App/createApp management intent remain. Private process attachment and internal manager/event-emitter APIs are replaced by supported SDK transports; code importing those internals must use the public API above. HTTP connections use returned `mcpPath` values, while explicit legacy SSE connections use `ssePath`. The old endpoint/response-object connection setup and broken executable detection are removed. Remote-to-stdio invocation uses `--url` and optional `--transport sse`. Authentication is now mandatory for HTTP serving, and management views no longer expose credentials.

## Verification

```sh
npm ci
npm run typecheck
npm test
npm run test:package
npm audit --omit=dev
npm run test:docker
```

Tests use local fixtures and make no paid provider calls. CI covers Node 22 and 24, real child processes, modern and legacy requests, concurrent identical IDs, cancellation, atomic environment rollback/drain, authentication and metadata privacy, installed tarball/bin execution, and the built nonroot Docker image.

Protocol references: [SDK v2 migration](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2) and [2026-07-28 support](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28).
