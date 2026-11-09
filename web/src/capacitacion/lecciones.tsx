import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { getEtapas } from "../lib/dealScope";
import type { EtapaConfig } from "../types/admin";
import { useCapacitacion, useEtiqueta } from "./contexto";
import type { LeccionId } from "./progreso";
import { SimuladorCaja } from "./SimuladorCaja";
import { TiendaPractica, cliente, seVe } from "./TiendaPractica";
import {
  Avance,
  BotonSubir,
  Consejo,
  Ejemplo,
  EnRevision,
  Importante,
  Listo,
  Paso,
  Pasos,
  Pendiente,
  Rechazado,
  Seccion,
  TablaSignificados,
} from "./piezas";

/**
 * El contenido de la capacitación. Cada lección responde tres cosas, en
 * este orden: para qué sirve, cómo se hace paso a paso, y qué hacer cuando
 * algo sale distinto — que es de donde salen las llamadas a soporte. Las
 * que enseñan una tarea cierran con su práctica: la persona la hace en un
 * simulador con las pantallas reales y clientes inventados. No hay
 * exámenes: se aprende haciendo, y la lección se da por pasada al terminar
 * la práctica (o con "Entendido" si no tiene tarea que practicar).
 *
 * Reglas para editarlo:
 * - Describir lo que la app hace hoy, con los mismos textos que muestra.
 *   Si cambia un botón o un mensaje, cambia aquí también.
 * - Nunca explicar qué revisa la verificación automática de documentos:
 *   enseñarlo es enseñar a burlarla (ver functions/src/ocr/validate.ts).
 *   Se dice qué tiene que tener un buen documento, no qué se detecta.
 * - No prometer plazos ni políticas que no estén en la app.
 * - Si se agrega o quita una lección, actualizar ORDEN_LECCIONES
 *   (progreso.ts) y LECCIONES_CAPACITACION en el backend.
 */
export interface Leccion {
  id: LeccionId;
  titulo: string;
  /** Una línea: para qué le sirve a la tienda. */
  resumen: string;
  minutos: number;
  Contenido: () => ReactNode;
  /**
   * El simulador de la tarea, si la lección enseña una. Avisa con
   * `onCompletado` cuando se cumplieron todas sus misiones.
   */
  Practica?: (props: { onCompletado: () => void }) => ReactNode;
}

/* ------------------------------------------------------------------------ */

type Quien = "aviva" | "tu" | "cliente";

function quienHaceEtapa(etapa: EtapaConfig, origen: string): { quien: Quien; texto: string } {
  if (etapa.tipo === "personalizada") {
    return { quien: "aviva", texto: "Etapa que registra Aviva." };
  }
  switch (etapa.id) {
    case "solicitud":
      return { quien: "aviva", texto: "Aviva aprueba la solicitud de crédito del cliente." };
    case "kyc":
      return { quien: "cliente", texto: "El cliente confirma su identidad con Aviva." };
    case "cotizacion":
      return { quien: "tu", texto: "Subes la cotización del material que el cliente eligió." };
    case "credito":
      return {
        quien: "aviva",
        texto: "Aviva libera el crédito y al cliente le llega por WhatsApp su vale con un código.",
      };
    case "disposicion":
      return {
        quien: "tu",
        texto:
          origen === "paydesk"
            ? "En caja validas el código del cliente y confirmas la venta. Esta etapa se marca en ese momento."
            : "En caja validas el código del cliente y confirmas la venta. Aviva registra la etapa.",
      };
    case "comprobante":
      return { quien: "tu", texto: "Subes el comprobante de entrega firmado por el cliente." };
    case "desembolso":
      return { quien: "aviva", texto: "Aviva hace el desembolso del crédito. Es la última etapa." };
    default:
      return { quien: "aviva", texto: "Etapa que registra Aviva." };
  }
}

const ETIQUETA_QUIEN: Record<Quien, string> = {
  aviva: "Aviva",
  tu: "Te toca a ti",
  cliente: "El cliente",
};

