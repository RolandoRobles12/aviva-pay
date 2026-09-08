import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getValePorToken } from "../firestore/valesRepository";
import { getConcesionario } from "../firestore/concesionariosRepository";
import { formatearCodigo } from "../vale/codigo";
import { valeVencido } from "../vale/validar";

interface GetValeRequest {
  token?: string;
}

/**
 * La página que abre el cliente desde el link de WhatsApp.
 *
 * Es el único endpoint sin sesión de todo Paydesk: el destinatario es el
 * cliente final, que no tiene cuenta y no va a tener una. Lo que protege
 * la página es el token de la URL — 128 bits, no enumerable — y no el
 * código de 10 dígitos, que es corto a propósito para poder teclearse y
 * va impreso en el propio vale.
 *
 * Devuelve únicamente lo que el vale enseña. En particular NO devuelve el
 * dealId ni el concesionarioId: la página no los necesita, y el link
 * viaja por WhatsApp, que es un canal que se reenvía.
 */
export const getVale = onCall<GetValeRequest>(
  { region: "us-central1" },
  async (request) => {
    const token = (request.data?.token ?? "").trim();
    if (!/^[a-f0-9]{32}$/.test(token)) {
      throw new HttpsError("not-found", "Este vale no existe o ya no está disponible.");
    }

    const vale = await getValePorToken(token);
    if (!vale) {
      throw new HttpsError("not-found", "Este vale no existe o ya no está disponible.");
    }

    const concesionario = await getConcesionario(vale.concesionarioId);

    return {
      codigo: vale.codigo,
      codigoFormateado: formatearCodigo(vale.codigo),
      cliente: vale.cliente,
      montoAutorizado: vale.montoAutorizado,
      // El nombre externo que el admin capturó, nunca el valor crudo de
      // Kiosco ni el número interno de tienda.
      tienda: concesionario?.nombre ?? null,
      venceEn: vale.venceEn,
      estado: valeVencido(vale) && vale.estado === "emitido" ? "vencido" : vale.estado,
    };
  },
);
