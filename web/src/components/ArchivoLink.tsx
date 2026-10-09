import { useState, type ReactNode } from "react";
import { getArchivoUrlCallable } from "../lib/firebase";

/**
 * Abre una cotización o comprobante con una liga que se pide al momento y
 * caduca en minutos (ver functions/src/http/getArchivoUrl.ts). La ventana
 * se abre antes de pedir la liga: si se abriera después del `await`, el
 * navegador lo trataría como un popup no solicitado y lo bloquearía.
 */
export function ArchivoLink({
  dealId,
  tipo,
  revision = false,
  className,
  title,
  children,
}: {
  dealId: string;
  tipo: "cotizacion" | "comprobante";
  /** El documento en revisión, no el vigente (solo admins). */
  revision?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abrir() {
    setError(null);
    setCargando(true);
    const ventana = window.open("", "_blank");
    try {
      const { data } = await getArchivoUrlCallable({ dealId, tipo, revision });
      if (ventana) {
        ventana.opener = null;
        ventana.location.href = data.url;
      } else {
        window.location.assign(data.url);
      }
    } catch (err) {
      ventana?.close();
      setError(err instanceof Error ? err.message : "No se pudo abrir el archivo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className ?? "link-button"}
        onClick={abrir}
        disabled={cargando}
        title={title}
      >
        {children}
      </button>
      {error && <span className="form-error">{error}</span>}
    </>
  );
}
