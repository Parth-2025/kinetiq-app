import { requireRuntimeConfig } from "@/config/runtime";

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`API ${status}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

let tokenAccessor: (() => string | null) | null = null;

export function registerTokenAccessor(fn: () => string | null): void {
  tokenAccessor = fn;
}

let unauthorizedHandler: (() => void) | null = null;

export function registerUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn;
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const base = requireRuntimeConfig(
    "kinetiqApiUrl",
    "Missing EXPO_PUBLIC_KINETIQ_API_URL. Point it at the KinetiQ backend.",
  );
  const token = tokenAccessor?.() ?? null;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let bodyInit: string | undefined;
  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(init.body);
  }

  const res = await fetch(`${base}${path}`, {
    method: init?.method ?? "GET",
    headers,
    body: bodyInit,
  });

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!res.ok) {
    const detail =
      parsed && typeof parsed === "object" && "detail" in parsed
        ? String((parsed as { detail: unknown }).detail)
        : res.statusText || text.slice(0, 200);
    if (res.status === 401) unauthorizedHandler?.();
    throw new ApiError(res.status, detail);
  }
  return parsed as T;
}
