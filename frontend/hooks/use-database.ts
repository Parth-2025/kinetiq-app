import { get, onValue, ref, set } from 'firebase/database';
import { useCallback, useEffect, useState } from 'react';

import { db } from '@/config/firebase';

export function useDatabaseValue<T>(path: string | null) {
  const [value, setValue] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!path) {
      setValue(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    get(ref(db, path))
      .then((snapshot) => setValue(snapshot.exists() ? (snapshot.val() as T) : null))
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false));
  }, [path]);

  return { value, isLoading, error };
}

export function useDatabaseWrite<T>(path: string | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const write = useCallback(
    async (value: T) => {
      if (!path) {
        throw new Error('Cannot write to the Realtime Database without a path.');
      }

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

export function useDatabaseLiveValue<T>(path: string | null) {
  const [value, setValue] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!path) {
      setValue(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
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
