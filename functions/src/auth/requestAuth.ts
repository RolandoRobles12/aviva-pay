import { getAuth } from "firebase-admin/auth";
import type { Request } from "firebase-functions/v2/https";

/**
 * Verifies the Firebase ID token on an onRequest function and returns its
 * claims. The callable functions get this for free via `request.auth`, but
 * the upload endpoints take multipart bodies, so they run as onRequest and
 * have to check the Authorization header themselves.
 *
 * Returns null when the header is missing or the token doesn't verify —
 * callers turn that into a 401.
 */
export async function verifyBearerToken(
  req: Request,
): Promise<{ concesionarioIds?: string[]; admin?: boolean } | null> {
  const header = req.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;

  try {
    const decoded = await getAuth().verifyIdToken(header.slice(7));
    return {
      concesionarioIds: decoded.concesionarioIds as string[] | undefined,
      admin: decoded.admin === true,
    };
  } catch {
    return null;
  }
}
