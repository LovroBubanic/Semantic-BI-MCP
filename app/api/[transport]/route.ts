import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerMcpServer } from "@/lib/mcp-server";
import { verifyMcpToken } from "@/lib/auth";

const handler = createMcpHandler(
  (server) => {
    registerMcpServer(server);
  },
  {
    serverInfo: {
      name: "semantic-bi-mcp",
      version: "1.0.0",
    },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV === "development",
    disableSse: true,
  }
);

const authHandler = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  requiredScopes: ["read:metrics"],
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
