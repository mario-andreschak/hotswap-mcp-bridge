import { createApp } from 'mcp-transport-bridge';
const app = createApp({ token: process.env.MCP_BRIDGE_TOKEN });
const server = app.registerServer({ name: 'Example', transport: 'stdio', command: 'node',
  args: ['/absolute/path/to/your/mcp-server.js'], env: {} });
const connection = await app.createConnection({ serverId: server.id, transport: 'http' });
await app.start();
process.stderr.write('MCP endpoint: http://127.0.0.1:' + app.port + connection.mcpPath + '\n');
process.once('SIGINT', () => { void app.stop(); });
process.once('SIGTERM', () => { void app.stop(); });
