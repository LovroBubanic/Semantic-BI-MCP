"use client";

import { useEffect, useRef } from "react";
import { MessageBubble, type ChatMessage } from "./MessageBubble";

interface ChatWindowProps {
  messages: ChatMessage[];
}

export function ChatWindow({ messages }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) return null;

  return (
    <div className="flex-1 space-y-3 sm:space-y-4 overflow-y-auto pb-2 min-h-0">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
