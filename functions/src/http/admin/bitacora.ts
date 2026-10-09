import { onCall } from "firebase-functions/v2/https";
import { assertSuperAdmin } from "../../auth/adminGuard";
import { listarBitacora } from "../../firestore/bitacoraConfig";

/** Los últimos cambios de configuración, con su antes y después. Solo super admins. */
export const adminListBitacora = onCall({ region: "us-central1" }, async (request) => {
  assertSuperAdmin(request);
  const entradas = await listarBitacora(100);
  return {
    entradas: entradas.map((e) => ({
      documento: e.documento,
      antes: e.antes,
      despues: e.despues,
      por: e.por,
      en: e.en?.toMillis() ?? null,
    })),
  };
});
