import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/config/api";

type CacheEntry = { value: unknown; at: number };
const cache = new Map<string, CacheEntry>();
const listeners = new Map<string, Set<() => void>>();
let cacheEpoch = 0;

export function invalidate(keyPrefix: string): void {
  for (const k of [...cache.keys()]) {
    if (k.startsWith(keyPrefix)) cache.delete(k);
  }
  for (const [k, set] of listeners) {
    if (k.startsWith(keyPrefix)) set.forEach((fn) => fn());
  }
}

export function clearApiCache(): void {
  cacheEpoch += 1;
  cache.clear();
  // In-flight responses are invalidated. New account mounts fetch their own data.
}

function subscribe(key: string, fn: () => void): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(fn);
  return () => listeners.get(key)?.delete(fn);
}

export function useApiQuery<T>(key: string | null, path: string | null) {
  const [value, setValue] = useState<T | null>(
    key && cache.has(key) ? (cache.get(key)!.value as T) : null,
  );
  const [isLoading, setIsLoading] = useState(!!path);
  const [error, setError] = useState<Error | null>(null);
  const valueKeyRef = useRef(key);
  const pathRef = useRef(path);
  const requestRef = useRef(0);
  pathRef.current = path;

  const run = useCallback(() => {
    if (valueKeyRef.current !== key) {
      valueKeyRef.current = key;
      setValue(key && cache.has(key) ? (cache.get(key)!.value as T) : null);
      setError(null);
    }
    const p = pathRef.current;
    const request = ++requestRef.current;
    const epoch = cacheEpoch;
    if (!key || !p) {
      setValue(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    apiFetch<T>(p)
      .then((v) => {
        if (request !== requestRef.current || epoch !== cacheEpoch) return;
        cache.set(key, { value: v, at: Date.now() });
        setValue(v);
        setError(null);
      })
      .catch((e) => {
        if (request !== requestRef.current || epoch !== cacheEpoch) return;
        setValue(null);
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (request === requestRef.current && epoch === cacheEpoch)
          setIsLoading(false);
      });
  }, [key]);

  useEffect(() => {
    run();
    if (!key) return;
    const unsubscribe = subscribe(key, run);
    return () => {
      requestRef.current += 1;
      unsubscribe();
    };
  }, [key, run]);

  useFocusEffect(
    useCallback(() => {
      run();
    }, [run]),
  );

  return {
    value: valueKeyRef.current === key ? value : null,
    isLoading,
    error,
    refetch: run,
  };
}

export function useApiMutation<TResult = unknown>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (body?: unknown): Promise<TResult> => {
      setIsLoading(true);
      setError(null);
      try {
        return await apiFetch<TResult>(path, { method, body });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [path, method],
  );

  return { mutate, isLoading, error };
}
