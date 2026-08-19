/**
 * In HubSpot the concesionario is the deal's "Kiosco" property: a
 * multiple-checkbox field whose options look like `#0046 - TEQ CR`
 * (order number, store abbreviation, "CR" for Construrama). This module
 * turns that raw value into the pieces the rest of the app needs.
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
 * Firestore document id for a store, derived from its Kiosco value:
 * `#0046 - TEQ CR` → `0046-teq-cr`.
 *
 * Deterministic, so concurrent syncs for a newly-seen store converge on
 * the same document without a lookup table or a write race. This id never
 * appears in a URL — concesionarios authenticate with a código and NIP
 * (see http/loginConcesionario.ts), so it doesn't need to be unguessable,
 * and being readable makes the admin catalog and logs easier to follow.
 */
export function deriveConcesionarioId(kioscoValue: string): string {
  return kioscoValue
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Splits `#0046 - TEQ CR` into the store number and a fallback display
 * name. The raw option text is internal HubSpot nomenclature and reads as
 * noise to a concesionario, so the page shows a name plus the store
 * number as secondary detail.
 *
 * `nombre` here is only a starting point: `TEQ` is an internal
 * abbreviation whose expansion we don't have, so the admin catalog lets
 * the team override it with the store's real name (see
 * http/admin/updateConcesionario.ts). That override is what the store
 * actually sees.
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
