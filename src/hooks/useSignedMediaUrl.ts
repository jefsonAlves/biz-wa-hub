import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const CACHE = new Map<string, { url: string; expiresAt: number }>();
const TTL_SECONDS = 60 * 30;

type State = { url: string | null; loading: boolean; error: string | null };

/**
 * Resolves a private Storage path (bucket `media`) into a temporary signed URL.
 * Provider credentials never reach the browser: only the private path is stored
 * in the database and the signed URL is minted per session by the backend.
 */
export function useSignedMediaUrl(storagePath?: string | null, fallbackUrl?: string | null): State {
  const [state, setState] = useState<State>(() => ({
    url: storagePath ? null : fallbackUrl ?? null,
    loading: !!storagePath,
    error: null,
  }));

  useEffect(() => {
    if (!storagePath) {
      setState({ url: fallbackUrl ?? null, loading: false, error: null });
      return;
    }

    const cached = CACHE.get(storagePath);
    if (cached && cached.expiresAt > Date.now() + 30_000) {
      setState({ url: cached.url, loading: false, error: null });
      return;
    }

    let active = true;
    setState({ url: null, loading: true, error: null });

    supabase.storage
      .from("media")
      .createSignedUrl(storagePath, TTL_SECONDS)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data?.signedUrl) {
          setState({ url: null, loading: false, error: "Mídia indisponível" });
          return;
        }
        CACHE.set(storagePath, { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 });
        setState({ url: data.signedUrl, loading: false, error: null });
      });

    return () => {
      active = false;
    };
  }, [storagePath, fallbackUrl]);

  return state;
}

export function formatBytes(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
