"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-gray-800">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "brand" | "accent" | "blue" | "rose";
}) {
  const tones: Record<string, string> = {
    brand: "bg-brand-100 text-brand-700",
    accent: "bg-accent-100 text-accent-700",
    blue: "bg-blue-100 text-blue-700",
    rose: "bg-rose-100 text-rose-700",
  };
  return (
    <div className="card p-4 flex items-center gap-4">
      {Icon && (
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-800 truncate">{value}</p>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card w-full ${width} max-h-[90vh] overflow-y-auto outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} aria-label="ปิด" className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <p className="text-sm">{message}</p>
    </div>
  );
}
