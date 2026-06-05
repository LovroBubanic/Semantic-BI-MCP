"use client";

import { useEffect, useRef } from "react";

interface DemoDataModalProps {
  open: boolean;
  onClose: () => void;
}

export function DemoDataModal({ open, onClose }: DemoDataModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-data-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 animate-fade-in"
        aria-label="Close demo data panel"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className="relative w-full sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] overflow-y-auto border border-border bg-surface rounded-t-2xl sm:rounded-2xl shadow-none animate-slide-up"
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-5 py-3 sm:py-4">
          <h2 id="demo-data-title" className="text-base sm:text-lg font-semibold text-accent">
            Demo Data
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground hover:border-accent transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-4 sm:px-5 py-4 sm:py-5 text-sm leading-relaxed">
          <p className="text-foreground/90">
            All numbers in this chat are <strong className="text-accent">fictional</strong>. Nothing
            here connects to a real company or production database.
          </p>

          <div className="rounded-xl border border-border bg-surface-elevated p-4 space-y-2">
            <h3 className="font-medium text-accent">Northwind SaaS</h3>
            <p className="text-muted text-xs sm:text-sm">
              A made-up B2B subscription business with deterministic seed data — same dataset on
              every cold start.
            </p>
          </div>

          <div>
            <h3 className="font-medium mb-2">What&apos;s in the dataset</h3>
            <ul className="space-y-2 text-muted text-xs sm:text-sm">
              <li className="flex gap-2">
                <span className="text-accent shrink-0">·</span>
                <span>
                  <strong className="text-foreground/80">120 customers</strong> across SaaS,
                  FinTech, HealthTech, and other industries (US, UK, DE, and more)
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent shrink-0">·</span>
                <span>
                  <strong className="text-foreground/80">3 plans</strong> — Starter ($49/mo),
                  Professional ($149/mo), Enterprise ($499/mo)
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent shrink-0">·</span>
                <span>
                  <strong className="text-foreground/80">Subscriptions</strong> with active,
                  trialing, cancelled, and past-due statuses
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent shrink-0">·</span>
                <span>
                  <strong className="text-foreground/80">Invoices</strong> spanning 2024–2025 with
                  baked-in MRR growth and seasonal churn patterns
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium mb-2">Available metrics</h3>
            <p className="text-muted text-xs sm:text-sm">
              MRR, ARR, churn rate, active subscriptions, new customers, revenue by plan, customer
              count, net revenue retention — all via pre-vetted semantic MCP tools, not improvised
              SQL.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
