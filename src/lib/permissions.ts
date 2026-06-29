// Role & Permission Matrix (from the Access & Experience Design slide).
// Stored on Role.permissions as a JSON array. "*" means full access.

export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  POS_ACCESS: "pos.access", // create / edit orders, payment
  ORDER_VOID: "order.void", // void / refund
  DISCOUNT_OVERRIDE: "discount.override",
  MENU_MANAGE: "menu.manage",
  PROMOTION_MANAGE: "promotion.manage",
  INVENTORY_MANAGE: "inventory.manage",
  PURCHASE_MANAGE: "purchase.manage",
  SHIFT_CLOSE: "shift.close",
  USER_MANAGE: "user.manage",
  AUDIT_VIEW: "audit.view",
  REPORT_EXPORT: "report.export",
  KITCHEN_VIEW: "kitchen.view",
  TABLE_VIEW: "table.view",
  CUSTOMER_MANAGE: "customer.manage",
  SETTINGS_MANAGE: "settings.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

// Role definitions seeded into the DB. Matches the matrix:
// Owner > Manager > Cashier / Waiter / Kitchen / Stock / Auditor
export const ROLE_DEFS: Record<
  string,
  { name: string; permissions: string[] }
> = {
  OWNER: { name: "เจ้าของร้าน (Owner)", permissions: ["*"] },
  MANAGER: {
    name: "ผู้จัดการ (Manager)",
    permissions: [
      P.DASHBOARD_VIEW, P.POS_ACCESS, P.ORDER_VOID, P.DISCOUNT_OVERRIDE,
      P.MENU_MANAGE, P.PROMOTION_MANAGE, P.INVENTORY_MANAGE, P.PURCHASE_MANAGE,
      P.SHIFT_CLOSE, P.USER_MANAGE, P.AUDIT_VIEW, P.REPORT_EXPORT,
      P.KITCHEN_VIEW, P.TABLE_VIEW, P.CUSTOMER_MANAGE, P.SETTINGS_MANAGE,
    ],
  },
  CASHIER: {
    name: "แคชเชียร์ (Cashier)",
    permissions: [
      P.DASHBOARD_VIEW, P.POS_ACCESS, P.ORDER_VOID, P.DISCOUNT_OVERRIDE,
      P.SHIFT_CLOSE, P.REPORT_EXPORT, P.TABLE_VIEW, P.KITCHEN_VIEW,
      P.CUSTOMER_MANAGE,
    ],
  },
  WAITER: {
    name: "พนักงานเสิร์ฟ (Waiter)",
    permissions: [
      P.DASHBOARD_VIEW, P.POS_ACCESS, P.TABLE_VIEW, P.KITCHEN_VIEW,
      P.CUSTOMER_MANAGE,
    ],
  },
  KITCHEN: {
    name: "ครัว (Kitchen)",
    permissions: [P.DASHBOARD_VIEW, P.KITCHEN_VIEW],
  },
  STOCK: {
    name: "สต็อก/แอดมิน (Stock/Admin)",
    permissions: [
      P.DASHBOARD_VIEW, P.MENU_MANAGE, P.INVENTORY_MANAGE, P.PURCHASE_MANAGE,
      P.AUDIT_VIEW, P.REPORT_EXPORT,
    ],
  },
  AUDITOR: {
    name: "ผู้ตรวจสอบ (Auditor)",
    permissions: [P.DASHBOARD_VIEW, P.AUDIT_VIEW, P.REPORT_EXPORT],
  },
};

export function hasPermission(
  permissions: string[] | undefined | null,
  key: PermissionKey
): boolean {
  if (!permissions) return false;
  return permissions.includes("*") || permissions.includes(key);
}

// Role ceiling: a caller may grant a role only if its permission set is within the
// caller's own. Prevents a non-owner (e.g. Manager with USER_MANAGE) from assigning
// OWNER ("*") or any permission they don't themselves hold (privilege escalation).
export function canGrantRole(
  callerPermissions: string[] | undefined | null,
  rolePermissions: string[]
): boolean {
  if (!callerPermissions) return false;
  if (callerPermissions.includes("*")) return true; // owner can grant anything
  if (rolePermissions.includes("*")) return false; // only "*" may grant "*"
  return rolePermissions.every((p) => callerPermissions.includes(p));
}
