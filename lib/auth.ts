import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

function getExpectedApiKey(): string | undefined {
  const key = process.env.MCP_API_KEY?.trim();
  return key || undefined;
}

/**
 * Constant-time-ish comparison to reduce timing side channels on API keys.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return undefined;
  }
  return header.slice(7).trim();
}

/**
 * Verify Bearer token for MCP requests.
 * Returns AuthInfo on success, undefined on failure.
 */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  const expected = getExpectedApiKey();

  if (!expected) {
    console.error("[auth] MCP_API_KEY is not configured");
    return undefined;
  }

  if (!bearerToken) {
    return undefined;
  }

  if (!safeEqual(bearerToken, expected)) {
    return undefined;
  }

  return {
    token: bearerToken,
    clientId: "mcp-client",
    scopes: ["read:metrics"],
  };
}

export function isAuthConfigured(): boolean {
  return Boolean(getExpectedApiKey());
}
