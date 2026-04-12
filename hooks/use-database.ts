import { get, onValue, ref, set } from 'firebase/database';
import { useCallback, useEffect, useState } from 'react';

import { db } from '@/config/firebase';

/**
 * Read a numeric value from the Realtime Database once.
 *
 * Usage:
 *   const { value, isLoading, error } = useDatabaseValue('stats/max_score');
 */
export function useDatabaseValue(path: string) {
  const [value, setValue] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    get(ref(db, path))
      .then((snapshot) => setValue(snapshot.exists() ? (snapshot.val() as number) : null))
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false));
  }, [path]);

  return { value, isLoading, error };
}

/**
 * Write a numeric value to the Realtime Database.
 *
 * Usage:
 *   const { write, isLoading, error } = useDatabaseWrite('stats/max_score');
 *   await write(42);
 */
export function useDatabaseWrite(path: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const write = useCallback(
    async (value: number) => {
      setIsLoading(true);
      setError(null);
      try {
        await set(ref(db, path), value);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [path]
  );

  return { write, isLoading, error };
}

/**
 * Subscribe to any value in the Realtime Database with live updates.
 *
 * Usage:
 *   const { value } = useDatabaseLiveValue<string>('users/abc/sports/active');
 */
export function useDatabaseLiveValue<T>(path: string) {
  const [value, setValue] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = onValue(
      ref(db, path),
      (snapshot) => {
        setValue(snapshot.exists() ? (snapshot.val() as T) : null);
        setIsLoading(false);
      },
      (err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      },
    );
    return unsubscribe;
  }, [path]);

  return { value, isLoading, error };
}
