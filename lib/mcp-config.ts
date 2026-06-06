const MCP_ENDPOINT_PATH = "/api/mcp";
const LOCAL_MCP_URL = "http://localhost:3000/api/mcp";

function stripUrlHost(value: string): string {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function hostsMatch(a: string, b: string): boolean {
  const normalize = (host: string) => host.toLowerCase().replace(/^www\./, "");
  return normalize(a) === normalize(b);
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

function isSameDeployment(configuredUrl: string): boolean {
  const vercelHost = process.env.VERCEL_URL
    ? stripUrlHost(process.env.VERCEL_URL)
    : undefined;
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? stripUrlHost(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    : undefined;

  if (!vercelHost) {
    return true;
  }

  try {
    const configuredHost = new URL(normalizeMcpUrl(configuredUrl)).host;
    if (hostsMatch(configuredHost, vercelHost)) {
      return true;
    }
    if (productionHost && hostsMatch(configuredHost, productionHost)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function getVercelInternalMcpUrl(): string | undefined {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (!vercelUrl) {
    return undefined;
  }
  return `https://${stripUrlHost(vercelUrl)}${MCP_ENDPOINT_PATH}`;
}

/**
 * URL the chat agent uses to reach the MCP server.
 * On Vercel, prefers the deployment's canonical HTTPS URL for same-app calls
 * so Authorization headers are not stripped by http→https redirects.
 */
export function resolveChatMcpUrl(): string {
  const configured = process.env.MCP_URL?.trim();
  const internalUrl = getVercelInternalMcpUrl();

  if (internalUrl && (!configured || isSameDeployment(configured))) {
    return internalUrl;
  }

  return normalizeMcpUrl(configured ?? LOCAL_MCP_URL);
}

export function getMcpApiKey(): string {
  const key = process.env.MCP_API_KEY?.trim();
  if (!key) {
    throw new Error("MCP_API_KEY is not configured");
  }
  return key;
}

export function getMcpAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getMcpApiKey()}`,
  };
}
