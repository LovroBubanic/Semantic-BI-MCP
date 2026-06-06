const MCP_ENDPOINT_PATH = "/api/mcp";
const LOCAL_MCP_URL = "http://localhost:3000/api/mcp";

function stripUrlHost(value: string): string {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Normalize MCP URL: trim, fix duplicate slashes, enforce /api/mcp path,
 * and upgrade http→https for non-local production hosts.
 */
export function normalizeMcpUrl(raw: string): string {
  let value = raw.trim();
  if (!value) {
    return LOCAL_MCP_URL;
  }

  if (
    process.env.NODE_ENV === "production" &&
    value.startsWith("http://") &&
    !value.includes("localhost") &&
    !value.includes("127.0.0.1")
  ) {
    value = `https://${value.slice("http://".length)}`;
  }

  try {
    const parsed = new URL(value);
    parsed.pathname = MCP_ENDPOINT_PATH;
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  }
}

/**
 * Public MCP endpoint URL for external clients (Cursor, MCP Inspector).
 * Never uses VERCEL_URL — preview deployment URLs are behind Vercel SSO.
 */
export function resolveMcpUrl(): string {
  const configured = process.env.MCP_URL?.trim();
  if (configured) {
    return normalizeMcpUrl(configured);
  }

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) {
    return `https://${stripUrlHost(productionHost)}${MCP_ENDPOINT_PATH}`;
  }

  return LOCAL_MCP_URL;
}

export function getMcpApiKey(): string {
  const key = process.env.MCP_API_KEY?.trim();
  if (!key) {
    throw new Error("MCP_API_KEY is not configured");
  }
  return key;
}

export function getMcpAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getMcpApiKey()}`,
  };

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (bypass) {
    headers["x-vercel-protection-bypass"] = bypass;
  }

  return headers;
}
