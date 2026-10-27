// Minimal fetch wrapper: JWT header, one automatic refresh on 401, readable errors.
const rawBase = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/+$/, "");
const API_BASE = rawBase.endsWith("/api") ? rawBase : `${rawBase}/api`;

const ACCESS_KEY = "inv.access";
const REFRESH_KEY = "inv.refresh";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setTokens(access: string, refresh?: string) {
  try {
    window.localStorage.setItem(ACCESS_KEY, access);
    if (refresh) window.localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    /* storage unavailable: user will simply have to log in again */
  }
}

export function clearTokens() {
  try {
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
}

export const hasToken = () => read(ACCESS_KEY) !== null;

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/** Turn a DRF error body ({detail} or {field: [msgs]}) into one readable line. */
export function errorMessage(data: unknown, fallback: string): string {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map(String).join(" ");
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.detail === "string") return obj.detail;
    const parts = Object.entries(obj).map(([field, msgs]) => {
      const text = Array.isArray(msgs) ? msgs.join(" ") : String(msgs);
      return field === "non_field_errors" ? text : `${field}: ${text}`;
    });
    if (parts.length) return parts.join(" · ");
  }
  return fallback;
}

let refreshing: Promise<boolean> | null = null;

function refreshAccess(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const refresh = read(REFRESH_KEY);
      if (!refresh) return false;
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { access: string; refresh?: string };
        setTokens(data.access, data.refresh);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const access = read(ACCESS_KEY);
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (res.status === 401 && retry && path !== "/auth/login") {
    if (await refreshAccess()) return request<T>(method, path, body, false);
    clearTokens();
    window.dispatchEvent(new Event("inv:logout"));
  }

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      errorMessage(data, res.statusText || "Request failed"),
      data,
    );
  }
  return data as T;
}

type Params = Record<string, string | number | boolean | undefined | null>;

function qs(params?: Params): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>("GET", path + qs(params)),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
