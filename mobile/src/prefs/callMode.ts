import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

export type CallMode = "auto" | "internet" | "no-internet";

const KEY = "call_mode";
const DEFAULT: CallMode = "auto";

function isCallMode(v: string | null): v is CallMode {
  return v === "auto" || v === "internet" || v === "no-internet";
}

/**
 * Persisted preference for how outbound calls are routed:
 *  - auto:        prefer the internet when reachable, else the phone network
 *  - internet:    always place a VoIP (data) call
 *  - no-internet: always use the local access number (phone network)
 */
export function useCallMode() {
  const [mode, setModeState] = useState<CallMode>(DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(KEY)
      .then((v) => {
        if (active && isCallMode(v)) setModeState(v);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: CallMode) => {
    setModeState(next);
    SecureStore.setItemAsync(KEY, next).catch(() => {});
  }, []);

  return { mode, setMode, ready };
}
