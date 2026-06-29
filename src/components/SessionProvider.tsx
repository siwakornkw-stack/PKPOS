"use client";

import { createContext, useContext } from "react";
import type { SessionUser } from "@/lib/auth";
import { hasPermission, type PermissionKey } from "@/lib/permissions";

const Ctx = createContext<SessionUser | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

export function useSession(): SessionUser {
  const u = useContext(Ctx);
  if (!u) throw new Error("useSession must be used within SessionProvider");
  return u;
}

export function useCan(perm: PermissionKey): boolean {
  const u = useContext(Ctx);
  return hasPermission(u?.permissions, perm);
}
