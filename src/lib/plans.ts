// Subscription plans for the SaaS (monthly price in THB + limits).
export const PLANS: Record<string, { name: string; price: number; maxBranches: number; maxUsers: number }> = {
  TRIAL: { name: "ทดลองใช้", price: 0, maxBranches: 1, maxUsers: 5 },
  BASIC: { name: "Basic", price: 99, maxBranches: 1, maxUsers: 10 },
  PRO: { name: "Pro", price: 1990, maxBranches: 5, maxUsers: 50 },
};

export const TRIAL_DAYS = 14;
export const PAID_PLANS = ["BASIC", "PRO"] as const;

// True when a tenant cannot use the app (suspended/cancelled or trial expired).
export function isBlocked(t: { status: string; trialEndsAt: Date | null }, now: Date): boolean {
  if (t.status === "SUSPENDED" || t.status === "CANCELLED") return true;
  if (t.status === "TRIAL" && t.trialEndsAt && now > t.trialEndsAt) return true;
  return false;
}
