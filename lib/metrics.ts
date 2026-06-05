import { query, type QueryResult } from "./db";
import type { SqlValue } from "sql.js";
import {
  appendLimit,
  enforceRowCap,
  maskPiiInRows,
  validateSafeQuery,
  withTimeout,
  MAX_ROWS,
} from "./guards";
import { appendAudit } from "./audit";

export interface MetricDefinition {
  name: string;
  description: string;
  parameters: string[];
}

export const METRIC_CATALOG: MetricDefinition[] = [
  {
    name: "get_mrr",
    description: "Monthly Recurring Revenue for a given month (YYYY-MM). Excludes soft-deleted customers.",
    parameters: ["month"],
  },
  {
    name: "get_arr",
    description: "Annual Recurring Revenue derived from MRR × 12 for a given month.",
    parameters: ["month"],
  },
  {
    name: "get_churn_rate",
    description: "Subscription churn rate for a date range (% of active subs that cancelled).",
    parameters: ["start_date", "end_date"],
  },
  {
    name: "get_active_subscriptions",
    description: "Count of active/trialing subscriptions, optionally filtered by plan tier.",
    parameters: ["tier?"],
  },
  {
    name: "get_new_customers",
    description: "Count of new customers acquired in a date range.",
    parameters: ["start_date", "end_date"],
  },
  {
    name: "get_revenue_by_plan",
    description: "Paid invoice revenue grouped by plan for a given month.",
    parameters: ["month"],
  },
  {
    name: "get_customer_count",
    description: "Total active (non-deleted) customers, optionally by country.",
    parameters: ["country?"],
  },
  {
    name: "get_net_revenue_retention",
    description: "Net revenue retention comparing two months (%).",
    parameters: ["base_month", "comparison_month"],
  },
  {
    name: "safe_query",
    description: "Read-only SELECT against whitelisted views only. Returns executed SQL.",
    parameters: ["sql"],
  },
];

type Tier = "starter" | "professional" | "enterprise";

async function runMetric<T>(
  tool: string,
  args: Record<string, unknown>,
  fn: () => Promise<T>,
  clientId?: string
): Promise<T> {
  const start = Date.now();
  try {
    const result = await withTimeout(fn(), undefined, tool);
    appendAudit({
      tool,
      args,
      durationMs: Date.now() - start,
      rowCount: Array.isArray(result) ? result.length : 1,
      success: true,
      clientId,
    });
    return result;
  } catch (err) {
    appendAudit({
      tool,
      args,
      durationMs: Date.now() - start,
      rowCount: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      clientId,
    });
    throw err;
  }
}

export async function getMrr(month: string, clientId?: string): Promise<{ month: string; mrr: number; active_subscriptions: number }> {
  return runMetric("get_mrr", { month }, async () => {
    const result = await query(
      `SELECT
         COALESCE(SUM(p.monthly_price * s.seats), 0) AS mrr,
         COUNT(*) AS active_subscriptions
       FROM subscriptions s
       JOIN plans p ON p.plan_id = s.plan_id
       JOIN customers c ON c.customer_id = s.customer_id AND c.deleted_at IS NULL
       WHERE s.status IN ('active', 'trialing')
         AND s.started_at <= ?
         AND (s.cancelled_at IS NULL OR s.cancelled_at > ? || '-31')`,
      [`${month}-01`, month]
    );
    const row = result.rows[0];
    return {
      month,
      mrr: Number(row?.mrr ?? 0),
      active_subscriptions: Number(row?.active_subscriptions ?? 0),
    };
  }, clientId);
}

export async function getArr(month: string, clientId?: string): Promise<{ month: string; arr: number; mrr: number }> {
  const mrrResult = await getMrr(month, clientId);
  return {
    month,
    mrr: mrrResult.mrr,
    arr: mrrResult.mrr * 12,
  };
}

export async function getChurnRate(
  startDate: string,
  endDate: string,
  clientId?: string
): Promise<{ start_date: string; end_date: string; churn_rate_pct: number; cancelled: number; base_active: number }> {
  return runMetric("get_churn_rate", { start_date: startDate, end_date: endDate }, async () => {
    const base = await query(
      `SELECT COUNT(*) AS cnt FROM subscriptions
       WHERE status IN ('active', 'trialing', 'cancelled')
         AND started_at <= ?
         AND (cancelled_at IS NULL OR cancelled_at >= ?)`,
      [startDate, startDate]
    );
    const cancelled = await query(
      `SELECT COUNT(*) AS cnt FROM subscriptions
       WHERE cancelled_at >= ? AND cancelled_at <= ?`,
      [startDate, endDate]
    );
    const baseActive = Number(base.rows[0]?.cnt ?? 0);
    const cancelledCount = Number(cancelled.rows[0]?.cnt ?? 0);
    const rate = baseActive > 0 ? (cancelledCount / baseActive) * 100 : 0;
    return {
      start_date: startDate,
      end_date: endDate,
      churn_rate_pct: Math.round(rate * 100) / 100,
      cancelled: cancelledCount,
      base_active: baseActive,
    };
  }, clientId);
}

export async function getActiveSubscriptions(
  tier?: Tier,
  clientId?: string
): Promise<{ tier: Tier | "all"; count: number; breakdown: Record<string, number> }> {
  return runMetric("get_active_subscriptions", { tier: tier ?? "all" }, async () => {
    let sql = `
      SELECT p.tier, COUNT(*) AS cnt
      FROM subscriptions s
      JOIN plans p ON p.plan_id = s.plan_id
      JOIN customers c ON c.customer_id = s.customer_id AND c.deleted_at IS NULL
      WHERE s.status IN ('active', 'trialing')`;
    const params: SqlValue[] = [];
    if (tier) {
      sql += ` AND p.tier = ?`;
      params.push(tier);
    }
    sql += ` GROUP BY p.tier`;

    const result = await query(sql, params);
    const breakdown: Record<string, number> = {};
    let total = 0;
    for (const row of result.rows) {
      const t = String(row.tier);
      const cnt = Number(row.cnt);
      breakdown[t] = cnt;
      total += cnt;
    }
    return { tier: tier ?? "all", count: total, breakdown };
  }, clientId);
}

