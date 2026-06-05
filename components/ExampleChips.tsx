"use client";

interface ExampleChipsProps {
  examples: string[];
  onSelect: (question: string) => void;
  disabled?: boolean;
}

export function ExampleChips({ examples, onSelect, disabled }: ExampleChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto px-2">
      {examples.map((q, i) => (
        <button
          key={q}
          type="button"
          onClick={() => onSelect(q)}
          disabled={disabled}
          style={{ animationDelay: `${i * 60}ms` }}
          className="animate-chip-in rounded-full border border-border bg-surface-elevated px-3 py-2 text-xs text-muted hover:text-foreground hover:border-accent transition-colors disabled:opacity-50 text-left sm:text-center"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
