import * as React from "react";

/** Returns a stable debounced wrapper; flush on unmount is not attempted (fire-and-forget API calls). */
export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delayMs: number
): T {
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  return React.useCallback(
    ((...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delayMs);
    }) as T,
    [delayMs]
  );
}
