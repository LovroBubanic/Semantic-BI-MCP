# Security Audit — Semantic BI MCP

**Audit date:** 2026-06-05  
**Auditor:** Automated build + manual code review  
**Overall status:** ✅ **Acceptable for portfolio/demo deployment** with documented limitations

This document reflects the security posture at audit time. Update it whenever auth, guards, dependencies, data exposure, or deployment configuration changes (see `.cursorrules` documentation discipline).

---

## Executive summary

Semantic BI MCP is designed as a **read-only semantic analytics demo** with defense-in-depth guardrails. The architecture intentionally prevents data mutation and limits arbitrary SQL to whitelisted views. Bearer token auth protects the MCP endpoint.

**Strengths:** semantic layer (no raw table SQL), write-blocking, view whitelist, row caps, PII masking, audit logging, MCP SDK ≥1.26 (known CVE patched), secrets in env vars, `.gitignore` excludes all `.env*` files.

**Limitations (by design):** single shared API key (no per-user auth), in-memory audit log (lost on cold start), fictional in-memory dataset (not multi-tenant), chat UI has no end-user authentication, npm transitive dependency advisories in LangChain stack.

---

## Threat model

| Threat | Mitigation | Residual risk |
|---|---|---|
| Arbitrary SQL / data exfiltration | Semantic tools + `safe_query` view whitelist | Low for demo dataset |
| Data mutation (INSERT/UPDATE/DELETE) | No write tools; `safe_query` rejects DML keywords | Low |
| Unauthorized MCP access | Bearer `MCP_API_KEY` via `withMcpAuth` | Medium — single shared key |
| PII leakage | Email/phone masking in `safe_query` results | Low (demo data only) |
| DoS via large queries | 500-row cap, 5s timeout, `maxDuration: 60` | Low–Medium |
| Secret exposure in git | `.gitignore` blocks `.env`, `.env.*` | Low (if followed) |
| Prompt injection via chat UI | System prompt restricts tool use; tools are read-only | Medium |
| Supply chain / dependency CVEs | Pinned MCP SDK ≥1.26; npm audit monitored | Medium (LangChain transitive) |

---

## Security controls inventory

### Authentication & authorization

| Control | Location | Status |
|---|---|---|
| Bearer API key on MCP endpoint | `lib/auth.ts`, `app/api/[transport]/route.ts` | ✅ Implemented |
| Constant-time key comparison | `lib/auth.ts` → `safeEqual()` | ✅ Implemented |
| Required auth (`withMcpAuth`, `required: true`) | MCP route | ✅ Implemented |
| Scope check (`read:metrics`) | MCP route | ✅ Implemented |
| Chat UI authentication | — | ❌ Not implemented (demo) |
| Chat API authentication | — | ❌ Open POST (relies on server-side keys only) |

**Finding SEC-001 (Low):** `/api/chat` accepts unauthenticated requests. Anyone who can reach the deployment can consume OpenAI credits.  
**Recommendation:** Add optional API key or Vercel deployment protection for production demos.

### Data access controls

| Control | Location | Status |
|---|---|---|
| Semantic layer (vetted SQL only) | `lib/metrics.ts` | ✅ Implemented |
| No raw SQL against base tables | Architecture rule | ✅ Enforced |
| `safe_query` view whitelist | `lib/guards.ts`, `lib/seed.ts` | ✅ 3 views only |
| Reject JOINs in `safe_query` | `lib/guards.ts` | ✅ Implemented |
| Reject multi-statement SQL | `lib/guards.ts` | ✅ Implemented |
| Reject write/DML keywords | `lib/guards.ts` | ✅ Implemented |
| Row cap (500) | `lib/guards.ts` | ✅ Implemented |
| Query timeout (5s) | `lib/guards.ts` | ✅ Implemented |
| PII masking (email, phone) | `lib/guards.ts` | ✅ Implemented |
| Soft-delete exclusion in metrics | `lib/metrics.ts` SQL | ✅ Implemented |

**Whitelisted views for `safe_query`:**
- `v_active_subscriptions`
- `v_monthly_revenue`
- `v_customer_summary`

### Audit & logging

| Control | Location | Status |
|---|---|---|
| Tool invocation audit log | `lib/audit.ts` | ✅ In-memory |
| Audit exposed via `get_audit_log` tool | `lib/mcp-server.ts` | ✅ Implemented |
| Persistent audit storage | — | ❌ Not implemented |
| Structured server logging | MCP verbose in dev only | ⚠️ Partial |

