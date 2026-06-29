import "server-only";

// LINE OA messaging adapter (push an e-receipt to a customer's LINE).
// MOCK/no-op until the branch has a lineChannelToken. When live it calls the
// LINE Messaging API push endpoint.

export interface LinePushResult {
  ok: boolean;
  mode: "LIVE" | "MOCK";
  detail?: string;
}

export async function pushLineMessage(
  channelToken: string | null | undefined,
  to: string,
  text: string
): Promise<LinePushResult> {
  if (!channelToken) return { ok: true, mode: "MOCK", detail: "no LINE token - skipped" };
  if (!to) return { ok: false, mode: "LIVE", detail: "missing recipient" };

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelToken}`,
      },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    });
    if (!res.ok) return { ok: false, mode: "LIVE", detail: `LINE ${res.status}` };
    return { ok: true, mode: "LIVE" };
  } catch (e) {
    return { ok: false, mode: "LIVE", detail: e instanceof Error ? e.message : "push failed" };
  }
}

// Plain-text e-receipt body for an order (kept simple; LINE Flex can replace this later).
export function ereceiptText(o: {
  docNo: string;
  branchName: string;
  netAmount: number;
  paidAt: Date | null;
}): string {
  const when = o.paidAt ? o.paidAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "";
  return `ใบเสร็จ ${o.branchName}\nเลขที่ ${o.docNo}\nยอดรวม ฿${o.netAmount.toFixed(2)}\n${when}\nขอบคุณที่ใช้บริการ`;
}
