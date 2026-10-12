import { useEffect, useState } from "react";
import { adminGetCancelStagesCallable, adminSetCancelStagesCallable } from "../../lib/firebase";
import { Card, Cargando, Field, MensajeInline, Notice, PageHeader } from "../../components/admin/ui";
import { TabsHubspot } from "./DiccionarioPage";

/**
 * Las etapas de HubSpot que significan "este crédito ya no existe". Antes
 * vivía al final del reporte de vales; es configuración de HubSpot, así
 * que está con las demás.
 */
export function CancelacionPage() {
  const [etapas, setEtapas] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    adminGetCancelStagesCallable()
      .then(({ data }) => {
        setEtapas(data.etapas.join(", "));
        setDefaults(data.defaults);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar."));
  }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (etapas === null) return;
    setGuardando(true);
    setMsg(null);
    try {
      await adminSetCancelStagesCallable({
        etapas: etapas.split(",").map((x) => x.trim()).filter(Boolean),
      });
      setMsg({ ok: true, texto: "Guardado. Aplica en el siguiente minuto." });
    } catch (err) {
      setMsg({ ok: false, texto: err instanceof Error ? err.message : "No se pudo guardar." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section>
      <PageHeader
        titulo="Conexión con HubSpot"
        descripcion="Cómo lee Paydesk la información de HubSpot. Cambia esto solo si sabes qué propiedad o etapa corresponde en HubSpot."
      />
      <TabsHubspot />
      {error && <Notice tono="error">{error}</Notice>}
      {etapas === null && !error ? (
        <Cargando />
      ) : (
        <Card
          titulo="Etapas de cancelación"
          descripcion="Cuando un crédito entra a una de estas etapas en HubSpot, su vale se cancela de inmediato y la solicitud sale de la lista de la tienda."
        >
          <Notice tono="warn">
            Precancelación está incluida a propósito: cancelar un vale de más se arregla
            reemitiéndolo; dejarlo vivo de más permite entregar material contra un crédito
            que ya se está retirando.
          </Notice>
          <form onSubmit={guardar}>
            <Field
              label="IDs de etapa en HubSpot"
              htmlFor="etapas-cancelacion"
              ayuda={`Separados por coma. Valor original: ${defaults.join(", ")}`}
            >
              <input
                id="etapas-cancelacion"
                type="text"
                className="adm-mono"
                value={etapas ?? ""}
                onChange={(e) => setEtapas(e.target.value)}
                placeholder="1341580191, 1341580192"
              />
            </Field>
            <div className="adm-card__pie">
              {msg && <MensajeInline ok={msg.ok}>{msg.texto}</MensajeInline>}
              <button type="submit" className="adm-btn adm-btn--primario" disabled={guardando || !etapas?.trim()}>
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </Card>
      )}
    </section>
  );
}
