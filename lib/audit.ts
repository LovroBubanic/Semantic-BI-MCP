export interface AuditEntry {
  id: string;
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;
  durationMs: number;
  rowCount: number;
  success: boolean;
  error?: string;
  clientId?: string;
}

const auditLog: AuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 1_000;

let entryCounter = 0;

export function appendAudit(entry: Omit<AuditEntry, "id" | "timestamp">): AuditEntry {
  const full: AuditEntry = {
    ...entry,
    id: `audit-${++entryCounter}`,
    timestamp: new Date().toISOString(),
  };

  auditLog.unshift(full);

  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.length = MAX_AUDIT_ENTRIES;
  }

  return full;
}

export function getAuditLog(limit = 50): AuditEntry[] {
  return auditLog.slice(0, Math.min(limit, MAX_AUDIT_ENTRIES));
}

export function getAuditStats(): { totalCalls: number; successRate: number; lastCall?: string } {
  const total = auditLog.length;
  if (total === 0) {
    return { totalCalls: 0, successRate: 1 };
  }
  const successes = auditLog.filter((e) => e.success).length;
  return {
    totalCalls: total,
    successRate: successes / total,
    lastCall: auditLog[0]?.timestamp,
  };
}
