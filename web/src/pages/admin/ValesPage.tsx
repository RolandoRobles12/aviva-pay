import { useEffect, useState } from "react";
import {
  adminGetValeCallable,
  adminGetValeConfigCallable,
  adminReemitirValeCallable,
  adminSetValeConfigCallable,
} from "../../lib/firebase";
import type { ValeAdmin } from "../../types/vale";

const moneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

function fecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ETIQUETA_ESTADO: Record<ValeAdmin["estado"], string> = {
  emitido: "Vigente",
  utilizado: "Utilizado",
  vencido: "Vencido",
  cancelado: "Reemplazado",
};

/**
 * Vales, en el panel de Aviva: consultar el de una solicitud, reemitirlo
 * cuando el cliente perdió el suyo, y fijar cuánto duran.
 *
 * Reemitir es deliberadamente una operación de Aviva y no de la tienda:
 * si la tienda pudiera reemitir, podría generarse un vale sin el cliente
 * presente, que es justo el fraude que el mecanismo cierra.
 */
export function ValesPage() {
  const [dealId, setDealId] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [vale, setVale] = useState<ValeAdmin | null>(null);
  const [buscado, setBuscado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [vigencia, setVigencia] = useState("");
  const [guardandoVigencia, setGuardandoVigencia] = useState(false);

  useEffect(() => {
    adminGetValeConfigCallable()
      .then(({ data }) => setVigencia(String(data.vigenciaHoras)))
      .catch(() => setVigencia(""));
  }, []);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setBuscando(true);
    setError(null);
    setAviso(null);
    try {
      const { data } = await adminGetValeCallable({ dealId: dealId.trim() });
      setVale(data.vale);
      setBuscado(true);
    } catch (err) {
      setVale(null);
      setBuscado(false);
      setError(err instanceof Error ? err.message : "No se pudo buscar el vale.");
    } finally {
      setBuscando(false);
    }
  }

  async function reemitir() {
    setError(null);
    setAviso(null);
    try {
      const { data } = await adminReemitirValeCallable({ dealId: dealId.trim() });
      setVale(data.vale);
      setAviso(
        "Vale reemitido. El anterior quedó cancelado y ya no sirve en ninguna caja.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reemitir el vale.");
    }
  }

  async function guardarVigencia(e: React.FormEvent) {
    e.preventDefault();
    setGuardandoVigencia(true);
    setError(null);
    setAviso(null);
    try {
      await adminSetValeConfigCallable({ vigenciaHoras: Number(vigencia) });
      setAviso("Vigencia guardada. Aplica a los vales que se emitan a partir de ahora.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la vigencia.");
    } finally {
      setGuardandoVigencia(false);
    }
  }

  return (
    <section>
      <h1 className="admin-title">Vales</h1>
      <p className="admin-subtitle">
        El código de un solo uso que el cliente presenta en la caja. Se emite
        solo cuando el crédito se libera en HubSpot.
      </p>

      {error && <p className="page-message page-message--error">{error}</p>}
      {aviso && <p className="form-success">{aviso}</p>}

      <form className="vales-card" onSubmit={buscar}>
        <label htmlFor="deal-id">Id de la solicitud en HubSpot</label>
        <div className="vales-fila">
          <input
            id="deal-id"
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            placeholder="18447203"
            inputMode="numeric"
          />
          <button type="submit" disabled={buscando || !dealId.trim()}>
            {buscando ? "Buscando..." : "Buscar"}
          </button>
        </div>
      </form>

      {buscado && !vale && (
        <div className="vales-card">
          <p>
            Esta solicitud todavía no tiene vale. Se emite solo cuando el deal
            trae fecha de crédito liberado.
          </p>
          <button type="button" onClick={reemitir}>
            Emitir vale ahora
          </button>
        </div>
      )}

      {vale && (
        <div className="vales-card">
          <div className="vales-fila vales-fila--entre">
            <h2>{vale.codigoFormateado}</h2>
            <span
              className={`vale-chip vale-chip--${
                vale.estado === "emitido" ? "verde" : "ambar"
              }`}
            >
              {ETIQUETA_ESTADO[vale.estado]}
            </span>
          </div>

          <dl className="vales-datos">
            <div>
              <dt>Cliente</dt>
              <dd>{vale.cliente ?? "—"}</dd>
            </div>
            <div>
              <dt>Tienda</dt>
              <dd>{vale.tienda}</dd>
            </div>
            <div>
              <dt>Autorizado</dt>
              <dd>
                {vale.montoAutorizado === null
                  ? "—"
                  : moneda.format(vale.montoAutorizado)}
              </dd>
            </div>
            <div>
              <dt>Emitido</dt>
              <dd>{fecha(vale.emitidoEn)}</dd>
            </div>
            <div>
              <dt>Vence</dt>
              <dd>{fecha(vale.venceEn)}</dd>
            </div>
            <div>
              <dt>Lecturas</dt>
              <dd>
                {vale.lecturasTotal}
                {vale.ultimaLecturaEn ? ` · última ${fecha(vale.ultimaLecturaEn)}` : ""}
              </dd>
            </div>
            {vale.consumidoEn && (
              <div>
                <dt>Disposición</dt>
                <dd>
                  {vale.montoDispuesto !== null
                    ? moneda.format(vale.montoDispuesto)
                    : "—"}{" "}
                  · {fecha(vale.consumidoEn)}
                </dd>
              </div>
            )}
            <div>
              <dt>Liga del cliente</dt>
              <dd className="vales-datos__url">{vale.url}</dd>
            </div>
          </dl>

          {vale.estado !== "utilizado" && (
            <>
              <button type="button" onClick={reemitir}>
                Reemitir vale
              </button>
              <p className="form-note">
                Emite uno nuevo y cancela este en el mismo paso, así que el
                anterior deja de servir de inmediato.
              </p>
            </>
          )}
        </div>
      )}

      <form className="vales-card" onSubmit={guardarVigencia}>
        <h2>Vigencia</h2>
        <label htmlFor="vigencia-horas">Horas que dura un vale desde que se emite</label>
        <div className="vales-fila">
          <input
            id="vigencia-horas"
            value={vigencia}
            onChange={(e) => setVigencia(e.target.value)}
            inputMode="numeric"
          />
          <button type="submit" disabled={guardandoVigencia || !vigencia}>
            {guardandoVigencia ? "Guardando..." : "Guardar"}
          </button>
        </div>
        <p className="form-note">
          Un vale sin caducidad es un vale que alguien guarda: la ventana corta
          obliga a que la compra ocurra cerca de la autorización. Aplica a los
          vales nuevos, no a los ya emitidos.
        </p>
      </form>
    </section>
  );
}
