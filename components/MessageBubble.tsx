"use client";

import { ToolCallCard, type ToolCall } from "./ToolCallCard";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex animate-message-in ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[92%] sm:max-w-[85%] space-y-2 ${
          isUser
            ? "rounded-2xl rounded-tr-sm bg-accent px-3 sm:px-4 py-3 text-black"
            : "w-full"
        }`}
      >
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-2">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {(message.content || message.isStreaming) && (
          <div
            className={
              isUser
                ? "text-sm sm:text-base"
                : "rounded-2xl rounded-tl-sm border border-border bg-surface-elevated px-3 sm:px-4 py-3 text-sm leading-relaxed"
            }
          >
            {message.content}
            {message.isStreaming && !message.content && (
              <span className="text-muted animate-pulse">Thinking…</span>
            )}
            {message.isStreaming && message.content && (
              <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse align-middle" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
