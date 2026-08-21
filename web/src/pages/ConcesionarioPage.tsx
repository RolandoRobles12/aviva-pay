import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, getConcesionarioDealsCallable, logout } from "../lib/firebase";
import type { PayDeskConcesionario, PayDeskDeal } from "../types/deal";
import { BrandMark } from "../components/BrandMark";
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
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const result = await getConcesionarioDealsCallable();
        const { concesionario, deals } = result.data;
        if (cancelled) return;

        setState({ status: "ready", concesionario, deals });

        // Realtime updates: the session's custom claim is what makes this
        // query pass the Firestore rules, and it only ever matches this
        // store's own deals.
        const dealsQuery = query(
          collection(db, "paydesk_deals"),
          where("concesionarioId", "==", concesionario.concesionarioId),
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
                : "No pudimos cargar tus solicitudes.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  if (state.status === "loading") {
    return <p className="page-message">Cargando solicitudes...</p>;
  }

  if (state.status === "error") {
    return (
      <div className="page-message page-message--error">
        <p>{state.message}</p>
        <button type="button" className="link-button" onClick={handleLogout}>
          Volver a iniciar sesión
        </button>
      </div>
    );
  }

  return (
    <main className="concesionario-page">
      <header className="concesionario-page__header">
        <BrandMark />
        <div className="header-right">
          <div className="store-badge">
            <span className="store-badge__nombre">{state.concesionario.nombre}</span>
            {state.concesionario.numero && (
              <span className="store-badge__numero">
                Tienda {state.concesionario.numero}
              </span>
            )}
          </div>
          <button type="button" className="link-button" onClick={handleLogout}>
            Salir
          </button>
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
