import type { ReactNode } from "react";
import { getEtapas } from "../lib/dealScope";
import type { EtapaConfig } from "../types/admin";
import { useCapacitacion, useEtiqueta } from "./contexto";
import type { LeccionId } from "./progreso";
import { SimuladorCaja } from "./SimuladorCaja";
import { TiendaPractica, cliente, seVe } from "./TiendaPractica";
import {
  Avance,
  BotonSubir,
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

/* ------------------------------------------------------------------------ */

function Inicio() {
  return (
    <>
      <Seccion titulo="Qué es Paydesk">
        <p>
          Es donde ves los créditos de Aviva de los clientes de tu tienda, subes sus
          documentos y, en la caja, compruebas que su crédito es real antes de
          entregarle material. Todo le llega a Aviva al momento.
        </p>
      </Seccion>

      <Seccion titulo="El recorrido de un crédito">
        <p>Cada cliente avanza por estas etapas. Las verdes te tocan a ti.</p>
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
            <strong>Cobrar con el vale</strong>
            <p>En la caja: validas su código y confirmas la venta.</p>
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
          Paydesk.</strong> Un WhatsApp, una captura o una llamada se pueden falsificar;
          el código validado no.
        </p>
      </Importante>

      <Seccion titulo="Tu cuenta">
        <ul>
          <li>
            Es personal: no la prestes. Si alguien más de tu tienda necesita entrar, pide
            a tu ejecutivo de Aviva que invite su correo.
          </li>
          <li>
            ¿Olvidaste tu contraseña? En la entrada, toca{" "}
            <strong>“¿Olvidaste tu contraseña?”</strong>.
          </li>
          <li>
            Tu sesión se queda abierta en ese equipo hasta que tocas{" "}
            <strong>“Salir”</strong>. En un equipo prestado, sal al terminar.
          </li>
        </ul>
      </Seccion>
    </>
  );
}

function MisClientes() {
  const et = useEtiqueta();
  return (
    <>
      <Seccion titulo="Una fila por cliente">
        <p>
          En <strong>“Mis clientes”</strong> cada fila es un cliente, con una columna
          por etapa. <strong>Avance</strong> te dice cuántas lleva.
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
            [<BotonSubir>Subir cotización</BotonSubir>, "Te toca a ti: falta un documento tuyo.", "Tócalo y súbelo."],
            [<EnRevision />, "Aviva está revisando el documento que subiste.", "Esperar."],
            [<Rechazado />, "El documento no se pudo aceptar.", "Sube otro: correcto, completo y legible."],
            [
              <span className="tag-historica">Anterior</span>,
              "Cerró antes de que tu tienda usara Paydesk.",
              "Nada. No tienes que subir documentos.",
            ],
          ]}
        />
        <p>
          Para ver solo a quienes esperan algo de ti, toca el aviso verde de arriba de la
          lista o el filtro <strong>“Te toca a ti”</strong>.
        </p>
      </Seccion>

      <Importante titulo="¿No encuentras a un cliente?">
        <p>
          La lista abre en <strong>“Este mes”</strong>. Si buscas a alguien de antes,
          toca <strong>“Todo”</strong> o búscalo por nombre. Si aun así no aparece,
          revisa la pestaña <strong>“Canceladas”</strong>.
        </p>
      </Importante>
    </>
  );
}

