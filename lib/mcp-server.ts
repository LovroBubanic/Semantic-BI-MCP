import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  executeSafeQuery,
  getActiveSubscriptions,
  getArr,
  getChurnRate,
  getCustomerCount,
  getDatasetStatsResource,
  getMetricCatalogResource,
  getMrr,
  getNetRevenueRetention,
  getNewCustomers,
  getRevenueByPlan,
  getSchemaResource,
  METRIC_CATALOG,
} from "./metrics";
import { getAuditLog, getAuditStats } from "./audit";

const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM format, e.g. 2025-01");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format, e.g. 2025-01-15");

const tierSchema = z.enum(["starter", "professional", "enterprise"]);

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function clientId(extra: { authInfo?: { clientId?: string } }): string | undefined {
  return extra.authInfo?.clientId;
}

/**
 * Register all MCP tools, resources, and prompts on the server instance.
 * Route handler calls this — no business logic lives in the route file.
 */
export function registerMcpServer(server: McpServer): void {
  // ── Tools ──────────────────────────────────────────────────────────────

  server.registerTool(
    "get_mrr",
    {
      title: "Monthly Recurring Revenue",
      description:
        "Calculate Monthly Recurring Revenue (MRR) for a given month. Uses vetted SQL that excludes soft-deleted customers and counts only active/trialing subscriptions.",
      inputSchema: {
        month: monthSchema.describe("Target month in YYYY-MM format"),
      },
    },
    async ({ month }, extra) => textResult(await getMrr(month, clientId(extra)))
  );

  server.registerTool(
    "get_arr",
    {
      title: "Annual Recurring Revenue",
      description:
        "Calculate Annual Recurring Revenue (ARR = MRR × 12) for a given month using the same vetted subscription logic as get_mrr.",
      inputSchema: {
        month: monthSchema.describe("Target month in YYYY-MM format"),
      },
    },
    async ({ month }, extra) => textResult(await getArr(month, clientId(extra)))
  );

  server.registerTool(
    "get_churn_rate",
    {
      title: "Subscription Churn Rate",
      description:
        "Calculate the percentage of subscriptions that cancelled within a date range. Uses subscription cancellation dates, not invoice gaps.",
      inputSchema: {
        start_date: dateSchema.describe("Range start (YYYY-MM-DD)"),
        end_date: dateSchema.describe("Range end (YYYY-MM-DD)"),
      },
    },
    async ({ start_date, end_date }, extra) =>
      textResult(await getChurnRate(start_date, end_date, clientId(extra)))
  );

  server.registerTool(
    "get_active_subscriptions",
    {
      title: "Active Subscriptions Count",
      description:
        "Count active and trialing subscriptions, with optional filter by plan tier. Returns total and per-tier breakdown.",
      inputSchema: {
        tier: tierSchema
          .optional()
          .describe("Optional plan tier filter: starter, professional, or enterprise"),
      },
    },
    async ({ tier }, extra) => textResult(await getActiveSubscriptions(tier, clientId(extra)))
  );

  server.registerTool(
    "get_new_customers",
    {
      title: "New Customer Count",
      description:
        "Count customers acquired (created_at) within a date range. Excludes soft-deleted customers.",
      inputSchema: {
        start_date: dateSchema.describe("Range start (YYYY-MM-DD)"),
        end_date: dateSchema.describe("Range end (YYYY-MM-DD)"),
      },
    },
    async ({ start_date, end_date }, extra) =>
      textResult(await getNewCustomers(start_date, end_date, clientId(extra)))
  );

  server.registerTool(
    "get_revenue_by_plan",
    {
      title: "Revenue by Plan",
      description:
        "Paid invoice revenue grouped by plan for a given month. Uses the v_monthly_revenue view.",
      inputSchema: {
        month: monthSchema.describe("Target month in YYYY-MM format"),
      },
    },
    async ({ month }, extra) => textResult(await getRevenueByPlan(month, clientId(extra)))
  );

  server.registerTool(
    "get_customer_count",
    {
      title: "Customer Count",
      description:
        "Total count of active (non-deleted) customers, optionally filtered by country code (US, UK, DE, etc.).",
      inputSchema: {
        country: z
          .string()
          .min(2)
          .max(3)
          .optional()
          .describe("Optional ISO country code filter"),
      },
    },
    async ({ country }, extra) => textResult(await getCustomerCount(country, clientId(extra)))
  );

  server.registerTool(
    "get_net_revenue_retention",
    {
      title: "Net Revenue Retention",
      description:
        "Compare total paid revenue between two months and return NRR as a percentage (comparison / base × 100).",
      inputSchema: {
        base_month: monthSchema.describe("Baseline month (YYYY-MM)"),
        comparison_month: monthSchema.describe("Comparison month (YYYY-MM)"),
      },
    },
    async ({ base_month, comparison_month }, extra) =>
      textResult(await getNetRevenueRetention(base_month, comparison_month, clientId(extra)))
  );

  server.registerTool(
    "safe_query",
    {
      title: "Safe Read-Only Query",
      description:
        "Execute a single read-only SELECT against whitelisted views (v_active_subscriptions, v_monthly_revenue, v_customer_summary). Rejects writes, JOINs, and base-table access. Returns the exact SQL executed, with PII masked and rows capped at 500.",
      inputSchema: {
        sql: z
          .string()
          .min(10)
          .max(2000)
          .describe("A single SELECT statement against a whitelisted view"),
      },
    },
    async ({ sql }, extra) => textResult(await executeSafeQuery(sql, clientId(extra)))
  );

  server.registerTool(
    "list_metrics",
    {
      title: "List Available Metrics",
      description:
        "Return the catalog of all semantic metrics available in this MCP server, with descriptions and parameters.",
      inputSchema: {},
    },
    async () => textResult({ metrics: METRIC_CATALOG })
  );

  server.registerTool(
    "get_audit_log",
    {
      title: "Audit Log",
      description:
        "Return recent tool invocation audit entries from this server instance (in-memory, resets on cold start).",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum entries to return (1–100)"),
      },
    },
    async ({ limit }) =>
      textResult({
        stats: getAuditStats(),
        entries: getAuditLog(limit),
      })
  );

  // ── Resources ──────────────────────────────────────────────────────────

  server.registerResource(
    "dataset-schema",
    "dataset://schema",
    {
      title: "Dataset Schema",
      description:
        "Table and view definitions for the Northwind SaaS fictional dataset, including column lists and safe_query notes.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: getSchemaResource() }],
    })
  );

  server.registerResource(
    "metric-catalog",
    "semantic-layer://catalog",
    {
      title: "Semantic Metric Catalog",
      description:
        "Machine-readable catalog of all vetted business metrics exposed as MCP tools.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: getMetricCatalogResource() }],
    })
  );

  server.registerResource(
    "dataset-stats",
    "dataset://stats",
    {
      title: "Dataset Statistics",
      description: "High-level row counts and description of the seeded Northwind SaaS dataset.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: getDatasetStatsResource() }],
    })
  );

  // ── Prompts ────────────────────────────────────────────────────────────

  server.registerPrompt(
    "executive-summary",
    {
      title: "Executive Summary",
      description:
        "Generate a concise executive summary of SaaS health for a given month using semantic metrics.",
      argsSchema: {
        month: monthSchema.describe("Focus month in YYYY-MM format"),
      },
    },
    ({ month }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `You are a data analyst for Northwind SaaS. Produce a concise executive summary for ${month}.

Use ONLY the semantic MCP tools (get_mrr, get_arr, get_churn_rate, get_revenue_by_plan, get_new_customers, get_active_subscriptions). Do NOT write raw SQL.

Structure:
1. Headline metrics (MRR, ARR, active subs)
2. Revenue mix by plan
3. Growth (new customers) and churn signal
4. One actionable insight

Keep it under 200 words. Use exact numbers from tool results.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "mrr-trend-analysis",
    {
      title: "MRR Trend Analysis",
      description:
        "Analyze MRR trends across two months and explain drivers using semantic tools.",
      argsSchema: {
        base_month: monthSchema.describe("Earlier month (YYYY-MM)"),
        comparison_month: monthSchema.describe("Later month (YYYY-MM)"),
      },
    },
    ({ base_month, comparison_month }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Analyze MRR trend from ${base_month} to ${comparison_month} for Northwind SaaS.

Required tool calls:
- get_mrr for both months
- get_net_revenue_retention between the months
- get_revenue_by_plan for comparison_month
- get_active_subscriptions

Explain: absolute MRR change, NRR implication, which plan tiers drove the delta, and whether sub count or ARPU moved more. No raw SQL.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "churn-investigation",
    {
      title: "Churn Investigation",
      description:
        "Investigate churn for a date range with structured follow-up questions.",
      argsSchema: {
        start_date: dateSchema.describe("Investigation start (YYYY-MM-DD)"),
        end_date: dateSchema.describe("Investigation end (YYYY-MM-DD)"),
      },
    },
    ({ start_date, end_date }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Investigate subscription churn for Northwind SaaS from ${start_date} to ${end_date}.

Steps:
1. Call get_churn_rate for the range
2. Call get_active_subscriptions for context
3. Call get_new_customers for the same range to compare acquisition vs loss
4. Optionally use safe_query on v_active_subscriptions (LIMIT 10) to spot tier patterns

Deliver: churn rate, net customer movement estimate, likely tier impact, and 2 recommended actions. Semantic tools only unless safe_query is needed for tier breakdown.`,
          },
        },
      ],
    })
  );
}
