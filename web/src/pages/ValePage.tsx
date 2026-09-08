import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getValeCallable } from "../lib/firebase";
import { BrandMark } from "../components/BrandMark";
import { CodigoBarras } from "../components/CodigoBarras";
import type { ValePublico } from "../types/vale";

const moneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

function formatearVencimiento(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Estado =
  | { status: "cargando" }
  | { status: "listo"; vale: ValePublico }
  | { status: "error"; mensaje: string };

/**
 * El vale del cliente: la página que abre desde el link que le llegó por
 * WhatsApp y que enseña en la caja.
 *
 * Es la única pantalla de Paydesk sin sesión — el cliente no tiene
 * cuenta. Lo que la protege es el token de la URL; el código de 10
 * dígitos que se ve aquí es corto a propósito, para poder teclearse
 * cuando la pistola de la tienda no lee la pantalla.
 */
export function ValePage() {
  const { token = "" } = useParams();
  const [estado, setEstado] = useState<Estado>({ status: "cargando" });

  useEffect(() => {
    let cancelado = false;

    getValeCallable({ token })
      .then(({ data }) => {
        if (!cancelado) setEstado({ status: "listo", vale: data });
      })
      .catch(() => {
        if (!cancelado) {
          setEstado({
            status: "error",
            mensaje:
              "Este vale no existe o ya no está disponible. Pídele a Aviva que te mande uno nuevo.",
          });
        }
      });

    return () => {
      cancelado = true;
    };
  }, [token]);

  if (estado.status === "cargando") {
    return <p className="page-message">Cargando tu vale...</p>;
  }

  if (estado.status === "error") {
    return (
      <main className="vale-page">
        <div className="vale-card vale-card--inactivo">
          <header className="vale-card__header">
            <BrandMark />
          </header>
          <div className="vale-card__cuerpo">
            <p className="page-message page-message--error">{estado.mensaje}</p>
          </div>
        </div>
      </main>
    );
  }

  const { vale } = estado;
  const activo = vale.estado === "emitido";

  return (
    <main className="vale-page">
      <div className={`vale-card${activo ? "" : " vale-card--inactivo"}`}>
        <header className="vale-card__header">
          <BrandMark />
          <span className="vale-card__tipo">Vale de crédito</span>
        </header>

        <div className="vale-card__cuerpo">
          <p className="vale-card__etiqueta">Crédito autorizado</p>
          <p className="vale-card__monto">
            {vale.montoAutorizado === null
              ? "—"
              : moneda.format(vale.montoAutorizado)}
            <span className="vale-card__divisa">MXN</span>
          </p>

          <dl className="vale-card__datos">
            <div>
              <dt>Cliente</dt>
              <dd>{vale.cliente ?? "—"}</dd>
            </div>
            <div>
              <dt>Tienda</dt>
              <dd>{vale.tienda ?? "—"}</dd>
            </div>
          </dl>

          {activo ? (
            <>
              <div className="vale-card__codigo">
                {/* Más alto que el default: lo que se escanea suele ser esta
                    pantalla, y un código bajo obliga al cajero a apuntar con
                    precisión. La altura no cambia lo que codifica — el lector
                    solo mide anchos — pero sí cuánto margen de puntería tiene. */}
                <CodigoBarras codigo={vale.codigo} alto={132} />
                <p className="vale-card__digitos">{vale.codigoFormateado}</p>
              </div>

              <div className="vale-card__chips">
                <span className="vale-chip vale-chip--verde">Un solo uso</span>
                <span className="vale-chip vale-chip--ambar">
                  Vence el {formatearVencimiento(vale.venceEn)}
                </span>
              </div>

              <p className="vale-card__nota">
                Enseña este código en la caja. Si el lector de la tienda no lo
                toma, <strong>sube el brillo de tu pantalla al máximo</strong> o
                dicta los 10 dígitos.
              </p>
              <p className="vale-card__nota">Cada lectura queda registrada.</p>
            </>
          ) : (
            <p className="vale-card__inactivo">
              {vale.estado === "utilizado"
                ? "Este vale ya se usó."
                : vale.estado === "vencido"
                  ? "Este vale venció. Pídele a Aviva que te mande uno nuevo."
                  : "Este vale fue reemplazado por uno más reciente. Busca el último que te llegó."}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
