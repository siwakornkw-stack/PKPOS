"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { fmtDateTime } from "@/lib/format";

interface Notif {
  id: number;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      // ignore polling errors
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAll() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    load();
  }

  async function markOne(id: number) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnread((u) => Math.max(0, u - 1));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
        aria-label="การแจ้งเตือน"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
            <span className="font-bold text-gray-800">การแจ้งเตือน</span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="flex items-center gap-1 text-xs text-brand-700 hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> ทำเครื่องหมายอ่านแล้วทั้งหมด
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">ไม่มีการแจ้งเตือน</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.isRead && markOne(n.id)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-gray-100 px-4 py-2.5 text-left last:border-0 hover:bg-gray-50 ${
                    n.isRead ? "" : "bg-brand-50"
                  }`}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800">{n.title}</span>
                    {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                  </div>
                  {n.body && <span className="text-xs text-gray-500">{n.body}</span>}
                  <span className="text-[11px] text-gray-400">{fmtDateTime(n.createdAt)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
