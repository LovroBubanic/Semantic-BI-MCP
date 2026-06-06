import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadMcpTools } from "@langchain/mcp-adapters";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { registerMcpServer } from "./mcp-server";

const SERVER_INFO = { name: "semantic-bi-mcp", version: "1.0.0" };
const CLIENT_INFO = { name: "semantic-bi-chat", version: "1.0.0" };

export type InProcessMcpSession = {
  tools: DynamicStructuredTool[];
  close: () => Promise<void>;
};

/**
 * Run the MCP server in-process for the chat agent.
 * Avoids HTTP loopback, Vercel deployment protection, and redirect auth issues.
 */
export async function createInProcessMcpSession(): Promise<InProcessMcpSession> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const server = new McpServer(SERVER_INFO);
  registerMcpServer(server);
  await server.connect(serverTransport);

  const client = new Client(CLIENT_INFO);
  await client.connect(clientTransport);

  const tools = await loadMcpTools("semantic-bi", client);

  return {
    tools,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
