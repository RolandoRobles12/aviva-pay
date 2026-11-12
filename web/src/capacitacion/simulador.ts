import type { ValidacionVale } from "../types/vale";
import { errorMontoVenta } from "../lib/montoVenta";

/**
 * Los códigos de práctica del simulador de caja. Ninguno toca el backend:
 * el simulador nunca llama a validarVale ni a confirmarDisposicion, así
 * que practicar no deja lecturas en la bitácora de ningún vale real ni
 * cuenta como intento sospechoso.
 *
 * Cada código enseña una de las pantallas que el cajero va a ver de
 * verdad, con los mismos textos (las pinta el mismo componente).
 */
export interface CodigoPractica {
  codigo: string;
  /** Qué practica, para la lista de "misiones". */
  practica: string;
}

const HACE_UNA_HORA = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
const EN_DOS_DIAS = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
const AYER = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

export const MONTO_PRACTICA = 25_000;

export const CODIGOS_PRACTICA: CodigoPractica[] = [
  { codigo: "1234567890", practica: "Un código que sirve: confirma la venta" },
  { codigo: "2222222222", practica: "Un código que ya se leyó antes" },
  { codigo: "3333333333", practica: "Un vale que ya se usó" },
  { codigo: "4444444444", practica: "Un código de otra tienda" },
  { codigo: "5555555555", practica: "Un vale vencido" },
  { codigo: "6666666666", practica: "Un vale reemplazado por otro" },
  { codigo: "1234567891", practica: "Un dígito mal tecleado" },
];

export function formatearCodigo(codigo: string): string {
  return `${codigo.slice(0, 5)} ${codigo.slice(5)}`;
}

/**
 * Lo que respondería la caja para un código de práctica. Cualquier otro
 * código de 10 dígitos responde "no existe", igual que en la caja real;
 * con otra cantidad de dígitos no hay respuesta (null), porque la caja
 * real tampoco lo manda.
 */
export function validarPractica(entrada: string): ValidacionVale | null {
  const codigo = entrada.replace(/\D/g, "");
  if (codigo.length !== 10) return null;
  switch (codigo) {
    case "1234567890":
      return {
        estado: "ok",
        codigo,
        dealId: "practica-1",
        cliente: "María López (práctica)",
        montoAutorizado: MONTO_PRACTICA,
        emitidoEn: HACE_UNA_HORA(),
        venceEn: EN_DOS_DIAS(),
        lecturasPrevias: 0,
        ultimaLecturaEn: null,
      };
    case "2222222222":
      return {
        estado: "ok",
        codigo,
        dealId: "practica-2",
        cliente: "José Hernández (práctica)",
        montoAutorizado: 18_000,
        emitidoEn: AYER(),
        venceEn: EN_DOS_DIAS(),
        lecturasPrevias: 2,
        ultimaLecturaEn: HACE_UNA_HORA(),
      };
    case "3333333333":
      return { estado: "ya-utilizado", consumidoEn: AYER(), montoDispuesto: 12_400 };
    case "4444444444":
      return { estado: "otra-tienda" };
    case "5555555555":
      return { estado: "vencido", venceEn: AYER(), emitidoEn: null };
    case "6666666666":
      return { estado: "cancelado" };
    default:
      return { estado: "no-existe" };
  }
}

/**
 * La misma regla que la caja real y que confirmarDisposicion en el
 * backend (ver lib/montoVenta.ts): el monto de la venta no puede ser menor
 * al crédito autorizado, y sí puede ser mayor.
 */
export const errorMontoPractica = errorMontoVenta;
