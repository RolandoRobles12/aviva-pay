import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { authenticateForDeal, db, getDealStatusCallable } from "../lib/firebase";
import type { PayDeskDeal } from "../types/deal";
import { StatusTable } from "../components/StatusTable";
import { CotizacionUploadForm } from "../components/CotizacionUploadForm";
import { ComprobanteUploadForm } from "../components/ComprobanteUploadForm";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; deal: PayDeskDeal };

export function DealStatusPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!dealId) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const result = await getDealStatusCallable({ dealId });
        const { deal, authToken } = result.data as {
          deal: PayDeskDeal;
          authToken: string;
        };
        await authenticateForDeal(authToken);
        if (cancelled) return;

        setState({ status: "ready", deal });

        unsubscribe = onSnapshot(doc(db, "paydesk_deals", dealId), (snap) => {
          if (snap.exists()) {
            setState({ status: "ready", deal: snap.data() as PayDeskDeal });
          }
        });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              err instanceof Error
                ? err.message
                : "No se encontró la solicitud.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [dealId]);

  if (state.status === "loading") {
    return <p className="page-message">Cargando solicitud...</p>;
  }

  if (state.status === "error") {
    return <p className="page-message page-message--error">{state.message}</p>;
  }

  const { deal } = state;

  return (
    <main className="deal-page">
      <h1>Aviva Pay Desk</h1>
      <p className="deal-page__subtitle">Estatus de tu solicitud de crédito</p>

      <StatusTable deal={deal} />

      {deal.cotizacionEstatus === "pendiente" && (
        <CotizacionUploadForm dealId={deal.dealId} onUploaded={() => {}} />
      )}

      {deal.comprobanteEntregaEstatus === "pendiente" && (
        <ComprobanteUploadForm dealId={deal.dealId} onUploaded={() => {}} />
      )}
    </main>
  );
}