function Documentos() {
  const et = useEtiqueta();
  return (
    <>
      <Seccion titulo="Cuándo subes cada uno">
        <TablaSignificados
          columnas={["Documento", "Cuándo", "Qué capturas"]}
          filas={[
            [
              <strong>Cotización</strong>,
              "Cuando el cliente ya eligió su material.",
              <>
                {et("cotizacionFechaEntregaAcordada")} y el{" "}
                <strong>total tal como viene en la cotización</strong> (no el crédito
                aprobado).
              </>,
            ],
            [
              <strong>Comprobante de entrega</strong>,
              "Cuando el cliente recibió su material y firmó.",
              "La fecha real de entrega y la casilla de que el cliente firmó.",
            ],
          ]}
        />
      </Seccion>

      <Seccion titulo="Cómo se sube">
        <Pasos>
          <Paso titulo="Toca el botón verde en la fila del cliente">
            “Subir cotización” o “Subir comprobante”.
          </Paso>
          <Paso titulo="Elige el archivo">
            PDF o foto del celular (la cotización también acepta XML).
          </Paso>
          <Paso titulo="Captura los datos y guarda" />
        </Pasos>
        <ul className="cap-checklist">
          <li>Que sea del cliente correcto, completo y que se lea bien.</li>
          <li>Que lo que capturas sea lo mismo que dice el documento.</li>
          <li>El comprobante, con la firma del cliente. Sin firma, no lo subas.</li>
        </ul>
      </Seccion>

      <Seccion titulo="Si algo sale distinto" id="si-no-se-acepta">
        <TablaSignificados
          columnas={["Ves", "Qué pasó", "Qué haces"]}
          filas={[
            [<Listo />, "Se aceptó y ya le llegó a Aviva.", "Nada."],
            [<EnRevision />, "Se guardó; una persona de Aviva lo va a revisar.", "Esperar."],
            [
              "Un mensaje en rojo",
              "No se aceptó y no se guardó.",
              "Súbelo otra vez, correcto, completo y legible.",
            ],
          ]}
        />
        <p>
          Si el mismo documento se rechaza dos veces y estás seguro de que está bien,
          aparece <strong>“Solicitar verificación manual”</strong>. Y si te equivocaste
          de archivo, toca <strong>“Corregir documento”</strong> y súbelo de nuevo.
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
      <Seccion titulo="El vale del cliente">
        <p>
          Cuando Aviva libera el crédito, al cliente le llega por WhatsApp un{" "}
          <strong>vale</strong> con un código de 10 dígitos. Validarlo en Paydesk es lo
          que te protege de entregar material contra un crédito falso, vencido o de otra
          tienda.
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

      <Seccion titulo="Cómo meter el código">
        <p>
          En la pestaña <strong>“Validar código”</strong>, o con el botón “Validar
          código” de la fila del cliente:
        </p>
        <ul>
          <li>
            <strong>Pistola de la caja</strong>: apunta y se valida solo. Una pistola de
            láser no lee pantallas de celular.
          </li>
          <li>
            <strong>Cámara</strong>: toca “Escanear con la cámara”.
          </li>
          <li>
            <strong>A mano</strong>: teclea los 10 dígitos. Siempre funciona.
          </li>
        </ul>
      </Seccion>

      <Seccion titulo="Validar no es usar">
        <Pasos>
          <Paso titulo="Validar: ¿sirve y por cuánto?">
            No gasta el vale. Puedes validarlo las veces que quieras.
          </Paso>
          <Paso titulo="Confirmar disposición: la venta se cierra">
            Capturas el <strong>monto de la venta</strong> (puede ser menor al
            autorizado, nunca mayor) y confirmas. El vale ya no vuelve a servir
            {origenDisposicion === "paydesk"
              ? ` y “${et("disposicionCreditoFecha")}” se marca con la fecha`
              : ""}
            .
          </Paso>
        </Pasos>
        <Importante>
          <p>
            Confirma solo cuando vayas a entregar. Una confirmación no se deshace desde
            Paydesk: si te equivocas, avisa a tu ejecutivo de Aviva.
          </p>
        </Importante>
      </Seccion>

      <Seccion titulo="Lo que te puede decir la caja">
        <TablaSignificados
          columnas={["Pantalla", "Qué significa", "Qué haces"]}
          filas={[
            [
              <span className="vale-chip vale-chip--verde">Código válido</span>,
              "El crédito existe y es de tu tienda.",
              "Revisa el nombre, captura el monto, confirma y entrega.",
            ],
            [
              <span className="vale-chip vale-chip--ambar">Ya se leyó 2 veces</span>,
              "Es válido, pero alguien ya lo había escaneado.",
              "Si no fue tu tienda, pregunta antes de entregar.",
            ],
            [
              <strong className="cap-rojo">Este vale ya se usó</strong>,
              "Ya se confirmó una venta con ese código.",
              "No entregues. Si el cliente dice que no fue él, repórtalo a Aviva.",
            ],
            [
              <strong className="cap-rojo">Este código no es de tu tienda</strong>,
              "El crédito es de otra tienda.",
              "No entregues. El cliente pide a Aviva que lo reasignen.",
            ],
            [
              <strong className="cap-ambar">Este vale ya venció / fue reemplazado</strong>,
              "Ya no sirve.",
              "No entregues. El cliente pide el vale nuevo.",
            ],
            [
              <strong className="cap-ambar">Revisa los 10 dígitos</strong>,
              "Casi siempre es un dígito mal tecleado.",
              "Vuelve a escanear o teclea con cuidado.",
            ],
          ]}
        />
      </Seccion>
    </>
  );
}

/* ------------------------------------------------------------------------ */

export const LECCIONES: Leccion[] = [
  {
    id: "tienda-inicio",
    titulo: "Paydesk en 3 minutos",
    resumen: "Qué es, el recorrido de un crédito, tus tres tareas y tu cuenta.",
    minutos: 3,
    Contenido: Inicio,
  },
  {
    id: "mis-clientes",
    titulo: "Tu lista de clientes",
    resumen: "Qué significa cada cosa y cómo encontrar lo que te toca.",
    minutos: 3,
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
        ]}
      />
    ),
  },
  {
    id: "documentos",
    titulo: "Subir documentos",
    resumen: "Cotización y comprobante de entrega: cuándo, cómo y qué hacer si no se aceptan.",
    minutos: 4,
    Contenido: Documentos,
    Practica: ({ onCompletado }) => (
      <TiendaPractica
        onCompletado={onCompletado}
        misiones={[
          {
            id: "cotizacion",
            texto: "Sube la cotización de Ana Martínez. Su total es de $18,450.00.",
            pista: "Usa cualquier PDF o foto de tu equipo: en la práctica no se envía a ningún lado.",
            hecha: (s) => cliente(s, "ana")?.cotizacionMontoTotalCompra === 18_450,
          },
          {
            id: "comprobante",
            texto: "Luis Ramírez ya recibió su material y firmó. Sube su comprobante.",
            pista: "Sin la casilla de la firma no se puede guardar.",
            hecha: (s) => cliente(s, "luis")?.comprobanteEntregaEstatus === "completado",
          },
        ]}
      />
    ),
  },
  {
    id: "validar-codigo",
    titulo: "Cobrar con el vale",
    resumen: "Validar el código del cliente, confirmar la venta y qué hacer con cada respuesta.",
    minutos: 4,
    Contenido: ValidarCodigo,
    Practica: ({ onCompletado }) => <SimuladorCaja onCompletado={onCompletado} />,
  },
];

export function getLeccion(id: string | undefined, lista: Leccion[] = LECCIONES): Leccion | undefined {
  return lista.find((l) => l.id === id);
}

export const MINUTOS_TOTALES = LECCIONES.reduce((s, l) => s + l.minutos, 0);
