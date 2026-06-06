# Installation Guide — Semantic BI MCP

Complete setup instructions for local development, MCP Inspector testing, and Vercel deployment.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20+ | Check with `node -v` |
| npm | 10+ | Bundled with Node |
| OpenAI account | — | For the chat agent |
| Vercel account | Pro recommended | Hobby tier has commercial-use restrictions |

---

## 1. Clone and install

```bash
git clone <your-repo-url> semantic-bi-mcp
cd semantic-bi-mcp
npm install
```

---

## 2. Environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

> **Never commit `.env.local` or any `.env*` file containing real secrets.** They are listed in `.gitignore`.

### Variable reference

| Variable | Required | Where to get it | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | Yes (for chat UI) | [OpenAI API Keys](https://platform.openai.com/api-keys) | Powers the LangChain agent (`gpt-4o-mini`) |
| `MCP_API_KEY` | Yes | Generate yourself (see below) | Bearer token clients must send to `/api/mcp` |
| `MCP_URL` | Yes (for chat agent) | Your deployment URL + `/api/mcp` | URL the chat agent uses to reach the MCP server |

### How to generate `MCP_API_KEY`

Use any cryptographically secure random string (32+ bytes recommended):

**Windows (PowerShell):**
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

**macOS / Linux:**
```bash
openssl rand -hex 32
```

**Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output as `MCP_API_KEY` in `.env.local`.

### Example `.env.local`

```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxx
MCP_API_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
MCP_URL=http://localhost:3000/api/mcp
```

For production, set `MCP_URL` to your deployed URL:
```env
MCP_URL=https://your-app.vercel.app/api/mcp
```

---

## 3. Run locally

```bash
npm run dev
```

| Service | URL |
|---|---|
| Chat demo UI | http://localhost:3000 |
| MCP endpoint | http://localhost:3000/api/mcp |

Production build test:
```bash
npm run build
npm start
```

---

## 4. Test with MCP Inspector

The MCP Inspector is the recommended way to verify tools, resources, and prompts before using the chat UI.

```bash
npx @modelcontextprotocol/inspector
```

In the Inspector UI:

1. **Transport:** Streamable HTTP
2. **URL:** `http://localhost:3000/api/mcp`
3. **Headers:** Add `Authorization: Bearer <your MCP_API_KEY>`

Verify:
- [ ] All 11 tools appear and execute successfully
- [ ] All 3 resources return JSON
- [ ] All 3 prompts generate message templates
- [ ] Unauthorized requests (no Bearer token) return 401

---

## 5. Connect from Cursor / Claude Desktop

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "semantic-bi": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_API_KEY"
      }
    }
  }
}
```

For production, replace the URL with your Vercel deployment.

### stdio-only clients

Use [mcp-remote](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "semantic-bi": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3000/api/mcp", "--header", "Authorization: Bearer YOUR_MCP_API_KEY"]
    }
  }
}
```

---

## 6. Deploy to Vercel

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com/new)
3. Set environment variables in **Project Settings → Environment Variables**:

   | Name | Value |
   |---|---|
   | `OPENAI_API_KEY` | Your OpenAI key |
   | `MCP_API_KEY` | Your generated bearer token |
   | `MCP_URL` | `https://<your-domain>.vercel.app/api/mcp` |

4. Deploy. Vercel Pro + Fluid compute is recommended for `maxDuration: 60` on API routes.

5. After deploy, re-run MCP Inspector against the production URL.

---

## 7. Troubleshooting

### `MCP_API_KEY is not configured`
Set `MCP_API_KEY` in `.env.local` and restart the dev server.

### Chat returns 500 / missing OpenAI key
Set `OPENAI_API_KEY` in `.env.local`.

### MCP Inspector returns 401
Add the `Authorization: Bearer <MCP_API_KEY>` header. The key must match exactly.

### Agent can't reach MCP server
Ensure `MCP_URL` points to a running server. For local dev, start `npm run dev` first. The agent connects over HTTP — it does not import tools in-process.

### Chat returns `No authorization provided` on Vercel
This usually means the `Authorization` header was stripped before reaching `/api/mcp`.

1. Set `MCP_URL` to **`https://`** (not `http://`) with **no trailing slash**, e.g. `https://your-domain.com/api/mcp`
2. Ensure `MCP_API_KEY` is set for the **Production** environment in Vercel
3. **Redeploy** after changing environment variables

On Vercel, the chat agent automatically uses the deployment's internal HTTPS URL (`VERCEL_URL`) when `MCP_URL` points to the same app, avoiding `http→https` redirects that drop Bearer tokens.

### sql.js WASM not found on Vercel
The app resolves WASM from `node_modules/sql.js/dist/sql-wasm.wasm`. `next.config.ts` marks `sql.js` as a server external package. If issues persist, verify the file exists in your deployment bundle.

### Build fails on Zod / MCP SDK
Pin `zod@^3.25` and `@modelcontextprotocol/sdk@^1.26`. Do not upgrade to Zod v4.

---

## 8. Project structure

```
semantic-bi-mcp/
├── app/
│   ├── api/[transport]/route.ts   # MCP server → /api/mcp
│   ├── api/chat/route.ts          # LangChain agent
│   ├── page.tsx                   # Chat demo UI
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ChatWindow.tsx
│   ├── MessageBubble.tsx
│   ├── ToolCallCard.tsx
│   └── ExampleChips.tsx
├── lib/
│   ├── db.ts          # sql.js init
│   ├── seed.ts        # Northwind SaaS dataset
│   ├── metrics.ts     # Semantic layer (vetted SQL)
│   ├── guards.ts      # Row caps, PII masking, safe_query validation
│   ├── audit.ts       # In-memory audit log
│   ├── auth.ts        # Bearer API key
│   └── mcp-server.ts  # Tool/resource/prompt registration
├── .env.example       # Template (safe to commit)
├── .env.local         # Your secrets (never commit)
├── INSTALLATION.md    # This file
├── SECURITY.md        # Security audit
└── README.md          # Project overview
```