function RecorridoCredito() {
  const { origenDisposicion } = useCapacitacion();
  const etapas = getEtapas();
  return (
    <ol className="cap-recorrido">
      {etapas.map((e, i) => {
        const { quien, texto } = quienHaceEtapa(e, origenDisposicion);
        return (
          <li key={e.id} className={`cap-recorrido__etapa cap-recorrido__etapa--${quien}`}>
            <span className="cap-recorrido__num">{i + 1}</span>
            <div>
              <div className="cap-recorrido__cabeza">
                <strong>{e.label}</strong>
                <span className={`cap-quien cap-quien--${quien}`}>{ETIQUETA_QUIEN[quien]}</span>
              </div>
              <p>{texto}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Liga a otra lección, en la misma ruta base (portal o pública). */
function VerLeccion({ id, children }: { id: LeccionId; children: ReactNode }) {
  const { base } = useCapacitacion();
  return <Link to={`${base}/${id}`}>{children}</Link>;
}

/* ------------------------------------------------------------------------ */

function Bienvenida() {
  return (
    <>
      <Seccion titulo="Qué es Paydesk">
        <p>
          Paydesk es el portal donde ves los créditos de Aviva de los clientes de tu
          tienda. Aquí sabes en qué etapa va cada uno, subes sus documentos y, en la
          caja, compruebas que su crédito es real antes de entregarle material.
        </p>
        <p>
          Todo lo que haces en Paydesk le llega a Aviva al momento. Ya no hace falta
          mandar documentos por WhatsApp o por correo.
        </p>
      </Seccion>

      <Seccion titulo="El recorrido de un crédito">
        <p>
          Cada cliente avanza por estas etapas, en orden. Las verdes son las que te
          tocan a ti; las demás las hacen Aviva o el cliente.
        </p>
        <RecorridoCredito />
      </Seccion>

      <Seccion titulo="Tus tres tareas">
        <div className="cap-tareas">
          <div className="cap-tarea">
            <span className="cap-tarea__num">1</span>
            <strong>Subir la cotización</strong>
            <p>Cuando el cliente ya eligió su material.</p>
          </div>
          <div className="cap-tarea">
            <span className="cap-tarea__num">2</span>
            <strong>Validar su código y confirmar la venta</strong>
            <p>En la caja, antes de entregar el material.</p>
          </div>
          <div className="cap-tarea">
            <span className="cap-tarea__num">3</span>
            <strong>Subir el comprobante de entrega</strong>
            <p>Firmado por el cliente, cuando ya recibió su material.</p>
          </div>
        </div>
      </Seccion>

      <Importante titulo="La regla de oro">
        <p>
          <strong>Nunca entregues material sin validar el código del cliente en
          Paydesk.</strong> Un mensaje de WhatsApp, una captura de pantalla o una
          llamada no prueban que el crédito existe: se pueden falsificar. El código
          validado en Paydesk sí.
        </p>
      </Importante>
    </>
  );
}

function Acceso() {
  return (
    <>
      <Seccion titulo="Cómo obtienes tu cuenta">
        <Pasos>
          <Paso titulo="Tu ejecutivo de Aviva invita tu correo">
            Cada persona tiene su propia cuenta, con su correo. Si en tu tienda
            trabajan varias personas, cada una necesita su invitación.
          </Paso>
          <Paso titulo="Te llega un correo para crear tu contraseña">
            Ábrelo y sigue la liga. Si no lo ves en unos minutos, revisa la carpeta de
            correo no deseado o spam.
          </Paso>
          <Paso titulo="Entra con tu correo y tu contraseña">
            Siempre desde la misma página de Paydesk. No hay ligas especiales por
            tienda.
          </Paso>
        </Pasos>
      </Seccion>

      <Seccion titulo="Si olvidaste tu contraseña">
        <p>
          En la pantalla de entrada, toca <strong>“¿Olvidaste tu contraseña?”</strong>,
          escribe el correo con el que te invitaron y toca <strong>“Enviar liga”</strong>.
          Te llega un correo para crear una nueva. Por seguridad, la pantalla dice lo
          mismo aunque el correo no tenga cuenta: si no te llega nada, confirma con tu
          ejecutivo que tu correo esté bien escrito.
        </p>
      </Seccion>

      <Seccion titulo="“Mantener sesión iniciada”">
        <p>
          Esta casilla deja tu sesión abierta en ese equipo aunque cierres el
          navegador. Úsala solo en la computadora, tablet o celular de la tienda,
          nunca en un equipo público o prestado.
        </p>
      </Seccion>

      <Seccion titulo="Si atiendes más de una tienda">
        <p>
          Con una sola cuenta ves a los clientes de todas tus tiendas en una sola
          lista, con una columna que dice de qué tienda es cada uno. Arriba a la
          derecha puedes elegir ver solo una tienda.
        </p>
        <p>
          Si Aviva te acaba de dar acceso a otra tienda y todavía no la ves, recarga
          la página.
        </p>
      </Seccion>

      <Importante>
        <p>
          No compartas tu contraseña con nadie, ni con tus compañeros. Todo lo que se
          hace en Paydesk queda registrado con la cuenta de quien lo hizo, incluida
          cada validación de código en caja.
        </p>
      </Importante>
    </>
  );
}

function MisClientes() {
  const et = useEtiqueta();
  return (
    <>
      <Seccion titulo="Una fila por cliente">
        <p>
          La pestaña <strong>“Mis clientes”</strong> es tu lista de trabajo. Cada fila
          es la solicitud de crédito de un cliente, con una columna por etapa. La
          columna <strong>Avance</strong> te dice de un vistazo cuántas etapas lleva.
        </p>
        <Ejemplo titulo="una fila de tu lista">
          <div className="deals-table-wrapper">
            <table className="deals-table">
              <thead>
                <tr>
                  <th>{et("cliente")}</th>
                  <th>Avance</th>
                  <th>{et("cotizacionEstatus")}</th>
                  <th>{et("creditoLiberadoFecha")}</th>
                  <th>{et("comprobanteEntregaEstatus")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="cell-cliente">Ana Martínez</td>
                  <td>
                    <Avance hechas={2} />
                  </td>
                  <td>
                    <BotonSubir>Subir cotización</BotonSubir>
                  </td>
                  <td>
                    <Pendiente />
                  </td>
                  <td>
                    <Pendiente />
                  </td>
                </tr>
                <tr>
                  <td className="cell-cliente">Luis Ramírez</td>
                  <td>
                    <Avance hechas={5} />
                  </td>
                  <td>
                    <Listo fecha="3 de noviembre de 2026" />
                  </td>
                  <td>
                    <Listo fecha="5 de noviembre de 2026" />
                  </td>
                  <td>
                    <BotonSubir>Subir comprobante</BotonSubir>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Ejemplo>
      </Seccion>

      <Seccion titulo="Qué significa cada cosa">
        <TablaSignificados
          filas={[
            [<Listo />, "Esa etapa ya está lista, en esa fecha.", "Nada."],
            [<Pendiente />, "Esa etapa todavía no llega.", "Nada, salvo que sea una de tus tareas."],
            [
              <BotonSubir>Subir cotización</BotonSubir>,
              "Te toca a ti: falta un documento tuyo.",
              "Tócalo y sube el documento.",
            ],
            [<EnRevision />, "Aviva está revisando el documento que subiste.", "Esperar. No tienes que hacer nada."],
            [
              <Rechazado />,
              "El documento no se pudo aceptar.",
              "Sube otro: correcto, completo y legible.",
            ],
            [
              <span className="tag-historica">Anterior</span>,
              "Ese crédito cerró antes de que tu tienda empezara a usar Paydesk.",
              "Nada. No tienes que subir documentos.",
            ],
          ]}
        />
      </Seccion>

      <Seccion titulo="Encuentra rápido lo que te toca">
        <p>
          Cuando hay clientes esperando un documento tuyo, arriba de la lista aparece
          un aviso:
        </p>
        <Ejemplo titulo="el aviso de pendientes">
          <span className="callout-accion cap-falso">
            <span className="callout-accion__count">3</span>
            <span>
              clientes están esperando un documento tuyo
              <span className="callout-accion__cta">Ver cuáles →</span>
            </span>
          </span>
        </Ejemplo>
        <p>Tócalo, o usa los filtros de arriba de la lista:</p>
        <ul>
          <li>
            <strong>Te toca a ti</strong>: falta que subas la cotización o el comprobante.
          </li>
          <li>
            <strong>En proceso</strong>: avanzando, sin nada pendiente de tu parte.
          </li>
          <li>
            <strong>Completadas</strong>: ya llegaron al desembolso.
          </li>
          <li>
            <strong>Anteriores</strong>: cerraron antes de que tu tienda usara Paydesk.
          </li>
        </ul>
      </Seccion>

      <Importante titulo="¿No encuentras a un cliente?">
        <p>
          La lista abre en <strong>“Este mes”</strong>: solo enseña las solicitudes de
          este mes. Si buscas a alguien de antes, toca <strong>“Todo”</strong> o
          escribe su nombre en <strong>“Buscar cliente por nombre”</strong>. Si aun así
          no aparece, revisa la pestaña <strong>“Canceladas”</strong>.
        </p>
      </Importante>

      <Consejo>
        <p>
          La lista se actualiza sola cuando Aviva avanza un crédito. No necesitas
          recargar la página. Toca el nombre de una columna para ordenar por ella.
        </p>
      </Consejo>
    </>
  );
}

function Cotizacion() {
  const et = useEtiqueta();
  return (
    <>
      <Seccion titulo="Para qué sirve">
        <p>
          La cotización le dice a Aviva qué material va a comprar el cliente y por
          cuánto. Es la etapa que sigue después de que el cliente confirma su
          identidad, y Aviva la necesita para seguir con el crédito.
        </p>
      </Seccion>

      <Seccion titulo="Cómo subirla">
        <Pasos>
          <Paso titulo={`En “Mis clientes”, busca al cliente y toca “Subir cotización”`}>
            Está en la columna <strong>{et("cotizacionEstatus")}</strong>.
          </Paso>
          <Paso titulo="Elige el archivo">
            PDF, foto o XML. Las fotos del celular sirven, incluidas las de iPhone.
          </Paso>
          <Paso titulo={`Captura la “${et("cotizacionFechaEntregaAcordada")}”`}>
            El día en que quedaste con el cliente de entregarle el material.
          </Paso>
          <Paso titulo={`Captura el “${et("cotizacionMontoTotalCompra")}”`}>
            El <strong>total tal como viene en la cotización</strong>. No pongas el
            monto aprobado del crédito: son números distintos.
          </Paso>
          <Paso titulo="Toca “Guardar cotización”" />
        </Pasos>
      </Seccion>

      <Seccion titulo="Un buen documento">
        <ul className="cap-checklist">
          <li>Es la cotización de ese cliente, no la de otro.</li>
          <li>Está completo: se ve de orilla a orilla, sin partes cortadas.</li>
          <li>Se lee bien: foto de frente, con buena luz y sin reflejos.</li>
          <li>El total que capturas es el mismo que dice el documento.</li>
        </ul>
        <Consejo>
          <p>
            Si tienes el PDF original del sistema de tu tienda, súbelo en vez de una
            foto de la hoja impresa. Se lee mejor.
          </p>
        </Consejo>
      </Seccion>

      <Seccion titulo="Qué pasa después">
        <p>
          Paydesk revisa el documento en cuanto lo subes. Puede pasar una de tres
          cosas; las tres se explican en la lección{" "}
          <VerLeccion id="revision">“Documentos en revisión o con problema”</VerLeccion>.
        </p>
        <TablaSignificados
          columnas={["Lo que ves", "Qué pasó", "Qué haces"]}
          filas={[
            [<Listo />, "Se aceptó y ya le llegó a Aviva.", "Nada."],
            [<EnRevision />, "Se guardó; Aviva lo va a revisar.", "Esperar."],
            ["Un mensaje en rojo en la ventana", "No se pudo aceptar. No se guardó.", "Subir otro."],
          ]}
        />
      </Seccion>

      <Seccion titulo="Si te equivocaste de archivo">
        <p>
          Abajo de la fecha verás <strong>“Corregir documento”</strong> (o{" "}
          <strong>“Reemplazar”</strong> si está en revisión). Súbelo de nuevo y el
          nuevo reemplaza al anterior. Para ver lo que subiste, toca la fecha.
        </p>
      </Seccion>
    </>
  );
}

function ValidarCodigo() {
  const et = useEtiqueta();
  const { origenDisposicion } = useCapacitacion();
  return (
    <>
      <Seccion titulo="Para qué sirve">
        <p>
          Cuando Aviva libera el crédito, al cliente le llega por WhatsApp un{" "}
          <strong>vale</strong>: una página con un código de barras y un número de 10
          dígitos. Ese código es la prueba de que su crédito existe y de cuánto es.
          Validarlo en Paydesk es lo único que te protege de entregar material contra
          un crédito falso, vencido o de otra tienda.
        </p>
        <Ejemplo titulo="el vale que trae el cliente en su celular">
          <div className="cap-vale">
            <span className="cap-vale__etiqueta">Crédito autorizado</span>
            <span className="cap-vale__monto">$25,000.00 MXN</span>
            <span className="cap-vale__barras" aria-hidden />
            <span className="cap-vale__digitos">12345 67890</span>
            <span className="vale-chip vale-chip--verde">Un solo uso</span>
          </div>
        </Ejemplo>
      </Seccion>

      <Seccion titulo="Dónde se valida">
        <ul>
          <li>
            En la pestaña <strong>“Validar código”</strong>, o
          </li>
          <li>
            Desde la fila del cliente, con el botón <strong>“Validar código”</strong> de
            la columna <strong>{et("creditoLiberadoFecha")}</strong>. Si el código que
            escaneas resulta ser de otro cliente, Paydesk te avisa para que no
            entregues el material equivocado.
          </li>
        </ul>
      </Seccion>

      <Seccion titulo="Tres maneras de meter el código">
        <TablaSignificados
          columnas={["Con qué", "Cómo", "Ojo"]}
          filas={[
            [
              "Pistola o lector de la caja",
              "Apunta al código. Los dígitos se escriben solos y se valida solo.",
              "Una pistola de láser no lee pantallas de celular, solo papel.",
            ],
            [
              "Cámara de tu celular o tablet",
              "Toca “Escanear con la cámara” y apunta al código del cliente.",
              "Es la salida si tu pistola es de láser.",
            ],
            [
              "A mano",
              "Teclea los 10 dígitos que vienen debajo del código de barras.",
              "Siempre funciona, con o sin equipo.",
            ],
          ]}
        />
        <Consejo>
          <p>
            Si el lector no toma la pantalla del cliente, pídele que suba el brillo de
            su celular al máximo, o que te dicte los 10 dígitos.
          </p>
        </Consejo>
      </Seccion>

      <Seccion titulo="Validar no es usar">
        <p>
          Son dos pasos distintos, y es importante no confundirlos:
        </p>
        <Pasos>
          <Paso titulo="Validar: ¿el código sirve y por cuánto?">
            No gasta el vale. Puedes validarlo las veces que necesites, por ejemplo
            mientras el cliente decide qué llevar.
          </Paso>
          <Paso titulo="Confirmar disposición: la venta se cierra">
            Capturas el <strong>monto de la venta</strong> (puede ser menor al
            autorizado, nunca mayor) y tocas <strong>“Confirmar disposición”</strong>.
            En ese momento el vale queda usado y ya no vuelve a servir
            {origenDisposicion === "paydesk"
              ? `, y la columna “${et("disposicionCreditoFecha")}” se marca con la fecha`
              : ""}
            .
          </Paso>
        </Pasos>
        <Importante>
          <p>
            Confirma solo cuando vayas a entregar el material. Una confirmación no se
            puede deshacer desde Paydesk: si te equivocaste de monto o de cliente,
            avísale a tu ejecutivo de Aviva de inmediato.
          </p>
        </Importante>
      </Seccion>

      <Seccion titulo="Lo que te puede decir la caja">
        <TablaSignificados
          columnas={["Pantalla", "Qué significa", "Qué haces"]}
          filas={[
            [
              <span className="vale-chip vale-chip--verde">Código válido</span>,
              "El crédito existe y es de tu tienda. Te enseña cliente, monto y vencimiento.",
              "Revisa que el nombre sea el del cliente. Captura el monto de la venta, confirma y entrega.",
            ],
            [
              <span className="vale-chip vale-chip--ambar">Ya se leyó 2 veces</span>,
              "El código es válido, pero alguien ya lo había escaneado antes.",
              "Si fuiste tú o tu tienda hace un momento, sigue. Si no, pregúntale al cliente antes de entregar.",
            ],
            [
              <strong className="cap-rojo">Este vale ya se usó</strong>,
              "Ya se confirmó una venta con ese código.",
              "No entregues material. Si el cliente dice que no fue él, repórtalo a Aviva.",
            ],
            [
              <strong className="cap-rojo">Este código no es de tu tienda</strong>,
              "El crédito quedó autorizado para otra tienda.",
              "No entregues material. El cliente pide a Aviva que lo reasignen.",
            ],
            [
              <strong className="cap-ambar">Este vale ya venció</strong>,
              "Pasó su fecha de vencimiento.",
              "No entregues material. Aviva le manda uno nuevo por WhatsApp.",
            ],
            [
              <strong className="cap-ambar">Este vale fue reemplazado</strong>,
              "Aviva le mandó al cliente un vale más reciente.",
              "No entregues material. Pídele el último vale que le llegó.",
            ],
            [
              <strong className="cap-ambar">Revisa los 10 dígitos</strong>,
              "El código no existe: casi siempre es un dígito mal tecleado.",
              "Vuelve a escanear o compara número por número.",
            ],
          ]}
        />
        <p className="form-note">
          Rojo: frena la entrega. Ámbar: frena la entrega, pero se puede arreglar.
        </p>
      </Seccion>

    </>
  );
}

function Comprobante() {
  const et = useEtiqueta();
  return (
    <>
      <Seccion titulo="Para qué sirve">
        <p>
          El comprobante de entrega es la prueba de que el cliente recibió su material
          y lo firmó. Con él, el crédito puede avanzar a su última etapa, el
          desembolso.
        </p>
      </Seccion>

      <Seccion titulo="Cómo subirlo">
        <Pasos>
          <Paso titulo="Entrega el material y pide al cliente que firme el comprobante">
            Sirve el comprobante de entrega o la nota de remisión de tu tienda.
          </Paso>
          <Paso titulo={`En “Mis clientes”, toca “Subir comprobante”`}>
            Está en la columna <strong>{et("comprobanteEntregaEstatus")}</strong>.
          </Paso>
          <Paso titulo="Elige el archivo">PDF o foto. Para este documento no se acepta XML.</Paso>
          <Paso titulo={`Captura la “${et("comprobanteFechaEntrega")}”`}>
            El día en que el cliente recibió el material de verdad.
          </Paso>
          <Paso titulo="Marca la casilla de que el cliente firmó">
            Sin ella no se puede guardar.
          </Paso>
          <Paso titulo="Toca “Guardar comprobante”" />
        </Pasos>
      </Seccion>

      <Seccion titulo="Un buen comprobante">
        <ul className="cap-checklist">
          <li>Es de ese cliente y de esa entrega.</li>
          <li>La firma del cliente se ve claramente.</li>
          <li>Se lee completo, sin partes cortadas ni borrosas.</li>
          <li>La fecha que capturas es la misma que dice el documento.</li>
        </ul>
      </Seccion>

      <Importante>
        <p>
          Si el cliente no ha firmado, no subas el comprobante ni marques la casilla.
          Consigue la firma primero. Marcar la casilla es tu confirmación de que el
          cliente firmó.
        </p>
      </Importante>

      <Consejo>
        <p>
          Súbelo el mismo día de la entrega. Mientras no lo subas, ese cliente se
          queda en <strong>“Te toca a ti”</strong>.
        </p>
      </Consejo>
    </>
  );
}

function Revision() {
  return (
    <>
      <Seccion titulo="Cada documento se revisa al subirlo">
        <p>
          Cuando subes una cotización o un comprobante, Paydesk lo revisa en ese
          momento. Hay tres resultados posibles:
        </p>
        <TablaSignificados
          columnas={["Resultado", "Qué pasó", "Qué haces"]}
          filas={[
            [
              <Listo />,
              "Aceptado. El documento ya le llegó a Aviva.",
              "Nada.",
            ],
            [
              <EnRevision />,
              "Se guardó, pero una persona de Aviva lo va a revisar antes de aceptarlo.",
              "Esperar. Si te equivocaste de archivo, toca “Reemplazar”.",
            ],
            [
              "“Hubo un problema con el archivo y no pudimos aceptarlo…”",
              "No se aceptó y no se guardó. Suele ser un archivo ilegible, cortado o que no es el documento que se pide.",
              "Sube el documento correcto, completo y legible.",
            ],
          ]}
        />
      </Seccion>

      <Seccion titulo="Cuando Aviva rechaza un documento en revisión">
        <p>Verás en la fila del cliente un mensaje en rojo, con el comentario de Aviva:</p>
        <Ejemplo titulo="un documento rechazado por Aviva">
          <div className="cell-upload-done">
            <span className="cell-rejected">
              Hubo un problema con el documento: la foto está cortada. Vuelve a subirlo.
            </span>
            <BotonSubir>Subir otro</BotonSubir>
          </div>
        </Ejemplo>
        <p>Lee el comentario, corrige lo que dice y sube el documento otra vez.</p>
      </Seccion>

      <Seccion titulo="“¿Crees que es un error?”">
        <p>
          Si el mismo documento de un cliente se rechaza dos veces seguidas, en la
          ventana aparece <strong>“Solicitar verificación manual”</strong>. Úsalo solo
          si estás seguro de que el documento es correcto, completo y legible: se lo
          mandas a una persona de Aviva para que lo revise, y queda{" "}
          <strong>“En revisión”</strong> mientras tanto.
        </p>
      </Seccion>

      <Seccion titulo="Por qué no te decimos exactamente qué estuvo mal">
        <p>
          Por seguridad, Paydesk no explica qué encontró en un documento rechazado.
          Revisa que sea el documento correcto de ese cliente, que esté completo y que
          se lea bien. Casi siempre, subir el archivo original o una foto más clara lo
          resuelve.
        </p>
      </Seccion>

      <Consejo>
        <p>
          Si subes muchos archivos seguidos puede aparecer{" "}
          <strong>“Demasiados intentos seguidos”</strong>. Espera unos minutos y vuelve
          a intentarlo.
        </p>
      </Consejo>
    </>
  );
}

function CanceladasReporte() {
  return (
    <>
      <Seccion titulo="La pestaña “Canceladas”">
        <p>
          Aquí están las solicitudes que ya no van a avanzar: Aviva canceló el crédito,
          o expiró porque el cliente no lo usó a tiempo. Salen de tu lista principal
          para que no parezca que tienes trabajo pendiente con ellas.
        </p>
        <ul>
          <li>Su código ya no sirve.</li>
          <li>No hay documentos que subir.</li>
          <li>Si el cliente todavía quiere su material a crédito, tiene que solicitar de nuevo con Aviva.</li>
        </ul>
        <p>La columna <strong>“Qué pasó”</strong> te dice qué alcanzó a pasar con su vale:</p>
        <TablaSignificados
          columnas={["Dice", "Qué significa", "Qué haces"]}
          filas={[
            [
              <span className="vale-chip vale-chip--neutro">El cliente no llegó</span>,
              "Su código nunca se escaneó en ninguna caja.",
              "Nada.",
            ],
            [
              <span className="vale-chip vale-chip--ambar">Llegó, no se completó</span>,
              "Su código se leyó, pero nadie confirmó la venta.",
              "Nada; si el cliente regresa, que solicite de nuevo.",
            ],
            [
              <span className="vale-chip vale-chip--ambar">Alcanzó a usarlo</span>,
              "Se entregó material antes de que el crédito se cancelara.",
              "Repórtalo a tu ejecutivo de Aviva.",
            ],
            [
              <span className="vale-chip vale-chip--neutro">Sin código emitido</span>,
              "El crédito se canceló antes de liberarse.",
              "Nada.",
            ],
          ]}
        />
      </Seccion>

      <Seccion titulo="La pestaña “Reporte”">
        <p>
          Te dice cómo van los créditos de tus clientes: cuántos tienes, cuántos
          documentos te faltan por subir, en qué etapa se juntan tus clientes y cuánto
          se ha desembolsado.
        </p>
        <Consejo>
          <p>
            El reporte usa los mismos filtros que tu lista. Si eliges “Mes pasado” en
            “Mis clientes”, el reporte también enseña el mes pasado.
          </p>
        </Consejo>
      </Seccion>
    </>
  );
}

/* ------------------------------------------------------------------------ */

export const LECCIONES: Leccion[] = [
  {
    id: "bienvenida",
    titulo: "Qué es Paydesk y qué te toca a ti",
    resumen: "El recorrido de un crédito, tus tres tareas y la regla que nunca se rompe.",
    minutos: 3,
    Contenido: Bienvenida,
  },
  {
    id: "acceso",
    titulo: "Entrar a tu cuenta",
    resumen: "Tu invitación, tu contraseña y qué hacer si alguien más de tu tienda necesita entrar.",
    minutos: 2,
    Contenido: Acceso,
  },
  {
    id: "mis-clientes",
    titulo: "Leer tu lista de clientes",
    resumen: "Qué significa cada columna, cómo encontrar lo que te toca y dónde buscar a un cliente.",
    minutos: 5,
    Contenido: MisClientes,
    Practica: ({ onCompletado }) => (
      <TiendaPractica
        onCompletado={onCompletado}
        misiones={[
          {
            id: "te-toca",
            texto: "Deja en la lista solo a los clientes que esperan un documento tuyo.",
            pista: "Toca el aviso verde o el filtro “Te toca a ti”.",
            hecha: (s) => s.filtros.estado === "requieren-accion",
          },
          {
            id: "pedro",
            texto: "Encuentra a Pedro Sánchez. Lo aprobaron el mes pasado.",
            pista: "La lista abre en “Este mes”: cambia el periodo a “Mes pasado” o “Todo”.",
            hecha: (s) => seVe(s, "pedro"),
          },
          {
            id: "anterior",
            texto: "Encuentra al cliente que cerró antes de que tu tienda usara Paydesk.",
            pista: "Prueba el filtro “Anteriores” con el periodo “Todo”.",
            hecha: (s) => seVe(s, "jorge"),
          },
        ]}
      />
    ),
  },
  {
    id: "cotizacion",
    titulo: "Subir la cotización",
    resumen: "Paso a paso, qué debe tener un buen documento y cómo corregirla si te equivocaste.",
    minutos: 4,
    Contenido: Cotizacion,
    Practica: ({ onCompletado }) => (
      <TiendaPractica
        onCompletado={onCompletado}
        misiones={[
          {
            id: "subir",
            texto: "Sube la cotización de Ana Martínez. Su total es de $18,450.00.",
            pista: "Usa cualquier PDF o foto de tu equipo: en la práctica no se envía a ningún lado.",
            hecha: (s) => cliente(s, "ana")?.cotizacionEstatus === "completado",
          },
          {
            id: "monto",
            texto: "Captura como monto el total de la cotización, no el crédito aprobado ($20,000).",
            hecha: (s) => cliente(s, "ana")?.cotizacionMontoTotalCompra === 18_450,
          },
        ]}
      />
    ),
  },
  {
    id: "validar-codigo",
    titulo: "Validar el código del cliente en caja",
    resumen: "Cómo comprobar que el crédito es real, confirmar la venta y qué hacer con cada respuesta.",
    minutos: 7,
    Contenido: ValidarCodigo,
    Practica: ({ onCompletado }) => <SimuladorCaja onCompletado={onCompletado} />,
  },
  {
    id: "comprobante",
    titulo: "Subir el comprobante de entrega",
    resumen: "El último documento que te toca, cuándo subirlo y por qué la firma es indispensable.",
    minutos: 3,
    Contenido: Comprobante,
    Practica: ({ onCompletado }) => (
      <TiendaPractica
        onCompletado={onCompletado}
        misiones={[
          {
            id: "subir",
            texto: "Luis Ramírez ya recibió su material y firmó. Sube su comprobante de entrega.",
            pista: "Fíjate en la casilla de la firma: sin ella no se puede guardar.",
            hecha: (s) => cliente(s, "luis")?.comprobanteEntregaEstatus === "completado",
          },
        ]}
      />
    ),
  },
  {
    id: "revision",
    titulo: "Documentos en revisión o con problema",
    resumen: "Qué hacer cuando un documento no se acepta a la primera, sin tener que llamar a nadie.",
    minutos: 4,
    Contenido: Revision,
    Practica: ({ onCompletado }) => (
      <TiendaPractica
        onCompletado={onCompletado}
        misiones={[
          {
            id: "rechazo",
            texto: "Sube la cotización de Rosa Díaz. En esta práctica, su archivo no se va a aceptar.",
            pista: "Lee el mensaje que aparece: es el mismo que verías en la tienda.",
            hecha: (s) => {
              const r = cliente(s, "rosa");
              return Boolean(r && ((r.cotizacionRechazosAuto ?? 0) > 0 || r.cotizacionRevision));
            },
          },
          {
            id: "manual",
            texto: "Intenta una vez más y, cuando aparezca, pide la verificación manual.",
            pista: "El botón aparece después de dos rechazos seguidos del mismo documento.",
            hecha: (s) => Boolean(cliente(s, "rosa")?.cotizacionRevision?.solicitudManual),
          },
          {
            id: "en-revision",
            texto: "Encuentra a otro cliente con un documento “En revisión”.",
            pista: "Es del mes pasado: cambia el periodo.",
            hecha: (s) => seVe(s, "pedro"),
          },
        ]}
      />
    ),
  },
  {
    id: "canceladas-reporte",
    titulo: "Canceladas y tu reporte",
    resumen: "Qué pasa con los créditos que ya no avanzan y cómo ver tus números.",
    minutos: 2,
    Contenido: CanceladasReporte,
  },
];

export function getLeccion(id: string | undefined, lista: Leccion[] = LECCIONES): Leccion | undefined {
  return lista.find((l) => l.id === id);
}

export const MINUTOS_TOTALES = LECCIONES.reduce((s, l) => s + l.minutos, 0);