**Finding SEC-002 (Info):** Audit log resets on serverless cold start. Acceptable for demo; not suitable for compliance.

### Secrets management

| Control | Status |
|---|---|
| `.gitignore` excludes `.env`, `.env.*` | ✅ |
| `.env.example` committed (no secrets) | ✅ |
| Secrets via environment variables only | ✅ |
| No hardcoded API keys in source | ✅ Verified |

### Transport & deployment

| Control | Status |
|---|---|
| HTTPS (Vercel default) | ✅ Production |
| MCP stateless (no SSE/Redis) | ✅ Reduces attack surface |
| `disableSse: true` | ✅ |
| sql.js WASM (no native DB) | ✅ Serverless-safe |
| `serverExternalPackages: ["sql.js"]` | ✅ |

### Input validation

| Surface | Validation | Status |
|---|---|---|
| MCP tool inputs | Zod schemas (enums, regex, min/max) | ✅ |
| `safe_query` SQL | Custom parser + whitelist | ✅ |
| Chat messages | Basic JSON parse | ⚠️ No content sanitization |

---

## Dependency audit

Run: `npm audit` (2026-06-05)

| Package | Issue | Severity | Action |
|---|---|---|---|
| `@modelcontextprotocol/sdk` | Pre-1.26 security vuln | — | ✅ Using `^1.26.0` |
| `zod` | Must stay v3 for SDK compat | — | ✅ Pinned `^3.25.76` |
| `@langchain/core` | Transitive via `langsmith`, `uuid` | High | ⚠️ Monitor; major upgrade blocked by stack pins |
| `@langchain/langgraph` | Transitive `uuid` advisories | Moderate | ⚠️ Monitor |
| Other LangChain packages | Transitive | Moderate | ⚠️ Monitor |

**Finding SEC-003 (Medium):** 11 npm audit findings (2 high, 9 moderate) in LangChain dependency tree. Fixes require major version bumps that may break pinned stack.  
**Recommendation:** Re-run `npm audit` monthly; upgrade LangChain packages when compatible with MCP adapter pins.

---

## MCP SDK security note

`@modelcontextprotocol/sdk` versions **before 1.26.0** contain a known security vulnerability. This project requires `^1.26.0`. Do not downgrade.

---

## Chat agent security

The LangChain agent (`app/api/chat/route.ts`):
- Connects to MCP over HTTP with Bearer token (correct network boundary)
- Uses `gpt-4o-mini` at `temperature: 0`
- System prompt instructs: semantic tools only, no raw SQL
- Dynamically imports LangChain packages to avoid build-time schema conflicts

**Finding SEC-004 (Medium):** Prompt injection could cause the model to call tools with unintended arguments. Mitigated by read-only tools and strict `safe_query` validation, but not eliminated.

---

## Security checklist for deployment

Before deploying to production:

- [ ] Generate a strong `MCP_API_KEY` (32+ random bytes)
- [ ] Set all env vars in Vercel (never in source)
- [ ] Enable Vercel deployment protection or add chat API auth if exposing publicly
- [ ] Confirm `.env.local` is not committed
- [ ] Run MCP Inspector with auth header against production URL
- [ ] Verify 401 without Bearer token
- [ ] Test `safe_query` rejects base table access and DML
- [ ] Review `npm audit` output

---

## Remediation priority

| ID | Priority | Finding | Recommended action |
|---|---|---|---|
| SEC-001 | P2 | Open `/api/chat` endpoint | Add API key or Vercel auth for public deploys |
| SEC-003 | P2 | LangChain transitive CVEs | Monitor; plan coordinated upgrade |
| SEC-004 | P3 | Prompt injection | Accept for demo; add tool arg validation if extended |
| SEC-002 | P4 | Ephemeral audit log | Document only; add persistent store if productized |

---

## Conclusion

The application meets its **stated security goals** for a portfolio-grade MCP demo:

1. **No data mutation** — enforced by architecture and guards  
2. **No arbitrary SQL** — semantic layer + whitelisted views  
3. **Authenticated MCP access** — Bearer token required  
4. **PII protection** — masking on query results  
5. **Audit trail** — in-memory per instance  

It is **not** production-ready for real customer data without: per-tenant auth, persistent audit, rate limiting, chat endpoint protection, and a real database with row-level security.

**Next audit trigger:** Any change to auth, guards, tools, dependencies, env vars, or deployment config.
