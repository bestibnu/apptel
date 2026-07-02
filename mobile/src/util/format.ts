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

/**
 * Parse text pasted into the dialer. Returns the extracted digits and whether
 * the text carried its own country code ("+<cc>..." or "00<cc>...").
 * If a "+" appears mid-text (paste appended after an existing prefix), the
 * pasted part wins. Bare national numbers are flagged so the dialer can apply
 * the selected country instead of guessing (guessing is how mis-dials happen).
 */
export function parsePastedNumber(
  text: string
): { digits: string; international: boolean } | null {
  const lastPlus = text.lastIndexOf("+");
  const t = lastPlus > 0 ? text.slice(lastPlus) : text;
  const hasPlus = t.trim().startsWith("+");
  let digits = t.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (hasPlus) return { digits, international: true };
  if (digits.startsWith("00")) return { digits: digits.slice(2), international: true };
  return { digits, international: false };
}
