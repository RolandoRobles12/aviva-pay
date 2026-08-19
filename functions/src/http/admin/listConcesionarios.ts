import { onCall } from "firebase-functions/v2/https";
import { assertAdmin } from "../../auth/adminGuard";
import { listConcesionarios as readConcesionarios } from "../../firestore/concesionariosRepository";

/**
 * The admin store catalog. Stores appear here automatically the first time
 * a deal for their Kiosco syncs from HubSpot — the panel is for naming
 * them and issuing credentials, not for creating them by hand.
 *
 * Returns credential *status* (does a NIP exist, when was it set, is the
 * store locked out) but never the NIP or its hash.
 */
export const adminListConcesionarios = onCall(
  { region: "us-central1" },
  async (request) => {
    assertAdmin(request);

    const concesionarios = await readConcesionarios();

    return {
      concesionarios: concesionarios.map((c) => ({
        concesionarioId: c.concesionarioId,
        kiosco: c.kiosco,
        nombre: c.nombre,
        numero: c.numero,
        codigo: c.codigo,
        tieneNip: c.nipHash !== null,
        nipActualizadoEn: c.nipActualizadoEn?.toMillis() ?? null,
        ultimoAccesoEn: c.ultimoAccesoEn?.toMillis() ?? null,
        bloqueado:
          c.bloqueadoHasta !== null &&
          c.bloqueadoHasta.toMillis() > Date.now(),
      })),
    };
  },
);