export async function getNewCustomers(
  startDate: string,
  endDate: string,
  clientId?: string
): Promise<{ start_date: string; end_date: string; new_customers: number }> {
  return runMetric("get_new_customers", { start_date: startDate, end_date: endDate }, async () => {
    const result = await query(
      `SELECT COUNT(*) AS cnt FROM customers
       WHERE deleted_at IS NULL AND created_at >= ? AND created_at <= ?`,
      [startDate, endDate]
    );
    return {
      start_date: startDate,
      end_date: endDate,
      new_customers: Number(result.rows[0]?.cnt ?? 0),
    };
  }, clientId);
}

export async function getRevenueByPlan(
  month: string,
  clientId?: string
): Promise<{ month: string; plans: Array<{ plan_name: string; tier: string; revenue: number; paying_customers: number }> }> {
  return runMetric("get_revenue_by_plan", { month }, async () => {
    const result = await query(
      `SELECT plan_name, tier, revenue, paying_customers
       FROM v_monthly_revenue WHERE month = ?`,
      [month]
    );
    return {
      month,
      plans: result.rows.map((r) => ({
        plan_name: String(r.plan_name),
        tier: String(r.tier),
        revenue: Number(r.revenue),
        paying_customers: Number(r.paying_customers),
      })),
    };
  }, clientId);
}

export async function getCustomerCount(
  country?: string,
  clientId?: string
): Promise<{ country: string | "all"; customer_count: number }> {
  return runMetric("get_customer_count", { country: country ?? "all" }, async () => {
    let sql = `SELECT COUNT(*) AS cnt FROM customers WHERE deleted_at IS NULL`;
    const params: SqlValue[] = [];
    if (country) {
      sql += ` AND country = ?`;
      params.push(country);
    }
    const result = await query(sql, params);
    return {
      country: country ?? "all",
      customer_count: Number(result.rows[0]?.cnt ?? 0),
    };
  }, clientId);
}

export async function getNetRevenueRetention(
  baseMonth: string,
  comparisonMonth: string,
  clientId?: string
): Promise<{ base_month: string; comparison_month: string; nrr_pct: number; base_revenue: number; comparison_revenue: number }> {
  return runMetric(
    "get_net_revenue_retention",
    { base_month: baseMonth, comparison_month: comparisonMonth },
    async () => {
      const base = await query(
        `SELECT COALESCE(SUM(revenue), 0) AS rev FROM v_monthly_revenue WHERE month = ?`,
        [baseMonth]
      );
      const comp = await query(
        `SELECT COALESCE(SUM(revenue), 0) AS rev FROM v_monthly_revenue WHERE month = ?`,
        [comparisonMonth]
      );
      const baseRev = Number(base.rows[0]?.rev ?? 0);
      const compRev = Number(comp.rows[0]?.rev ?? 0);
      const nrr = baseRev > 0 ? (compRev / baseRev) * 100 : 0;
      return {
        base_month: baseMonth,
        comparison_month: comparisonMonth,
        nrr_pct: Math.round(nrr * 100) / 100,
        base_revenue: baseRev,
        comparison_revenue: compRev,
      };
    },
    clientId
  );
}

export interface SafeQueryResult {
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
}

export async function executeSafeQuery(
  sql: string,
  clientId?: string
): Promise<SafeQueryResult> {
  return runMetric("safe_query", { sql }, async () => {
    const validation = validateSafeQuery(sql);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    const boundedSql = appendLimit(sql, MAX_ROWS);
    const result: QueryResult = await query(boundedSql);
    const { rows, truncated } = enforceRowCap(result.rows);
    const masked = maskPiiInRows(rows as Record<string, unknown>[], result.columns);

    return {
      sql: boundedSql,
      columns: result.columns,
      rows: masked,
      row_count: masked.length,
      truncated,
    };
  }, clientId);
}

export function getSchemaResource(): string {
  return JSON.stringify(
    {
      dataset: "Northwind SaaS",
      tables: {
        plans: ["plan_id", "plan_name", "monthly_price", "tier"],
        customers: ["customer_id", "company_name", "industry", "contact_email", "contact_phone", "country", "created_at", "deleted_at"],
        subscriptions: ["subscription_id", "customer_id", "plan_id", "status", "started_at", "cancelled_at", "seats"],
        invoices: ["invoice_id", "subscription_id", "amount", "invoice_date", "status"],
      },
      views: {
        v_active_subscriptions: "Active/trialing subs with MRR contribution",
        v_monthly_revenue: "Paid revenue by month and plan",
        v_customer_summary: "Customer + subscription snapshot",
      },
      notes: "Base tables are not queryable via safe_query. Use semantic metric tools or whitelisted views.",
    },
    null,
    2
  );
}

export function getMetricCatalogResource(): string {
  return JSON.stringify({ metrics: METRIC_CATALOG }, null, 2);
}

export function getDatasetStatsResource(): string {
  return JSON.stringify(
    {
      customers: 120,
      subscriptions: 120,
      plans: 3,
      description: "Fictional B2B SaaS with deterministic seed data and baked-in growth/churn patterns.",
    },
    null,
    2
  );
}
