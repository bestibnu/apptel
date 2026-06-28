export function formatMoney(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}

/** Formats a per-minute rate (in minor units, e.g. cents) as "$0.02/min". */
export function formatRate(ratePerMinMinor: number): string {
  return `$${(ratePerMinMinor / 100).toFixed(2)}/min`;
}

export function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Best-effort E.164 normalization for display/sending. */
export function toE164(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) {
    return "+" + trimmed.slice(1).replace(/[^\d]/g, "");
  }
  return "+" + trimmed.replace(/[^\d]/g, "");
}
