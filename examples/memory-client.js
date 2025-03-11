/**
 * Example of using the in-memory transport client
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

async function main() {
  try {
    console.log('Creating in-memory client...');
    
    // Create a client
    const client = new Client({
      name: 'Echo Client',
      version: '1.0.0'
    });
    
    // Create a pair of linked in-memory transports
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    
    // Connect to the server using in-memory transport
    await client.connect(clientTransport);
    console.log('Client connected');
    
    // List available tools
    const tools = await client.listTools();
    console.log('Available tools:', tools.tools.map(t => t.name));
    
    // Call the echo tool
    const result = await client.callTool({
      name: 'echo',
      arguments: {
        message: 'Hello from in-memory client!'
      }
    });
    
    console.log('Tool result:', result.content[0].text);
    
    // Close the connection
    await client.close();
    console.log('Client disconnected');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
