/** Estados que la caja puede recibir al validar un código (ver functions/src/vale/validar.ts). */
export type ValidacionVale =
  | {
      estado: "ok";
      codigo: string;
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
