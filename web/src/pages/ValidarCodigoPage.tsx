import { ValidarCodigoPanel } from "../components/ValidarCodigoPanel";

/**
 * La pestaña "Validar código": el mismo panel que sale en la ventana de
 * la tabla, pero sin fila de referencia — sirve cuando el cajero valida
 * suelto, sin haber buscado antes al cliente.
 */
export function ValidarCodigoPage() {
  return <ValidarCodigoPanel />;
}
