import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isBlocked } from "@/lib/plans";
import { SessionProvider } from "@/components/SessionProvider";
import { LanguageProvider } from "@/lib/i18n";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  // platform super-admin uses /admin, not the POS app
  if (user.isSuperAdmin) redirect("/admin");

  // block access when the subscription is suspended / trial expired
  if (user.tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
    if (tenant && isBlocked(tenant, new Date())) redirect("/billing");
  }

  return (
    <SessionProvider user={user}>
      <LanguageProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </div>
      </LanguageProvider>
    </SessionProvider>
  );
}
