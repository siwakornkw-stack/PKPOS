import "server-only";

// Thin Omise REST client (https://docs.omise.co). Raw fetch, no SDK dependency.
// Auth is HTTP Basic with the secret key as the username and an empty password.
// Bodies are form-encoded; amounts are integer satang (THB * 100).

const API = "https://api.omise.co";

export interface OmiseCharge {
  object: "charge";
  id: string;
  status: "successful" | "failed" | "pending" | "expired" | "reversed";
  paid: boolean;
  authorized: boolean;
  amount: number;
  currency: string;
  failure_code?: string | null;
  failure_message?: string | null;
  metadata?: Record<string, unknown>;
  customer?: string | null;
}

export interface OmiseCustomer {
  object: "customer";
  id: string;
  default_card?: string | null;
  cards?: { data?: OmiseCard[] };
}

export interface OmiseCard {
  id: string;
  brand?: string;
  last_digits?: string;
  expiration_month?: number;
  expiration_year?: number;
}

interface OmiseError {
  object: "error";
  code?: string;
  message?: string;
}

function authHeader(secretKey: string): string {
  // base64("<secretKey>:") - secret key as username, blank password
  return "Basic " + Buffer.from(secretKey + ":").toString("base64");
}

function encode(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) sp.append(k, String(v));
  return sp.toString();
}

async function omiseRequest<T>(
  secretKey: string,
  method: "GET" | "POST" | "PATCH",
  path: string,
  params?: Record<string, string | number | undefined>,
  idempotencyKey?: string
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: authHeader(secretKey),
    "Content-Type": "application/x-www-form-urlencoded",
  };
  // Omise dedupes POSTs carrying the same key for 24h - a retry returns the original
  // charge instead of debiting the card again.
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(API + path, {
    method,
    headers,
    body: method === "GET" ? undefined : encode(params ?? {}),
  });
  const json = (await res.json().catch(() => null)) as (T & Partial<OmiseError>) | null;
  if (!json) throw new Error(`Omise ${method} ${path} returned no body (HTTP ${res.status})`);
  if ((json as Partial<OmiseError>).object === "error")
    throw new Error(`Omise error: ${(json as OmiseError).message ?? (json as OmiseError).code ?? "unknown"}`);
  return json as T;
}

// Charge a one-time card token (chargeCard / per-branch card-present flow).
export function chargeWithToken(
  secretKey: string,
  args: { amount: number; currency?: string; token: string; description?: string; idempotencyKey?: string }
): Promise<OmiseCharge> {
  if (!Number.isFinite(args.amount) || args.amount <= 0) throw new Error("invalid charge amount");
  return omiseRequest<OmiseCharge>(secretKey, "POST", "/charges", {
    amount: Math.round(args.amount * 100),
    currency: (args.currency ?? "thb").toLowerCase(),
    card: args.token,
    description: args.description,
  }, args.idempotencyKey);
}

// Create a customer and attach a card token (saves the card for recurring charges).
export function createCustomer(
  secretKey: string,
  args: { token: string; email?: string; description?: string }
): Promise<OmiseCustomer> {
  return omiseRequest<OmiseCustomer>(secretKey, "POST", "/customers", {
    card: args.token,
    email: args.email,
    description: args.description,
  });
}

// Replace the saved card on an existing customer.
export function updateCustomerCard(secretKey: string, customerId: string, token: string): Promise<OmiseCustomer> {
  return omiseRequest<OmiseCustomer>(secretKey, "PATCH", `/customers/${customerId}`, { card: token });
}

// Charge a customer's default saved card.
export function chargeCustomer(
  secretKey: string,
  args: { amount: number; currency?: string; customerId: string; description?: string; metadata?: Record<string, string | number>; idempotencyKey?: string }
): Promise<OmiseCharge> {
  if (!Number.isFinite(args.amount) || args.amount <= 0) throw new Error("invalid charge amount");
  const params: Record<string, string | number | undefined> = {
    amount: Math.round(args.amount * 100),
    currency: (args.currency ?? "thb").toLowerCase(),
    customer: args.customerId,
    description: args.description,
  };
  for (const [k, v] of Object.entries(args.metadata ?? {})) params[`metadata[${k}]`] = v;
  return omiseRequest<OmiseCharge>(secretKey, "POST", "/charges", params, args.idempotencyKey);
}

export function retrieveCharge(secretKey: string, chargeId: string): Promise<OmiseCharge> {
  return omiseRequest<OmiseCharge>(secretKey, "GET", `/charges/${chargeId}`);
}

// Pull the default card's display details from a freshly created/updated customer.
export function defaultCardOf(customer: OmiseCustomer): OmiseCard | undefined {
  const cards = customer.cards?.data ?? [];
  return cards.find((c) => c.id === customer.default_card) ?? cards[cards.length - 1];
}
