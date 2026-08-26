import { getStorage } from "firebase-admin/storage";

/**
 * Stores an uploaded cotización/comprobante file in Cloud Storage — the
 * copy Paydesk itself serves ("Ver archivo" in the app links here
 * directly). A parallel copy also goes to HubSpot Files (see
 * hubspot/files.ts) so the Aviva team can see it without leaving HubSpot,
 * but that copy is access-gated to HubSpot logins, which is exactly wrong
 * for a concesionario or an admin clicking "Ver archivo" in Paydesk — this
 * is the link that actually opens for them.
 *
 * `storage.rules` denies all client read/write on this path — only Cloud
 * Functions (Admin SDK) ever touches it. The signed URL is what makes the
 * file reachable without going through those rules or requiring any
 * Paydesk/Firebase session; treat it as a bearer credential like any
 * shareable link.
 */
export async function storeDealFile(
  dealId: string,
  category: "cotizacion" | "comprobante",
  fileName: string,
  fileBuffer: Buffer,
  contentType?: string,
): Promise<{ url: string; path: string }> {
  const path = `paydesk_deals/${dealId}/${category}/${Date.now()}-${fileName}`;
  const file = getStorage().bucket().file(path);

  await file.save(fileBuffer, {
    contentType,
    resumable: false,
  });

  // Far-future expiry rather than no expiry — Cloud Storage signed URLs
  // don't support "never", so this is the practical equivalent for a
  // document that needs to stay reachable indefinitely.
  const [url] = await file.getSignedUrl({ action: "read", expires: "01-01-2500" });

  return { url, path };
}
