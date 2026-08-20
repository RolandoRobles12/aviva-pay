import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { adminGetConcesionarioDealsCallable } from "../../lib/firebase";
import type { PayDeskConcesionario, PayDeskDeal } from "../../types/deal";
import type { FieldLabels } from "../../types/admin";
import { DealsTable } from "../../components/DealsTable";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      concesionario: PayDeskConcesionario;
      deals: PayDeskDeal[];
      labels: FieldLabels;
    };

/**
 * What a store sees, viewed by an admin — read-only snapshot, no NIP
 * needed. No upload buttons: uploading requires the store's own auth
 * claim, which this admin session doesn't carry.
 */
export function ConcesionarioPreviewPage() {
  const { concesionarioId } = useParams<{ concesionarioId: string }>();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!concesionarioId) return;
    let cancelled = false;

    (async () => {
      try {
        const result = await adminGetConcesionarioDealsCallable({ concesionarioId });
        if (cancelled) return;
        setState({
          status: "ready",
          concesionario: result.data.concesionario,
          deals: result.data.deals,
          labels: result.data.labels,
        });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              err instanceof Error ? err.message : "No se pudieron cargar las solicitudes.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [concesionarioId]);

  if (state.status === "loading") {
    return <p className="page-message">Cargando solicitudes...</p>;
  }

  if (state.status === "error") {
    return <p className="page-message page-message--error">{state.message}</p>;
  }

  return (
    <section>
      <div className="admin-page-head">
        <div>
          <Link to="/admin/tiendas" className="link-button">
            ← Tiendas
          </Link>
          <h1 className="admin-title">{state.concesionario.nombre}</h1>
          <p className="admin-subtitle">
            Vista de solo lectura — así es como esta tienda ve sus
            solicitudes. Para subir un archivo por ella, hazlo desde su
            propia sesión.
          </p>
        </div>
      </div>

      <DealsTable deals={state.deals} labels={state.labels} />
    </section>
  );
}
