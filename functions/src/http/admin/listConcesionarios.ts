import { onCall } from "firebase-functions/v2/https";
import { assertAdmin } from "../../auth/adminGuard";
import { listConcesionarios as readConcesionarios } from "../../firestore/concesionariosRepository";
import { listCapacitacionPorCorreo } from "../../firestore/capacitacionRepository";

/**
 * The admin store catalog. Stores appear here automatically the first time
 * a deal for their Kiosco syncs from HubSpot — the panel is for naming
 * them and inviting who's allowed to sign in, not for creating stores by
 * hand.
 */
export const adminListConcesionarios = onCall(
  { region: "us-central1" },
  async (request) => {
    assertAdmin(request);

    const [concesionarios, capacitacionPorCorreo] = await Promise.all([
      readConcesionarios(),
      listCapacitacionPorCorreo(),
    ]);

    return {
      concesionarios: concesionarios.map((c) => ({
        concesionarioId: c.concesionarioId,
        kiosco: c.kiosco,
        nombre: c.nombre,
        numero: c.numero,
        usuarios: c.usuarios ?? [],
        rolloutDesde: c.rolloutDesde ?? null,
      })),
      // Por correo y no por tienda: el mismo correo puede estar en varias
      // tiendas y la capacitación es de la persona. Un correo que nunca
      // entró no aparece aquí.
      capacitacionPorCorreo,
    };
  },
);
