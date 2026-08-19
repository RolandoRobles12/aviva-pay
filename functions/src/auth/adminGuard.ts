import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

/**
 * Asserts the caller is an Aviva admin, i.e. signed in with a Firebase Auth
 * email/password account carrying the `admin: true` custom claim.
 *
 * The claim is set out of band (see docs/ARCHITECTURE.md — "Alta de
 * administradores"), never from the app itself: if the app could grant it,
 * anyone who signed up could promote themselves. Simply having an account
 * is not enough — every admin endpoint calls this.
 */
export function assertAdmin(request: CallableRequest<unknown>): {
  uid: string;
  email: string | undefined;
} {
  const token = request.auth?.token;
  if (!token || token.admin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Esta operación requiere una cuenta de administrador de Aviva.",
    );
  }
  return { uid: request.auth!.uid, email: token.email };
}
