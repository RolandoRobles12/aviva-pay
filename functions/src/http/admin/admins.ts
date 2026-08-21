import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getAuth } from "firebase-admin/auth";
import { assertAdmin } from "../../auth/adminGuard";
import {
  getAdminRosterEntry,
  listActiveAdmins,
  listAuditLog,
  recordAdminGranted,
  recordAdminRevoked,
} from "../../firestore/adminsRepository";

/** Roster of active admins plus the recent grant/revoke history, for the "Administradores" screen. */
export const adminListAdmins = onCall({ region: "us-central1" }, async (request) => {
  assertAdmin(request);

  const [admins, auditLog] = await Promise.all([
    listActiveAdmins(),
    listAuditLog(50),
  ]);

  return {
    admins: admins.map((a) => ({
      uid: a.uid,
      email: a.email,
      displayName: a.displayName,
      grantedAt: a.grantedAt.toMillis(),
      grantedByEmail: a.grantedByEmail,
    })),
    auditLog: auditLog.map((e) => ({
      uid: e.uid,
      email: e.email,
      action: e.action,
      performedByEmail: e.performedByEmail,
      at: e.at.toMillis(),
    })),
  };
});

interface CreateAdminRequest {
  email?: string;
}

/**
 * Grants the `admin` claim to an email. If no Firebase Auth account exists
 * for it yet, one is created bare (no password) — the new admin signs in
 * with Google using this exact email, which Firebase links to that account
 * automatically since it has no other sign-in method attached yet.
 *
 * This only works for adding admins *after* the first one — someone still
 * has to exist with the claim to call it. The first admin is granted out
 * of band (see docs/ARCHITECTURE.md — "Alta de administradores").
 */
export const adminCreateAdmin = onCall<CreateAdminRequest>(
  { region: "us-central1" },
  async (request) => {
    const caller = assertAdmin(request);
    const email = request.data?.email?.trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "Correo inválido.");
    }

    const auth = getAuth();
    let user;
    try {
      user = await auth.getUserByEmail(email);
    } catch (err) {
      if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
      user = await auth.createUser({ email, emailVerified: false });
    }

    if (user.customClaims?.admin === true) {
      throw new HttpsError("already-exists", "Esa cuenta ya es administradora.");
    }

    // Spread the existing claims — this account may also be an invited
    // concesionario user (concesionarioIds), and setCustomUserClaims
    // replaces the whole claims object rather than merging into it.
    await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
    await recordAdminGranted({
      uid: user.uid,
      email,
      displayName: user.displayName ?? null,
      performedByUid: caller.uid,
      performedByEmail: caller.email ?? null,
    });

    logger.info(
      `adminCreateAdmin: ${email} granted admin by ${caller.email ?? caller.uid}`,
    );

    return { ok: true };
  },
);

interface RevokeAdminRequest {
  uid?: string;
}

/** Revokes the `admin` claim. An admin can't revoke their own access — that's how you'd lock everyone out. */
export const adminRevokeAdmin = onCall<RevokeAdminRequest>(
  { region: "us-central1" },
  async (request) => {
    const caller = assertAdmin(request);
    const uid = request.data?.uid;

    if (!uid) {
      throw new HttpsError("invalid-argument", "uid es requerido");
    }
    if (uid === caller.uid) {
      throw new HttpsError(
        "failed-precondition",
        "No puedes quitarte tu propio acceso de administrador.",
      );
    }

    const entry = await getAdminRosterEntry(uid);
    if (!entry || entry.revokedAt !== null) {
      throw new HttpsError("not-found", "Esa cuenta no está en la lista de administradores.");
    }

    const auth = getAuth();
    const user = await auth.getUser(uid);
    // Spread the existing claims for the same reason as adminCreateAdmin —
    // this account may also carry a concesionarioIds claim.
    await auth.setCustomUserClaims(uid, { ...user.customClaims, admin: false });
    await recordAdminRevoked({
      uid,
      email: entry.email,
      performedByUid: caller.uid,
      performedByEmail: caller.email ?? null,
    });

    logger.info(
      `adminRevokeAdmin: ${entry.email} revoked by ${caller.email ?? caller.uid}`,
    );

    return { ok: true };
  },
);
