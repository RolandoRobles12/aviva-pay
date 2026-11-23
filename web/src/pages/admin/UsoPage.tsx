import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminUsoResumenCallable, type FiltroUso, type PerfilUso, type ResumenUso } from "../../lib/firebase";
import { Card, Cargando, EmptyState, Notice, PageHeader, Tabs } from "../../components/admin/ui";
import { StatTiles } from "../../components/StatTiles";
import { BarrasHorizontales, Columnas, Embudo, minutosLegibles } from "../../components/admin/graficas";
import { MapaToques } from "../../components/admin/MapaToques";

export const PESTANAS_USO = [
  { to: "/admin/uso", label: "Resumen" },
  { to: "/admin/uso/grabaciones", label: "Grabaciones" },
];

export const PERIODOS_USO = [
  { dias: 1, label: "Últimas 24 horas" },
  { dias: 7, label: "Últimos 7 días" },
  { dias: 30, label: "Últimos 30 días" },
  { dias: 90, label: "Últimos 90 días" },
];

export const PERFILES: { valor: PerfilUso | ""; label: string }[] = [
  { valor: "", label: "Tienda y asesores" },
  { valor: "tienda", label: "Solo personal de tienda" },
  { valor: "asesor", label: "Solo asesores de ventas" },
];

export function fechaHora(ms: number): string {
  return new Date(ms).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const HORAS = Array.from({ length: 24 }, (_, h) => h);

/** Periodo, tienda y perfil: los mismos en el resumen y en las grabaciones. */
export function FiltrosUso({
  filtro,
  setFiltro,
  tiendas,
  children,
}: {
  filtro: FiltroUso;
  setFiltro: (f: FiltroUso) => void;
  tiendas: Record<string, string>;
  children?: React.ReactNode;
}) {
  const ordenadas = Object.entries(tiendas).sort((a, b) => a[1].localeCompare(b[1], "es"));
  return (
    <div className="uso-filtros">
      <select aria-label="Periodo" value={filtro.dias} onChange={(e) => setFiltro({ ...filtro, dias: Number(e.target.value) })}>
        {PERIODOS_USO.map((p) => (
          <option key={p.dias} value={p.dias}>
            {p.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Tienda"
        value={filtro.tienda ?? ""}
        onChange={(e) => setFiltro({ ...filtro, tienda: e.target.value || undefined })}
      >
        <option value="">Todas las tiendas</option>
        {ordenadas.map(([id, nombre]) => (
          <option key={id} value={id}>
            {nombre}
          </option>
        ))}
      </select>
      <select
        aria-label="Perfil"
        value={filtro.perfil ?? ""}
        onChange={(e) => setFiltro({ ...filtro, perfil: (e.target.value || undefined) as PerfilUso | undefined })}
      >
        {PERFILES.map((p) => (
          <option key={p.valor} value={p.valor}>
            {p.label}
          </option>
        ))}
      </select>
      {children}
    </div>
  );
}

/**
 * "Uso del portal": cómo usan las tiendas y los asesores Paydesk, para
 * arreglar lo que se les complica sin tener que preguntarles. Sale de la
 * medición del portal (web/src/lib/analitica.ts); el detalle de una sesión
 * se ve en "Grabaciones".
 */
export function UsoPage() {
  const [filtro, setFiltro] = useState<FiltroUso>({ dias: 30 });
  const [datos, setDatos] = useState<ResumenUso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pantallaMapa, setPantallaMapa] = useState<string | undefined>();

  useEffect(() => {
    let cancelado = false;
    setDatos(null);
    setError(null);
    adminUsoResumenCallable(filtro)
      .then((r) => !cancelado && setDatos(r.data))
      .catch((e) => !cancelado && setError(e instanceof Error ? e.message : "No se pudo cargar el uso."));
    return () => {
      cancelado = true;
    };
  }, [filtro]);

  // Mientras carga se conservan los nombres de tienda para que el filtro no se vacíe.
  const [tiendas, setTiendas] = useState<Record<string, string>>({});
  useEffect(() => {
    if (datos) setTiendas(datos.tiendas);
  }, [datos]);

  const nombreTiendas = (ids: string[]) => ids.map((id) => tiendas[id] ?? id).join(", ");
  const pantallasConToques = useMemo(
    () => (datos ? datos.pantallas.filter((p) => p.toques > 0).map((p) => p.pantalla) : []),
    [datos],
  );

  return (
    <section>
      <PageHeader
        titulo="Uso del portal"
        descripcion="Cómo usan Paydesk las tiendas y los asesores: dónde se atoran al subir documentos o al validar un código, qué pantallas usan, qué tocan esperando que pase algo y qué errores ven. Sin nombres de clientes ni lo que escriben."
      />
      <Tabs items={PESTANAS_USO} />
      <FiltrosUso filtro={filtro} setFiltro={setFiltro} tiendas={tiendas} />

      {error && <Notice tono="error">{error}</Notice>}
      {!datos && !error && <Cargando texto="Calculando..." />}
      {datos && datos.totales.sesiones === 0 && (
        <EmptyState icono="—" titulo="Todavía no hay uso registrado en este periodo">
          <p>La medición empieza a contar desde que se despliega esta versión del portal.</p>
        </EmptyState>
      )}

      {datos && datos.totales.descartados > 0 && (
        <Notice tono="warn" titulo={`${datos.totales.descartados.toLocaleString("es-MX")} eventos llegaron y no se reconocieron`}>
          <p>
            El portal mandó pasos o eventos que el servidor no conoce (o al revés): casi siempre es que se desplegó
            el sitio sin las funciones, o al revés. No entran en los números de abajo. Revisa que las dos copias de
            catalogoUso.ts / catalogo.ts estén desplegadas.
          </p>
        </Notice>
      )}

      {datos && datos.totales.sesiones > 0 && (
        <>
          <StatTiles
            stats={[
              { label: "Tiempo de uso", value: minutosLegibles(datos.totales.minutos) },
              { label: "Sesiones", value: datos.totales.sesiones.toLocaleString("es-MX") },
              { label: "Personas", value: datos.totales.personas.toLocaleString("es-MX") },
              {
                label: "Toques de frustración",
                value: datos.totales.frustracion.toLocaleString("es-MX"),
                tone: datos.totales.frustracion > 0 ? "accion" : "neutral",
              },
              { label: "Toques sin botón", value: datos.totales.sinBoton.toLocaleString("es-MX") },
              {
                label: "Errores",
                value: datos.totales.errores.toLocaleString("es-MX"),
                tone: datos.totales.errores > 0 ? "accion" : "neutral",
              },
              {
                label: "Cortes de señal",
                value: `${datos.totales.cortesSenal} · ${minutosLegibles(datos.totales.minutosSinSenal)}`,
              },
            ]}
          />

          <div className="adm-grid uso-grid-2">
            <Card
              titulo="Subir documentos"
              descripcion="De cada vez que abren el formulario, en cuántas queda guardado el documento."
            >
              <h3 className="uso-subtitulo">Cotización</h3>
              <Embudo pasos={datos.embudos.cotizacion} />
              <h3 className="uso-subtitulo">Comprobante de entrega</h3>
              <Embudo pasos={datos.embudos.comprobante} />
              <h3 className="uso-subtitulo">Por qué no quedó guardado</h3>
              <BarrasHorizontales filas={datos.motivos.documentos.map((m) => ({ etiqueta: m.motivo, valor: m.veces }))} tono="ambar" vacio="Todos los intentos terminaron guardados." />
            </Card>

            <Card titulo="Código del cliente en caja" descripcion="De cada código que capturan, cuántos terminan en venta confirmada.">
              <Embudo pasos={datos.embudos.vale} />
              <h3 className="uso-subtitulo">Por qué no terminó en venta</h3>
              <BarrasHorizontales filas={datos.motivos.vale.map((m) => ({ etiqueta: m.motivo, valor: m.veces }))} tono="ambar" vacio="Todos los códigos terminaron en venta." />
              <h3 className="uso-subtitulo">Con qué capturan el código</h3>
              <BarrasHorizontales filas={datos.medios.map((m) => ({ etiqueta: m.motivo, valor: m.veces }))} />
              {datos.camara.length > 0 && (
                <>
                  <h3 className="uso-subtitulo">La cámara</h3>
                  <BarrasHorizontales filas={datos.camara.map((m) => ({ etiqueta: m.motivo, valor: m.veces }))} />
                </>
              )}
            </Card>
          </div>

          <div className="adm-grid uso-grid-2">
            <Card titulo="Uso por día" descripcion="Minutos de uso activo (hora de la Ciudad de México).">
              <Columnas
                columnas={datos.porDia.map((d) => ({
                  etiqueta: d.dia.slice(8),
                  valor: d.minutos,
                  titulo: `${d.dia} · ${d.sesiones} sesiones`,
                }))}
                formato={minutosLegibles}
                cadaEtiqueta={Math.max(1, Math.ceil(datos.porDia.length / 15))}
              />
            </Card>
            <Card titulo="Uso por hora" descripcion="A qué hora del día trabajan en el portal.">
              <Columnas
                columnas={HORAS.map((h) => ({ etiqueta: String(h), valor: datos.porHora[h] ?? 0, titulo: `${h}:00` }))}
                formato={minutosLegibles}
                cadaEtiqueta={3}
              />
            </Card>
          </div>

          <Card titulo="Pantallas" descripcion="Tiempo y toques en cada pantalla (y en cada ventana, como “Subir cotización”). Toca una para ver su mapa de toques.">
            <div className="adm-tabla-wrap">
              <table className="adm-tabla">
                <thead>
                  <tr>
                    <th>Pantalla</th>
                    <th>Tiempo</th>
                    <th className="num">Visitas</th>
                    <th className="num">Toques</th>
                    <th className="num">Frustración</th>
                    <th className="num">Sin botón</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.pantallas.map((p) => (
                    <tr key={p.pantalla}>
                      <td>
                        {p.toques > 0 ? (
                          <button type="button" className="adm-btn adm-btn--texto adm-btn--chico" onClick={() => setPantallaMapa(p.pantalla)}>
                            {p.pantalla}
                          </button>
                        ) : (
                          p.pantalla
                        )}
                      </td>
                      <td style={{ minWidth: "10rem" }}>
                        <span className="uso-celda-barra">
                          <span style={{ width: `${(p.minutos / Math.max(datos.pantallas[0]?.minutos ?? 1, 0.1)) * 100}%` }} />
                        </span>
                        {minutosLegibles(p.minutos)}
                      </td>
                      <td className="num">{p.visitas}</td>
                      <td className="num">{p.toques}</td>
                      <td className="num">{p.frustracion}</td>
                      <td className="num">{p.sinBoton}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {pantallasConToques.length > 0 && (
            <Card
              titulo="Mapa de toques"
              descripcion="Dónde tocan en la pantalla real, tomada de una grabación (con los datos de clientes tapados)."
            >
              <MapaToques filtro={filtro} pantallas={pantallasConToques} pantallaInicial={pantallaMapa} />
            </Card>
          )}

          <div className="adm-grid uso-grid-2">
            <Card titulo="Dónde se frustran" descripcion="3 o más toques en un segundo en el mismo lugar: esperaban que algo pasara.">
              <TablaElementos filas={datos.frustracion} vacio="Nadie tocó repetido en este periodo." />
            </Card>
            <Card titulo="Toques en algo que no es botón" descripcion="Lo que creen que se puede tocar y no hace nada.">
              <TablaElementos filas={datos.sinBoton} vacio="Ningún toque cayó fuera de un botón." />
            </Card>
          </div>

          <Card titulo="Por persona" descripcion="Para ver quién batalla más y a quién conviene grabar unos días.">
            <div className="adm-tabla-wrap">
              <table className="adm-tabla">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Tienda</th>
                    <th className="num">Sesiones</th>
                    <th className="num">Tiempo</th>
                    <th className="num">Documentos guardados</th>
                    <th className="num">Ventas con código</th>
                    <th className="num">Frustración</th>
                    <th className="num">Errores</th>
                    <th>Último uso</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.personas.map((p) => (
                    <tr key={p.uid}>
                      <td>
                        {p.email ?? p.uid}
                        <div className="adm-field__ayuda">{p.perfil === "tienda" ? "Personal de tienda" : "Asesor de ventas"}</div>
                      </td>
                      <td>{nombreTiendas(p.tiendas)}</td>
                      <td className="num">{p.sesiones}</td>
                      <td className="num">{minutosLegibles(p.minutos)}</td>
                      <td className="num">{p.documentosGuardados}</td>
                      <td className="num">{p.codigosConfirmados}</td>
                      <td className="num">{p.frustracion}</td>
                      <td className="num">{p.errores}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {p.ultimo ? fechaHora(p.ultimo) : "—"}
                        {p.email && (
                          <div>
                            <Link to={`/admin/uso/grabaciones?email=${encodeURIComponent(p.email)}`}>Grabaciones</Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card titulo="Errores" descripcion="Lo que falló en los equipos de las tiendas, agrupado por mensaje.">
            {datos.errores.length === 0 ? (
              <p className="adm-field__ayuda">Sin errores en este periodo.</p>
            ) : (
              <div className="adm-tabla-wrap">
                <table className="adm-tabla">
                  <thead>
                    <tr>
                      <th>Mensaje</th>
                      <th className="num">Veces</th>
                      <th className="num">Personas</th>
                      <th>Dónde</th>
                      <th>Última vez</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.errores.map((e) => (
                      <tr key={e.mensaje}>
                        <td>{e.mensaje}</td>
                        <td className="num">{e.veces}</td>
                        <td className="num">{e.personas}</td>
                        <td>{e.pantallas.join(", ")}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{fechaHora(e.ultimo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </section>
  );
}

function TablaElementos({
  filas,
  vacio,
}: {
  filas: { pantalla: string; elemento: string; veces: number }[];
  vacio: string;
}) {
  if (filas.length === 0) return <p className="adm-field__ayuda">{vacio}</p>;
  return (
    <div className="adm-tabla-wrap">
      <table className="adm-tabla">
        <thead>
          <tr>
            <th>Qué tocaron</th>
            <th>Pantalla</th>
            <th className="num">Veces</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={`${f.pantalla}-${f.elemento}`}>
              <td>{f.elemento}</td>
              <td>{f.pantalla}</td>
              <td className="num">{f.veces}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
