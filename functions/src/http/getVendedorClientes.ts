import { onCall, HttpsError } from "firebase-functions/v2/https";
import { exigirAppCheck } from "../auth/appCheck";
import { limitar } from "../auth/rateLimit";
import { getConcesionariosByIds } from "../firestore/concesionariosRepository";
import { getDealsByConcesionarioIds } from "../firestore/dealsRepository";
import { getEtapas } from "../firestore/etapasRepository";
import { clientesParaVendedor } from "../vendedor/proyeccion";

/**
 * La vista de un vendedor externo: los clientes aprobados de sus tiendas
 * y en qué etapa va cada uno.
 *
 * Las tiendas salen del claim `vendedorIds` del token, nunca del cuerpo de
 * la llamada. Los deals pasan por `clientesParaVendedor`, que deja solo
 * nombre, fecha, monto aprobado y etapas; por eso esto es una función y no un listener de
 * Firestore como el de la tienda, que entregaría el documento completo.
 *
 * Es solo lectura. El vendedor no tiene `concesionarioIds` para esas
 * tiendas, así que subir documentos, ver archivos, validar o confirmar
 * vales lo rechazan las propias funciones que ya revisan ese claim.
 */
export const getVendedorClientes = onCall({ region: "us-central1" }, async (request) => {
  const uid = request.auth?.uid;
  const vendedorIds = request.auth?.token?.vendedorIds as string[] | undefined;
  if (!uid || !vendedorIds || vendedorIds.length === 0) {
    throw new HttpsError(
      "permission-denied",
      "Tu cuenta no tiene acceso de consulta a ninguna tienda.",
    );
  }
  exigirAppCheck(request);
  // Una persona recarga unas cuantas veces por hora; cientos de llamadas
  // en minutos no es alguien consultando.
  await limitar("getVendedorClientes", uid, { max: 120, ventanaSeg: 600 });

  const [concesionarios, deals, etapas] = await Promise.all([
    getConcesionariosByIds(vendedorIds),
    getDealsByConcesionarioIds(vendedorIds),
    getEtapas(),
  ]);

  return {
    concesionarios: concesionarios.map((c) => ({
      concesionarioId: c.concesionarioId,
      nombre: c.nombre,
      numero: c.numero,
    })),
    clientes: clientesParaVendedor(deals),
    etapas,
    consultadoEn: new Date().toISOString(),
  };
});
