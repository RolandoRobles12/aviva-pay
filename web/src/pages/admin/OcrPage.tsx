import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminGetOcrCallable,
  adminProbarOcrCallable,
  adminSetOcrCallable,
  type ModeloOcr,
  type ModoOcr,
  type OcrConfig,
} from "../../lib/firebase";
import {
  BarraGuardar,
  Card,
  Cargando,
  MensajeInline,
  Notice,
  OpcionesTarjeta,
  PageHeader,
  type Opcion,
} from "../../components/admin/ui";

const MODOS: Opcion<ModoOcr>[] = [
  {
    valor: "automatico",
    titulo: "Automática",
    etiqueta: "Recomendado",
    descripcion:
      "Lo que cuadra se acepta solo, lo ilegible o del tipo equivocado se rechaza, y lo sospechoso se manda a Revisión de documentos.",
  },
  {
    valor: "apagado",
    titulo: "Apagada",
    descripcion: "Solo para emergencias: todos los documentos se aceptan sin revisar.",
  },
];

const MODELOS: Opcion<ModeloOcr>[] = [
  {
    valor: "sonnet",
    titulo: "Claude Sonnet",
    etiqueta: "Recomendado",
    descripcion: "Lee mejor fotos difíciles y detecta mejor documentos alterados.",
  },
  {
    valor: "haiku",
    titulo: "Claude Haiku",
    descripcion: "Más barato y rápido, pero puede pasar por alto detalles finos.",
  },
];

/**
 * Cómo se verifica con Claude lo que suben las tiendas. Claude lee el
 * documento (functions/src/ocr/analizar.ts) y las reglas que deciden viven
 * en functions/src/ocr/validate.ts; aquí solo se elige qué tan estricto es.
 */
export function OcrPage() {
  const [config, setConfig] = useState<OcrConfig | null>(null);
  const [original, setOriginal] = useState<OcrConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [prueba, setPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [probando, setProbando] = useState(false);

  useEffect(() => {
    adminGetOcrCallable()
      .then(({ data }) => {
        setConfig(data);
        setOriginal(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar la configuración."));
  }, []);

  async function probar() {
    setProbando(true);
    setPrueba(null);
    try {
      setPrueba((await adminProbarOcrCallable()).data);
    } catch (err) {
      setPrueba({ ok: false, mensaje: err instanceof Error ? err.message : "No se pudo probar." });
    } finally {
      setProbando(false);
    }
  }

  async function guardar() {
    if (!config) return;
    setSubmitting(true);
    setMsg(null);
    try {
      await adminSetOcrCallable(config);
      setOriginal(config);
      setMsg({ ok: true, texto: "Guardado. Aplica en pocos minutos." });
    } catch (err) {
      setMsg({ ok: false, texto: err instanceof Error ? err.message : "No se pudo guardar." });
    } finally {
      setSubmitting(false);
    }
  }

  const cambio = config && original && (config.modo !== original.modo || config.modelo !== original.modelo);

  return (
    <section>
      <PageHeader
        titulo="Verificación de documentos"
        descripcion={
          <>
            Cuando una tienda sube una cotización o un comprobante, Claude lo lee y lo compara
            con la solicitud. Lo sospechoso llega a{" "}
            <Link to="/admin/revision">Revisión de documentos</Link>.
          </>
        }
      />
      {error && <Notice tono="error">{error}</Notice>}
      {!config && !error && <Cargando />}

      {config && (
        <>
          <Card
            titulo="Conexión con Claude"
            descripcion="Si la conexión falla, los documentos no se pierden: se guardan y pasan a revisión manual."
          >
            <div className="adm-page-head__acciones">
              <button type="button" className="adm-btn adm-btn--secundario" onClick={probar} disabled={probando}>
                {probando ? "Probando..." : "Probar conexión"}
              </button>
              {prueba && <MensajeInline ok={prueba.ok}>{prueba.mensaje}</MensajeInline>}
            </div>
          </Card>

          <Card titulo="¿Verificar los documentos?">
            <OpcionesTarjeta
              nombre="modo"
              valor={config.modo}
              opciones={MODOS}
              onChange={(modo) => setConfig({ ...config, modo })}
            />
          </Card>

          <Card titulo="Modelo" descripcion="Con qué versión de Claude se leen los documentos.">
            <OpcionesTarjeta
              nombre="modelo"
              valor={config.modelo}
              opciones={MODELOS}
              onChange={(modelo) => setConfig({ ...config, modelo })}
            />
          </Card>

          <BarraGuardar
            hayCambios={Boolean(cambio)}
            guardando={submitting}
            mensaje={msg}
            onGuardar={guardar}
            onDescartar={() => {
              setConfig(original);
              setMsg(null);
            }}
          />
        </>
      )}
    </section>
  );
}
