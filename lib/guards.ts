import { WHITELISTED_VIEWS, type WhitelistedView } from "./seed";

export const MAX_ROWS = 500;
export const QUERY_TIMEOUT_MS = 5_000;

const WRITE_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX)\b/i;

const PII_FIELDS = new Set([
  "contact_email",
  "contact_phone",
  "email",
  "phone",
]);

/**
 * Reject any SQL that is not a single read-only SELECT against a whitelisted view.
 */
export function validateSafeQuery(sql: string): { ok: true; view: WhitelistedView } | { ok: false; error: string } {
  const trimmed = sql.trim().replace(/;+\s*$/, "");

  if (!trimmed) {
    return { ok: false, error: "Query cannot be empty." };
  }

  if (trimmed.includes(";")) {
    return { ok: false, error: "Multiple statements are not allowed." };
  }

  if (WRITE_KEYWORDS.test(trimmed)) {
    return { ok: false, error: "Only read-only SELECT queries are permitted." };
  }

  if (!/^\s*SELECT\b/i.test(trimmed)) {
    return { ok: false, error: "Query must be a single SELECT statement." };
  }

  const fromMatch = trimmed.match(/\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  if (!fromMatch) {
    return { ok: false, error: "Query must include a FROM clause referencing a whitelisted view." };
  }

  const tableName = fromMatch[1].toLowerCase();
  const view = WHITELISTED_VIEWS.find((v) => v.toLowerCase() === tableName);

  if (!view) {
    return {
      ok: false,
      error: `Table "${fromMatch[1]}" is not allowed. Whitelisted views: ${WHITELISTED_VIEWS.join(", ")}.`,
    };
  }

  if (/\bJOIN\b/i.test(trimmed)) {
    return { ok: false, error: "JOINs are not permitted in safe_query. Use a single whitelisted view." };
  }

  return { ok: true, view };
}

export function enforceRowCap<T>(rows: T[], cap: number = MAX_ROWS): { rows: T[]; truncated: boolean } {
  if (rows.length <= cap) {
    return { rows, truncated: false };
  }
  return { rows: rows.slice(0, cap), truncated: true };
}

export function maskPiiValue(fieldName: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const str = String(value);
  const lowerField = fieldName.toLowerCase();

  if (lowerField.includes("email") || PII_FIELDS.has(lowerField)) {
    if (lowerField.includes("email") || lowerField === "contact_email") {
      const at = str.indexOf("@");
      if (at > 1) {
        return `${str[0]}***${str.slice(at)}`;
      }
    }
    if (lowerField.includes("phone") || lowerField === "contact_phone") {
      return str.replace(/\d/g, "*").slice(0, Math.min(str.length, 16));
    }
  }

  return value;
}

export function maskPiiInRows(
  rows: Record<string, unknown>[],
  columns: string[]
): Record<string, unknown>[] {
  const piiColumns = columns.filter(
    (c) => PII_FIELDS.has(c.toLowerCase()) || c.toLowerCase().includes("email") || c.toLowerCase().includes("phone")
  );

  if (piiColumns.length === 0) {
    return rows;
  }

  return rows.map((row) => {
    const masked = { ...row };
    for (const col of piiColumns) {
      if (col in masked) {
        masked[col] = maskPiiValue(col, masked[col]);
      }
    }
    return masked;
  });
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number = QUERY_TIMEOUT_MS,
  label = "Operation"
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

export function appendLimit(sql: string, limit: number = MAX_ROWS): string {
  if (/\bLIMIT\b/i.test(sql)) {
    return sql;
  }
  return `${sql.trim()} LIMIT ${limit}`;
}
