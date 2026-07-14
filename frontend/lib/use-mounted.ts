"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** True only after client hydration — for client-only UI (e.g. wallet detection) that
 * would otherwise mismatch server-rendered markup. Avoids the effect+setState pattern via
 * useSyncExternalStore, which can report a different snapshot for server vs client. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
