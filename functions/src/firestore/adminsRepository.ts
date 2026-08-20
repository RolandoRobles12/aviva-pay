import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const ADMINS_COLLECTION = "paydesk_admins";
const AUDIT_COLLECTION = "paydesk_admin_audit";

export interface AdminRosterEntry {
  uid: string;
  email: string;
  displayName: string | null;
  grantedAt: Timestamp;
  grantedByUid: string;
  grantedByEmail: string | null;
  revokedAt: Timestamp | null;
}

export interface AdminAuditEntry {
  uid: string;
  email: string;
  action: "granted" | "revoked";
  performedByUid: string;
  performedByEmail: string | null;
  at: Timestamp;
}

function adminsCollection() {
  return getFirestore().collection(ADMINS_COLLECTION);
}

function auditCollection() {
  return getFirestore().collection(AUDIT_COLLECTION);
}

/**
 * Current roster, most recently granted first. Filtered in memory rather
 * than with a `where("revokedAt", "==", null)` query so this doesn't need
 * a composite index — the admin list is small enough (dozens, not
 * thousands) that reading it all and filtering is simpler to deploy.
 */
export async function listActiveAdmins(): Promise<AdminRosterEntry[]> {
  const snap = await adminsCollection().orderBy("grantedAt", "desc").get();
  return snap.docs
    .map((doc) => doc.data() as AdminRosterEntry)
    .filter((a) => a.revokedAt === null);
}

export async function getAdminRosterEntry(
  uid: string,
): Promise<AdminRosterEntry | null> {
  const snap = await adminsCollection().doc(uid).get();
  return snap.exists ? (snap.data() as AdminRosterEntry) : null;
}

export async function recordAdminGranted(params: {
  uid: string;
  email: string;
  displayName: string | null;
  performedByUid: string;
  performedByEmail: string | null;
}): Promise<void> {
  const batch = getFirestore().batch();

  batch.set(adminsCollection().doc(params.uid), {
    uid: params.uid,
    email: params.email,
    displayName: params.displayName,
    grantedAt: FieldValue.serverTimestamp(),
    grantedByUid: params.performedByUid,
    grantedByEmail: params.performedByEmail,
    revokedAt: null,
  });

  batch.set(auditCollection().doc(), {
    uid: params.uid,
    email: params.email,
    action: "granted",
    performedByUid: params.performedByUid,
    performedByEmail: params.performedByEmail,
    at: FieldValue.serverTimestamp(),
  });

  await batch.commit();
}

export async function recordAdminRevoked(params: {
  uid: string;
  email: string;
  performedByUid: string;
  performedByEmail: string | null;
}): Promise<void> {
  const batch = getFirestore().batch();

  batch.set(
    adminsCollection().doc(params.uid),
    { revokedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  batch.set(auditCollection().doc(), {
    uid: params.uid,
    email: params.email,
    action: "revoked",
    performedByUid: params.performedByUid,
    performedByEmail: params.performedByEmail,
    at: FieldValue.serverTimestamp(),
  });

  await batch.commit();
}

/** Most recent grant/revoke events across every admin, newest first. */
export async function listAuditLog(limit: number): Promise<AdminAuditEntry[]> {
  const snap = await auditCollection().orderBy("at", "desc").limit(limit).get();
  return snap.docs.map((doc) => doc.data() as AdminAuditEntry);
}
