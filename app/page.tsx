"use client";

import { useCallback, useRef, useState } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { DemoDataModal } from "@/components/DemoDataModal";
import { ExampleChips } from "@/components/ExampleChips";
import type { ChatMessage } from "@/components/MessageBubble";

const EXAMPLE_QUESTIONS = [
  "What was our MRR in 2025-01?",
  "Compare churn from 2025-01-01 to 2025-06-30",
  "Break down revenue by plan for 2025-03",
  "How many active enterprise subscriptions do we have?",
];

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [demoDataOpen, setDemoDataOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
      };

      const assistantId = crypto.randomUUID();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        toolCalls: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput("");
      setIsLoading(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const history = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error ?? "Chat request failed");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as StreamEvent;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;

                if (event.type === "token") {
                  return { ...m, content: m.content + event.text };
                }
                if (event.type === "tool_start") {
                  return {
                    ...m,
                    toolCalls: [
                      ...(m.toolCalls ?? []),
                      {
                        id: event.id,
                        name: event.name,
                        args: event.args,
                        status: "running" as const,
                      },
                    ],
                  };
                }
                if (event.type === "tool_end") {
                  return {
                    ...m,
                    toolCalls: (m.toolCalls ?? []).map((tc) =>
                      tc.id === event.id
                        ? {
                            ...tc,
                            result: event.result,
                            status: event.status === "error" ? ("error" as const) : ("done" as const),
                          }
                        : tc
                    ),
                  };
                }
                if (event.type === "error") {
                  return { ...m, content: m.content || event.message, isStreaming: false };
                }
                if (event.type === "done") {
                  return { ...m, isStreaming: false };
                }
                return m;
              })
            );
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `Error: ${err instanceof Error ? err.message : String(err)}`,
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
        );
      }
    },
    [isLoading, messages]
  );

  return (
    <main className="min-h-screen min-h-dvh flex flex-col">
      <header className="border-b border-border bg-surface sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">
                Semantic BI MCP
              </h1>
              <p className="text-[11px] sm:text-xs text-muted mt-0.5 line-clamp-2 sm:line-clamp-none">
                Vetted metrics · read-only · audit-logged · no raw SQL
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDemoDataOpen(true)}
              className="shrink-0 rounded-lg border border-border bg-surface-elevated px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium text-accent hover:border-accent transition-colors min-h-[36px] sm:min-h-[40px]"
            >
              Demo Data
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-4xl mx-auto w-full px-3 sm:px-4 py-4 sm:py-6 flex flex-col gap-4 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-8 sm:py-12 space-y-4 animate-fade-in">
            <h2 className="text-xl sm:text-2xl font-semibold">Ask your data anything</h2>
            <p className="text-muted max-w-md mx-auto text-sm px-2">
              The agent calls semantic MCP tools over HTTP — every metric is pre-vetted SQL, never
              improvised queries against base tables.
            </p>
            <ExampleChips
              examples={EXAMPLE_QUESTIONS}
              onSelect={(q) => sendMessage(q)}
              disabled={isLoading}
            />
          </div>
        )}

        <ChatWindow messages={messages} />

        <form
          className="sticky bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2 bg-background pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about MRR, churn, revenue by plan…"
            disabled={isLoading}
            className="flex-1 min-w-0 rounded-xl border border-border bg-surface-elevated px-3 sm:px-4 py-3 text-sm placeholder:text-muted focus:outline-none focus:border-accent disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-accent px-4 sm:px-5 py-3 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[44px] shrink-0"
          >
            {isLoading ? "…" : "Send"}
          </button>
        </form>
      </div>

      <DemoDataModal open={demoDataOpen} onClose={() => setDemoDataOpen(false)} />
    </main>
  );
}

type StreamEvent =
  | { type: "token"; text: string }
  | { type: "tool_start"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; id: string; result: string; status?: "done" | "error" }
  | { type: "error"; message: string }
  | { type: "done" };
