import { createHmac } from "crypto";
import { env } from "../config/env";

/**
 * In HubSpot the concesionario is the deal's "Kiosco" property: a
 * multiple-checkbox field whose options look like `#0046 - TEQ CR`
 * (order number, store abbreviation, "CR" for Construrama). This module
 * turns that raw value into the two things the rest of the app needs:
 * a URL-safe opaque id, and something a human can actually read.
 */

/**
 * HubSpot serializes multiple-checkbox values as a semicolon-separated
 * list. A solicitud belongs to exactly one store, so we take the first
 * selected option — but callers get the full list so they can log when a
 * deal unexpectedly carries more than one.
 *
 * TODO: confirm with the HubSpot admin whether a deal can legitimately
 * have several Kioscos checked. If it can, this page needs a rule for
 * which store the solicitud shows up under.
 */
export function parseKioscoValue(raw: string | null | undefined): {
  primary: string | null;
  all: string[];
} {
  if (!raw) return { primary: null, all: [] };
  const all = raw
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return { primary: all[0] ?? null, all };
}

/**
 * Derives the opaque id that identifies a concesionario in its page URL.
 *
 * The raw Kiosco value can't be used directly: `#0046 - TEQ CR` contains a
 * `#` (a URL fragment delimiter) and spaces, and its numbering is
 * sequential across ~481 stores — so anyone could enumerate every store's
 * page by counting up. Since the whole access model rests on the URL not
 * being guessable (requirement section 8), the id is an HMAC of the Kiosco
 * value under a secret salt: stable for a given store, but not derivable
 * without the salt.
 *
 * Deterministic by design — no lookup table, no write race when two deals
 * for a new store sync at the same time.
 */
export function deriveConcesionarioId(kioscoValue: string): string {
  return createHmac("sha256", env.payDeskIdSalt)
    .update(kioscoValue)
    .digest("base64url")
    .slice(0, 22);
}

/**
 * Turns `#0046 - TEQ CR` into something presentable for the store's own
 * page header. The raw option text is internal HubSpot nomenclature and
 * reads as noise to a concesionario, so we split it into a name and a
 * store number shown as secondary detail.
 *
 * TODO: `TEQ` is an internal abbreviation whose expansion we don't have.
 * If Aviva has a catalog mapping these codes to real store names
 * ("Construrama Tequila", etc.), feed it in here — that's the name the
 * concesionario would actually recognize.
 */
export function formatKioscoDisplay(kioscoValue: string): {
  nombre: string;
  numero: string | null;
} {
  const match = kioscoValue.match(/^#?(\d+)\s*-\s*(.+)$/);
  if (!match) {
    return { nombre: kioscoValue.trim(), numero: null };
  }
  const [, numero, resto] = match;

  // Options end in "CR" (Construrama); move it to the front so the name
  // reads as a store name instead of an internal code string.
  const sinSufijo = resto.replace(/\s*\bCR\b\s*$/, "").trim();
  const nombre = sinSufijo ? `Construrama ${sinSufijo}` : "Construrama";

  return { nombre, numero };
}
