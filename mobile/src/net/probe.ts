import { API_BASE_URL } from "../config";

export interface ProbeResult {
  reachable: boolean;
  latencyMs: number | null;
}

/**
 * Lightweight internet reachability check used to decide whether a VoIP call is
 * viable right now. We hit the backend /health endpoint with a short timeout
 * instead of pulling in a native connectivity module — a timely, successful
 * response is a better signal for "can I place a data call" than the radio type
 * (a phone can report "connected" while sitting on unusable 1-bar data).
 */
export async function probeInternet(timeoutMs = 2500): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE_URL}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    return { reachable: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { reachable: false, latencyMs: null };
  } finally {
    clearTimeout(timer);
  }
}
