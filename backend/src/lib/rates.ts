/**
 * Static per-destination calling rates (in cents per minute), keyed by E.164
 * country dialing prefix. This stands in for a real rate deck.
 *
 * Longest-prefix match wins, so more specific prefixes can override broad ones.
 */
export interface RateEntry {
  prefix: string; // without the leading "+"
  country: string;
  ratePerMinCents: number;
}

export const RATES: RateEntry[] = [
  { prefix: "1", country: "US / Canada", ratePerMinCents: 2 },
  { prefix: "44", country: "United Kingdom", ratePerMinCents: 3 },
  { prefix: "91", country: "India", ratePerMinCents: 2 },
  { prefix: "61", country: "Australia", ratePerMinCents: 4 },
  { prefix: "49", country: "Germany", ratePerMinCents: 3 },
  { prefix: "33", country: "France", ratePerMinCents: 3 },
  { prefix: "34", country: "Spain", ratePerMinCents: 3 },
  { prefix: "39", country: "Italy", ratePerMinCents: 3 },
  { prefix: "81", country: "Japan", ratePerMinCents: 5 },
  { prefix: "86", country: "China", ratePerMinCents: 4 },
  { prefix: "55", country: "Brazil", ratePerMinCents: 5 },
  { prefix: "52", country: "Mexico", ratePerMinCents: 4 },
  { prefix: "234", country: "Nigeria", ratePerMinCents: 9 },
  { prefix: "27", country: "South Africa", ratePerMinCents: 8 },
  { prefix: "971", country: "United Arab Emirates", ratePerMinCents: 12 },
  { prefix: "63", country: "Philippines", ratePerMinCents: 14 },
  { prefix: "92", country: "Pakistan", ratePerMinCents: 13 },
  { prefix: "880", country: "Bangladesh", ratePerMinCents: 11 },
];

const DEFAULT_RATE_CENTS = 15;

function normalize(e164: string): string {
  return e164.replace(/[^\d]/g, "");
}

/** Returns the best matching rate entry for an E.164 number (longest prefix). */
export function findRate(e164: string): { country: string; ratePerMinCents: number } {
  const digits = normalize(e164);
  let best: RateEntry | undefined;
  for (const entry of RATES) {
    if (digits.startsWith(entry.prefix)) {
      if (!best || entry.prefix.length > best.prefix.length) {
        best = entry;
      }
    }
  }
  if (best) {
    return { country: best.country, ratePerMinCents: best.ratePerMinCents };
  }
  return { country: "Other", ratePerMinCents: DEFAULT_RATE_CENTS };
}

/** Cost in cents for a call of `durationSec` seconds, billed per started minute. */
export function costForCall(e164: string, durationSec: number): { costCents: number; ratePerMinCents: number } {
  const { ratePerMinCents } = findRate(e164);
  const minutes = Math.ceil(Math.max(durationSec, 0) / 60);
  return { costCents: minutes * ratePerMinCents, ratePerMinCents };
}
