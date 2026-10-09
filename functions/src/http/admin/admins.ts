import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getAuth } from "firebase-admin/auth";
import { assertSuperAdmin, type AdminRol } from "../../auth/adminGuard";
import {
  getAdminRosterEntry,
  listActiveAdmins,
  listAuditLog,
  recordAdminGranted,
  recordAdminRevoked,
  recordAdminRolChanged,
} from "../../firestore/adminsRepository";

/** Roster of active admins plus the recent grant/revoke history, for the "Administradores" screen. */
export const adminListAdmins = onCall({ region: "us-central1" }, async (request) => {
  assertSuperAdmin(request);

  const [admins, auditLog] = await Promise.all([
    listActiveAdmins(),
    listAuditLog(50),
  ]);

  return {
    admins: admins.map((a) => ({
      uid: a.uid,
      email: a.email,
      displayName: a.displayName,
      rol: a.rol ?? "super",
      grantedAt: a.grantedAt.toMillis(),
      grantedByEmail: a.grantedByEmail,
    })),
    auditLog: auditLog.map((e) => ({
      uid: e.uid,
      email: e.email,
      action: e.action,
      rol: e.rol ?? null,
      performedByEmail: e.performedByEmail,
      at: e.at.toMillis(),
    })),
  };
});

interface CreateAdminRequest {
  email?: string;
  /** Por defecto `operador`: el permiso más amplio se da a propósito, no por omisión. */
  rol?: AdminRol;
}

function esRol(v: unknown): v is AdminRol {
  return v === "super" || v === "operador";
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
    const caller = assertSuperAdmin(request);
    const email = request.data?.email?.trim().toLowerCase();
    const rolPedido = request.data?.rol ?? "operador";
    if (!esRol(rolPedido)) {
      throw new HttpsError("invalid-argument", "Rol inválido.");
    }
    const rol: AdminRol = rolPedido;

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
    await auth.setCustomUserClaims(user.uid, {
      ...user.customClaims,
      admin: true,
      adminRol: rol,
    });
    await recordAdminGranted({
      uid: user.uid,
      email,
      displayName: user.displayName ?? null,
      rol,
      performedByUid: caller.uid,
      performedByEmail: caller.email ?? null,
    });

    logger.info(
      `adminCreateAdmin: ${email} granted admin (${rol}) by ${caller.email ?? caller.uid}`,
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
    const caller = assertSuperAdmin(request);
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
    const { adminRol: _rol, ...resto } = user.customClaims ?? {};
    await auth.setCustomUserClaims(uid, { ...resto, admin: false });
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

interface SetRolRequest {
  uid?: string;
  rol?: AdminRol;
}

/**
 * Cambia el rol de un administrador. Nadie cambia el suyo: un super admin
 * que se bajara a operador podría dejar el panel sin nadie que administre
 * — y como quien llama ya es super y no se puede tocar, siempre queda uno.
 *
 * El claim nuevo llega al token de esa persona cuando se refresca (el
 * panel lo fuerza al abrirse; si ya lo tenía abierto, al recargar).
 */
export const adminSetAdminRol = onCall<SetRolRequest>(
  { region: "us-central1" },
  async (request) => {
    const caller = assertSuperAdmin(request);
    const { uid, rol } = request.data ?? {};
    if (!uid || !esRol(rol)) {
      throw new HttpsError("invalid-argument", "uid y rol son requeridos.");
    }
    if (uid === caller.uid) {
      throw new HttpsError("failed-precondition", "No puedes cambiar tu propio rol.");
    }

    const entry = await getAdminRosterEntry(uid);
    if (!entry || entry.revokedAt !== null) {
      throw new HttpsError("not-found", "Esa cuenta no está en la lista de administradores.");
    }

    const auth = getAuth();
    const user = await auth.getUser(uid);
    await auth.setCustomUserClaims(uid, { ...user.customClaims, admin: true, adminRol: rol });
    await recordAdminRolChanged({
      uid,
      email: entry.email,
      rol,
      performedByUid: caller.uid,
      performedByEmail: caller.email ?? null,
    });

    logger.info(`adminSetAdminRol: ${entry.email} → ${rol} por ${caller.email ?? caller.uid}`);
    return { ok: true };
  },
);
