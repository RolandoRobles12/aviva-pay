import { randomBytes, randomInt, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/** Digits in a generated NIP. Six keeps it dictatable by phone while making online guessing impractical alongside the lockout in loginConcesionario. */
export const NIP_LENGTH = 6;

/**
 * Generates a random NIP. Uses `randomInt` (CSPRNG, rejection-sampled) so
 * every digit is uniform — `Math.random()` would be both predictable and
 * slightly biased.
 */
export function generateNip(): string {
  let nip = "";
  for (let i = 0; i < NIP_LENGTH; i++) {
    nip += randomInt(0, 10).toString();
  }
  return nip;
}

/**
 * Hashes a NIP for storage. NIPs are never stored in the clear: anyone
 * with read access to Firestore (a leaked backup, an over-broad service
 * account) would otherwise hold the keys to every store's data.
 *
 * scrypt is deliberately slow, which matters here because the keyspace is
 * only 10^6 — a fast hash would let an attacker who obtained the database
 * exhaust every NIP in seconds.
 */
export async function hashNip(nip: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(nip, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

/** Verifies a NIP against a stored hash. Returns false on malformed input rather than throwing. */
export async function verifyNip(nip: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[1], "base64");
  const expected = Buffer.from(parts[2], "base64");
  if (expected.length !== KEY_LENGTH) return false;

  const derived = await scryptAsync(nip, salt, KEY_LENGTH);
  return timingSafeEqual(derived, expected);
}
