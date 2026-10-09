import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

/**
 * Los dos tipos de administrador de Aviva:
 * - `super` — todo, incluida la configuración (diccionario, etapas,
 *   verificación, notificaciones, vales, arranque) y el alta de otros
 *   administradores.
 * - `operador` — el día a día: revisar documentos, ver tiendas e invitar
 *   a sus usuarios, vales y reportes. No toca configuración ni
 *   administradores.
 *
 * El rol viaja en el claim `adminRol` junto a `admin: true`. Una cuenta
 * con `admin: true` y sin `adminRol` es de antes de que existieran los
 * roles y cuenta como `super`: así nadie perdió acceso al desplegar.
 */
export type AdminRol = "super" | "operador";

export function rolDeClaims(claims: Record<string, unknown> | undefined): AdminRol {
  return claims?.adminRol === "operador" ? "operador" : "super";
}

export interface AdminCaller {
  uid: string;
  email: string | undefined;
  rol: AdminRol;
}

/**
 * Asserts the caller is an Aviva admin of either role, i.e. signed in with
 * a Firebase Auth account carrying the `admin: true` custom claim.
 *
 * The claim is set out of band for the first admin (see
 * docs/ARCHITECTURE.md — "Alta de administradores") and by a super admin
 * afterwards, never by the account itself: if the app let anyone grant it,
 * anyone who signed up could promote themselves.
 */
export function assertAdmin(request: CallableRequest<unknown>): AdminCaller {
  const token = request.auth?.token;
  if (!token || token.admin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Esta operación requiere una cuenta de administrador de Aviva.",
    );
  }
  return { uid: request.auth!.uid, email: token.email, rol: rolDeClaims(token) };
}

/** Como `assertAdmin`, pero solo para super admins: configuración y administradores. */
export function assertSuperAdmin(request: CallableRequest<unknown>): AdminCaller {
  const caller = assertAdmin(request);
  if (caller.rol !== "super") {
    throw new HttpsError(
      "permission-denied",
      "Esta operación requiere un super administrador.",
    );
  }
  return caller;
}
