import { NextRequest } from "next/server";
import { getMcpApiKey } from "@/lib/mcp-config";
import { createInProcessMcpSession } from "@/lib/mcp-inprocess";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are a data analyst assistant for Northwind SaaS, a fictional B2B subscription business.

CRITICAL RULES:
- Use ONLY the MCP tools provided to answer questions about metrics and data.
- NEVER write or suggest raw SQL against base tables.
- Prefer semantic tools (get_mrr, get_arr, get_churn_rate, etc.) over safe_query.
- When using safe_query, only SELECT from whitelisted views.
- Present numbers clearly with units (USD for revenue, % for rates).
- If a question cannot be answered with available tools, say so clearly.`;

function getOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return key;
}

function encodeEvent(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(data) + "\n");
}

export async function POST(req: NextRequest) {
  let body: { messages?: Array<{ role: string; content: string }> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.messages?.length) {
    return Response.json({ error: "messages array is required" }, { status: 400 });
  }

  try {
    getOpenAiKey();
    getMcpApiKey();
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Missing configuration" },
      { status: 500 }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const [
        { ChatOpenAI },
        { createReactAgent },
        { HumanMessage, AIMessage },
      ] = await Promise.all([
        import("@langchain/openai"),
        import("@langchain/langgraph/prebuilt"),
        import("@langchain/core/messages"),
      ]);

      const mcpSession = await createInProcessMcpSession();

      try {
        const tools = mcpSession.tools;
        const model = new ChatOpenAI({
          model: "gpt-4o-mini",
          temperature: 0,
          streaming: true,
          apiKey: getOpenAiKey(),
        });

        const agent = createReactAgent({
          llm: model,
          tools,
          prompt: SYSTEM_PROMPT,
        });

        const lcMessages = body.messages!.map((m) =>
          m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
        );
        const toolIdMap = new Map<string, string>();

        const eventStream = agent.streamEvents({ messages: lcMessages }, { version: "v2" });

        for await (const event of eventStream) {
          if (event.event === "on_chat_model_stream") {
            const chunk = event.data?.chunk as { content?: string | Array<{ type?: string; text?: string }> };
            const text =
              typeof chunk?.content === "string"
                ? chunk.content
                : Array.isArray(chunk?.content)
                  ? chunk.content
                      .filter((c) => c.type === "text")
                      .map((c) => c.text ?? "")
                      .join("")
                  : "";
            if (text) {
              controller.enqueue(encodeEvent({ type: "token", text }));
            }
          }

          if (event.event === "on_tool_start") {
            const id = crypto.randomUUID();
            const runId = String(event.run_id ?? id);
            toolIdMap.set(runId, id);
            controller.enqueue(
              encodeEvent({
                type: "tool_start",
                id,
                name: event.name ?? "unknown",
                args: (event.data?.input as Record<string, unknown>) ?? {},
              })
            );
          }

          if (event.event === "on_tool_end") {
            const runId = String(event.run_id ?? "");
            const id = toolIdMap.get(runId) ?? crypto.randomUUID();
            const output = event.data?.output;
            let resultStr: string;
            if (typeof output === "string") {
              resultStr = output;
            } else if (output && typeof output === "object") {
              resultStr = JSON.stringify(output, null, 2);
            } else {
              resultStr = JSON.stringify(output ?? {}, null, 2);
            }
            controller.enqueue(
              encodeEvent({
                type: "tool_end",
                id,
                result: resultStr,
              })
            );
          }
        }

        controller.enqueue(encodeEvent({ type: "done" }));
      } catch (err) {
        controller.enqueue(
          encodeEvent({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          })
        );
      } finally {
        try {
          await mcpSession.close();
        } catch {
          /* ignore close errors */
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
