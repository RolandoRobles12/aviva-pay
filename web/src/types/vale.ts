/** Estados que la caja puede recibir al validar un código (ver functions/src/vale/validar.ts). */
export type ValidacionVale =
  | {
      estado: "ok";
      codigo: string;
      /** A qué solicitud pertenece — para avisar si la caja escaneó el vale de otro cliente. */
      dealId: string;
      cliente: string | null;
      montoAutorizado: number | null;
      emitidoEn: string | null;
      venceEn: string;
      /** Lecturas anteriores a esta. Mayor que cero significa que el vale ya circuló. */
      lecturasPrevias: number;
      ultimaLecturaEn: string | null;
    }
  | { estado: "no-existe" }
  | { estado: "otra-tienda" }
  | { estado: "ya-utilizado"; consumidoEn: string | null; montoDispuesto: number | null }
  | { estado: "vencido"; venceEn: string; emitidoEn: string | null }
  | { estado: "cancelado" };

/** Lo que ve el cliente al abrir el link de su vale. */
export interface ValePublico {
  codigo: string;
  codigoFormateado: string;
  cliente: string | null;
  montoAutorizado: number | null;
  /** Nombre externo de la tienda, el que captura el admin. */
  tienda: string | null;
  venceEn: string;
  estado: "emitido" | "utilizado" | "cancelado" | "vencido";
}

/** El detalle completo de un vale, solo para el panel de Aviva. */
export interface ValeAdmin {
  codigo: string;
  codigoFormateado: string;
  url: string;
  dealId: string;
  cliente: string | null;
  tienda: string;
  montoAutorizado: number | null;
  estado: "emitido" | "utilizado" | "cancelado" | "vencido";
  emitidoEn: string | null;
  venceEn: string;
  lecturasTotal: number;
  ultimaLecturaEn: string | null;
  consumidoEn: string | null;
  montoDispuesto: number | null;
}

/** Los totales del reporte de vales (ver functions/src/http/admin/valeReporte.ts). */
export interface ValeReporte {
  totales: { vigente: number; utilizado: number; vencido: number; cancelado: number };
  /** De los que murieron sin usarse: ¿el cliente llegó al mostrador o no? */
  sinUsar: { nuncaLeidos: number; leidosSinUsar: number };
  montos: {
    autorizadoDeUtilizados: number;
    dispuesto: number;
    /** Autorizado menos dispuesto en los vales usados: crédito aprobado que no se ejerció. */
    subejercido: number;
    /** Vales que vencieron o se cancelaron sin usarse — crédito liberado que nadie gastó. */
    nuncaGastado: number;
  };
  porTienda: Array<{
    concesionarioId: string;
    tienda: string;
    vigente: number;
    utilizado: number;
    vencido: number;
    cancelado: number;
    montoDispuesto: number;
    montoNuncaGastado: number;
  }>;
}

/** Un intento sospechoso: código inexistente, o código de otra tienda. */
export interface ValeIntento {
  codigo: string;
  motivo: "no-existe" | "otra-tienda";
  medio: "escaneo" | "manual";
  concesionarioId: string | null;
  uid: string;
  email: string | null;
  en: string | null;
}
