import { API_BASE_URL } from "../config";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Json = Record<string, unknown>;

async function request<T>(
  path: string,
  options: { method?: string; body?: Json; token?: string | null } = {}
): Promise<T> {
  const { method = "GET", body, token } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export interface AuthResult {
  token: string;
  user: { id: string; phone: string; balanceCents: number };
  isNew: boolean;
}

export interface RateRow {
  prefix: string;
  country: string;
  ratePerMinCents: number;
}

export interface WalletResult {
  balanceCents: number;
  rates: RateRow[];
}

export const api = {
  startVerify: (phone: string) =>
    request<{ ok: true }>("/auth/start-verify", { method: "POST", body: { phone } }),

  checkVerify: (phone: string, code: string) =>
    request<AuthResult>("/auth/check-verify", { method: "POST", body: { phone, code } }),

  getVoiceToken: (token: string) =>
    request<{ token: string; identity: string }>("/voice/token", { token }),

  getWallet: (token: string) => request<WalletResult>("/wallet", { token }),

  topUp: (token: string, amountCents: number) =>
    request<{ balanceCents: number }>("/wallet/topup", {
      method: "POST",
      body: { amountCents },
      token,
    }),

  prepareAccessCall: (token: string, to: string) =>
    request<{
      accessNumber: string;
      to: string;
      country: string;
      ratePerMinCents: number;
      expiresInSeconds: number;
    }>("/voice/access/prepare", { method: "POST", body: { to }, token }),
};
