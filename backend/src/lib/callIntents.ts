/**
 * Pending "access number" call intents for the no-internet (two-stage dialing)
 * flow. The user registers who they want to call from the app, then dials the
 * shared local access number from their regular phone; the inbound webhook
 * matches their caller ID (phone) to the intent and bridges the call.
 *
 * In-memory with a short TTL for the MVP. For production this should move to a
 * shared store (e.g. Redis) so it survives restarts and works across instances.
 */
interface CallIntent {
  toNumber: string;
  expiresAt: number;
}

const intents = new Map<string, CallIntent>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes to dial the access number

/** Reduce a phone number to digits so "+44 20..." and "+4420..." match. */
function key(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/** Register the destination a given phone intends to call. */
export function setIntent(phone: string, toNumber: string): void {
  intents.set(key(phone), { toNumber, expiresAt: Date.now() + TTL_MS });
}

/** Atomically fetch-and-clear the destination for a phone, or null if none/expired. */
export function consumeIntent(phone: string): string | null {
  const k = key(phone);
  const intent = intents.get(k);
  if (!intent) return null;
  intents.delete(k);
  if (Date.now() > intent.expiresAt) return null;
  return intent.toNumber;
}
