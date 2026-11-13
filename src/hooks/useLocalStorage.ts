import { useCallback, useEffect, useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) return initialValue;
      const parsed = JSON.parse(item) as T;
      if (
        typeof initialValue === 'object' &&
        initialValue !== null &&
        !Array.isArray(initialValue) &&
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return { ...initialValue, ...parsed };
      }
      return parsed;
    } catch {
      return initialValue;
    }
  });

  const setValue: React.Dispatch<React.SetStateAction<T>> = useCallback(
    (value) => {
      setStoredValue((prev) => {
        const nextValue = value instanceof Function ? value(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(nextValue));
        } catch {
          // Ignore storage quota errors
        }
        return nextValue;
      });
    },
    [key]
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch {
      // Ignore storage quota errors
    }
  }, [key, storedValue]);

  return [storedValue, setValue];
}
