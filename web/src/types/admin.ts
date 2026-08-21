/** A store as shown in the admin catalog. */
export interface AdminConcesionario {
  concesionarioId: string;
  /** Raw HubSpot Kiosco value, e.g. `#0046 - TEQ CR`. Shown so the team can match rows against HubSpot. */
  kiosco: string;
  nombre: string;
  numero: string | null;
  /** Emails invited to sign in to this store. */
  usuarios: string[];
  /** Per-store rollout cutoff (ISO date), or null to follow the global one. */
  rolloutDesde: string | null;
}

/** Logical field name → HubSpot internal property name. */
export type FieldDictionary = Record<string, string>;

/** Logical field name → display label shown to a concesionario. Cosmetic only. */
export type FieldLabels = Record<string, string>;

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string | null;
  /** Epoch millis. */
  grantedAt: number;
  grantedByEmail: string | null;
}

export interface AdminAuditEntry {
  uid: string;
  email: string;
  action: "granted" | "revoked";
  performedByEmail: string | null;
  /** Epoch millis. */
  at: number;
}
