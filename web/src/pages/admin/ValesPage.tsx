import { useEffect, useState } from "react";
import {
  adminGetValeCallable,
  adminGetValeConfigCallable,
  adminReemitirValeCallable,
  adminSetValeConfigCallable,
} from "../../lib/firebase";
import { useEsSuperAdmin } from "../../lib/adminRol";
import { Badge, Card, Field, MensajeInline, Notice, PageHeader, Tabs } from "../../components/admin/ui";

/** Las dos pestañas del apartado Vales. */
export function TabsVales() {
  return (
    <Tabs
      items={[
        { to: "/admin/vales", label: "Buscar un vale" },
        { to: "/admin/reporte-vales", label: "Reporte" },
      ]}
    />
  );
}
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
  const esSuper = useEsSuperAdmin();
  const [dealId, setDealId] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [vale, setVale] = useState<ValeAdmin | null>(null);
  const [buscado, setBuscado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [vigencia, setVigencia] = useState("");
  const [guardandoVigencia, setGuardandoVigencia] = useState(false);
  const [vigenciaMsg, setVigenciaMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [confirmando, setConfirmando] = useState(false);

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
    setConfirmando(false);
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
    setVigenciaMsg(null);
    try {
      await adminSetValeConfigCallable({ vigenciaHoras: Number(vigencia) });
      setVigenciaMsg({ ok: true, texto: "Guardado. Aplica a los vales nuevos." });
    } catch (err) {
      setVigenciaMsg({ ok: false, texto: err instanceof Error ? err.message : "No se pudo guardar." });
    } finally {
      setGuardandoVigencia(false);
    }
  }

  const accionReemitir = (texto: string) =>
    confirmando ? (
      <Notice tono="warn" titulo="¿Reemitir el vale?">
        <p>El vale actual dejará de servir de inmediato en cualquier caja y el cliente recibirá uno nuevo.</p>
        <div className="adm-page-head__acciones">
          <button type="button" className="adm-btn adm-btn--primario" onClick={reemitir}>
            Sí, reemitir
          </button>
          <button type="button" className="adm-btn adm-btn--secundario" onClick={() => setConfirmando(false)}>
            Cancelar
          </button>
        </div>
      </Notice>
    ) : (
      <button type="button" className="adm-btn adm-btn--secundario" onClick={() => setConfirmando(true)}>
        {texto}
      </button>
    );

  return (
    <section>
      <PageHeader
        titulo="Vales"
        descripcion="El código de un solo uso que el cliente presenta en la caja. Se crea solo cuando el crédito se libera en HubSpot."
      />
      <TabsVales />

      {error && <Notice tono="error">{error}</Notice>}
      {aviso && <Notice tono="ok">{aviso}</Notice>}

      <Card
        titulo="Buscar el vale de una solicitud"
        descripcion="Úsalo cuando un cliente perdió su vale o la tienda reporta un problema con él."
      >
        <form onSubmit={buscar}>
          <Field
            label="Número de la solicitud"
            htmlFor="deal-id"
            ayuda="Es el ID del deal en HubSpot (Record ID)."
          >
            <div className="adm-fila__principal">
              <input
                id="deal-id"
                type="text"
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                placeholder="Ej. 18447203"
                inputMode="numeric"
              />
              <button type="submit" className="adm-btn adm-btn--primario" disabled={buscando || !dealId.trim()}>
                {buscando ? "Buscando..." : "Buscar"}
              </button>
            </div>
          </Field>
        </form>
      </Card>

      {buscado && !vale && (
        <Card titulo="Esta solicitud todavía no tiene vale">
          <p className="adm-field__ayuda">
            Se crea solo cuando el crédito se libera en HubSpot. Si ya está liberado y
            no se creó, puedes emitirlo aquí.
          </p>
          <button type="button" className="adm-btn adm-btn--primario" onClick={reemitir}>
            Emitir vale ahora
          </button>
        </Card>
      )}

      {vale && (
        <Card
          titulo={<span className="adm-mono">{vale.codigoFormateado}</span>}
          acciones={
            <Badge tono={vale.estado === "emitido" ? "ok" : vale.estado === "utilizado" ? "neutro" : "warn"}>
              {ETIQUETA_ESTADO[vale.estado]}
            </Badge>
          }
          pie={vale.estado !== "utilizado" ? accionReemitir("Reemitir vale") : undefined}
        >
          <dl className="adm-datos">
            <dt>Cliente</dt>
            <dd>{vale.cliente ?? "—"}</dd>
            <dt>Tienda</dt>
            <dd>{vale.tienda}</dd>
            <dt>Monto autorizado</dt>
            <dd>{vale.montoAutorizado === null ? "—" : moneda.format(vale.montoAutorizado)}</dd>
            <dt>Emitido</dt>
            <dd>{fecha(vale.emitidoEn)}</dd>
            <dt>Vence</dt>
            <dd>{fecha(vale.venceEn)}</dd>
            <dt>Veces que se consultó en caja</dt>
            <dd>
              {vale.lecturasTotal}
              {vale.ultimaLecturaEn ? ` · la última ${fecha(vale.ultimaLecturaEn)}` : ""}
            </dd>
            {vale.consumidoEn && (
              <>
                <dt>Usado</dt>
                <dd>
                  {vale.montoDispuesto !== null ? moneda.format(vale.montoDispuesto) : "—"} ·{" "}
                  {fecha(vale.consumidoEn)}
                </dd>
              </>
            )}
            <dt>Liga del cliente</dt>
            <dd className="vales-datos__url">{vale.url}</dd>
          </dl>
        </Card>
      )}

      {esSuper && (
        <Card
          titulo="Cuánto dura un vale"
          descripcion="Una ventana corta obliga a que la compra ocurra cerca de la autorización. Aplica a los vales nuevos, no a los ya emitidos."
        >
          <form onSubmit={guardarVigencia}>
            <Field label="Horas de vigencia" htmlFor="vigencia-horas">
              <div className="adm-fila__principal">
                <input
                  id="vigencia-horas"
                  type="number"
                  min={1}
                  value={vigencia}
                  onChange={(e) => setVigencia(e.target.value)}
                  style={{ maxWidth: "8rem" }}
                />
                <button
                  type="submit"
                  className="adm-btn adm-btn--primario"
                  disabled={guardandoVigencia || !vigencia}
                >
                  {guardandoVigencia ? "Guardando..." : "Guardar"}
                </button>
                {vigenciaMsg && <MensajeInline ok={vigenciaMsg.ok}>{vigenciaMsg.texto}</MensajeInline>}
              </div>
            </Field>
          </form>
        </Card>
      )}
    </section>
  );
}
