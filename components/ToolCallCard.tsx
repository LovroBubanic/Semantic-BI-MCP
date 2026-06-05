"use client";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: "running" | "done" | "error";
}

interface ToolCallCardProps {
  toolCall: ToolCall;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden text-xs font-mono">
      <div className="flex items-center gap-2 px-3 py-2 bg-accent-muted border-b border-border">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            toolCall.status === "running"
              ? "bg-warning animate-pulse"
              : toolCall.status === "done"
                ? "bg-success"
                : "bg-red-500"
          }`}
        />
        <span className="font-semibold text-accent truncate">{toolCall.name}</span>
        {toolCall.status === "running" && (
          <span className="text-muted ml-auto shrink-0">running…</span>
        )}
      </div>

      <div className="px-3 py-2 border-b border-border">
        <p className="text-muted mb-1">args</p>
        <pre className="text-foreground/80 whitespace-pre-wrap break-all text-[11px] sm:text-xs">
          {JSON.stringify(toolCall.args, null, 2)}
        </pre>
      </div>

      {toolCall.result !== undefined && (
        <div className="px-3 py-2 max-h-40 sm:max-h-48 overflow-y-auto">
          <p className="text-muted mb-1">result</p>
          <pre className="text-foreground/80 whitespace-pre-wrap break-all text-[11px] sm:text-xs">
            {toolCall.result}
          </pre>
        </div>
      )}
    </div>
  );
}
