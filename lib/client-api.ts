"use client";

import { useCallback, useEffect, useState } from "react";
import type { Role } from "@/lib/workflow";

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/** Call the app's own API. Never throws: a network failure comes back as `ok: false`. */
export async function api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { ok: false, error: json.error ?? `Something went wrong (${res.status}).`, status: res.status };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection.", status: 0 };
  }
}

const EVENT = "kasauti-auth";
export const announceAuthChange = () => window.dispatchEvent(new Event(EVENT));

export type MeState = { status: "loading" } | { status: "nodb" } | { status: "anon" } | { status: "user"; user: Me };

/** Who is signed in (null while loading), and whether the shared database exists on this server. */
export function useMe(): { me: MeState; refresh: () => void } {
  const [me, setMe] = useState<MeState>({ status: "loading" });
  const refresh = useCallback(() => {
    void api<{ user: Me | null; database: boolean }>("GET", "/api/auth/me").then((r) => {
      if (!r.ok) setMe({ status: "anon" });
      else if (!r.data.database) setMe({ status: "nodb" });
      else setMe(r.data.user ? { status: "user", user: r.data.user } : { status: "anon" });
    });
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(EVENT, refresh);
    return () => window.removeEventListener(EVENT, refresh);
  }, [refresh]);
  return { me, refresh };
}

export const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
