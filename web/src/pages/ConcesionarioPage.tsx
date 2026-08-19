import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  authenticateForConcesionario,
  db,
  getConcesionarioDealsCallable,
} from "../lib/firebase";
import type { PayDeskConcesionario, PayDeskDeal } from "../types/deal";
import { DealsTable } from "../components/DealsTable";
import { Modal } from "../components/Modal";
import { CotizacionUploadForm } from "../components/CotizacionUploadForm";
import { ComprobanteUploadForm } from "../components/ComprobanteUploadForm";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      concesionario: PayDeskConcesionario;
      deals: PayDeskDeal[];
    };

type ActiveModal =
  | { type: "cotizacion"; dealId: string }
  | { type: "comprobante"; dealId: string }
  | null;

export function ConcesionarioPage() {
  const { concesionarioId } = useParams<{ concesionarioId: string }>();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  useEffect(() => {
    if (!concesionarioId) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const result = await getConcesionarioDealsCallable({ concesionarioId });
        const { concesionario, deals, authToken } = result.data;
        await authenticateForConcesionario(authToken);
        if (cancelled) return;

        setState({ status: "ready", concesionario, deals });

        const dealsQuery = query(
          collection(db, "paydesk_deals"),
          where("concesionarioId", "==", concesionarioId),
        );
        unsubscribe = onSnapshot(dealsQuery, (snap) => {
          setState({
            status: "ready",
            concesionario,
            deals: snap.docs.map((doc) => doc.data() as PayDeskDeal),
          });
        });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              err instanceof Error
                ? err.message
                : "No se encontró información para este concesionario.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [concesionarioId]);

  if (state.status === "loading") {
    return <p className="page-message">Cargando solicitudes...</p>;
  }

  if (state.status === "error") {
    return <p className="page-message page-message--error">{state.message}</p>;
  }

  return (
    <main className="concesionario-page">
      <header className="concesionario-page__header">
        <div className="brand-mark">
          <span className="brand-mark__aviva">Aviva</span>
          <span className="brand-mark__product">Pay Desk</span>
        </div>
        <div className="store-badge">
          <span className="store-badge__nombre">{state.concesionario.nombre}</span>
          {state.concesionario.numero && (
            <span className="store-badge__numero">
              Tienda {state.concesionario.numero}
            </span>
          )}
        </div>
      </header>

      <h1 className="concesionario-page__title">Solicitudes de tus clientes</h1>
      <p className="concesionario-page__subtitle">
        Consulta el avance de cada crédito y sube la cotización y el
        comprobante de entrega cuando corresponda.
      </p>

      <DealsTable
        deals={state.deals}
        onUploadCotizacion={(dealId) => setActiveModal({ type: "cotizacion", dealId })}
        onUploadComprobante={(dealId) => setActiveModal({ type: "comprobante", dealId })}
      />

      {activeModal?.type === "cotizacion" && (
        <Modal onClose={() => setActiveModal(null)}>
          <CotizacionUploadForm
            dealId={activeModal.dealId}
            onUploaded={() => setActiveModal(null)}
            onCancel={() => setActiveModal(null)}
          />
        </Modal>
      )}

      {activeModal?.type === "comprobante" && (
        <Modal onClose={() => setActiveModal(null)}>
          <ComprobanteUploadForm
            dealId={activeModal.dealId}
            onUploaded={() => setActiveModal(null)}
            onCancel={() => setActiveModal(null)}
          />
        </Modal>
      )}
    </main>
  );
}
