import { getEtapas } from "../lib/dealScope";
import type { EtapaConfig } from "../types/admin";
import type { Leccion } from "./lecciones";
import { Consejo, Ejemplo, Importante, Seccion, TablaSignificados } from "./piezas";
import type { PreguntaFrecuente } from "./referencia";
import { VendedorPractica } from "./VendedorPractica";

/**
 * El curso del vendedor: personal de la tienda que solo vende. No sube
 * documentos ni usa la caja; entra a ver en qué etapa va cada cliente
 * aprobado para darle seguimiento y cerrar la venta.
 *
 * Mismas reglas que el curso de la tienda (lecciones.tsx): describir lo
 * que la app hace hoy, no prometer plazos ni políticas que no estén en
 * ella. Lo que se le sugiere hacer en cada etapa es seguimiento comercial
 * (hablar con el cliente, invitarlo a la tienda), nunca una tarea que el
 * sistema le pida o le deje hacer.
 */

/** Qué pasó en cada etapa y qué seguimiento puede dar el vendedor. */
function seguimiento(etapa: EtapaConfig): { paso: string; tu: string } {
  if (etapa.tipo === "personalizada") {
    return { paso: "Etapa que registra Aviva.", tu: "Nada que empujar todavía." };
  }
  switch (etapa.id) {
    case "solicitud":
      return {
        paso: "Aviva aprobó la solicitud de crédito del cliente.",
        tu: "Contacta al cliente: el siguiente paso es que confirme su identidad con Aviva.",
      };
    case "kyc":
      return {
        paso: "El cliente ya confirmó su identidad.",
        tu: "Ayúdale a elegir su material, para que la tienda pueda hacer y subir su cotización.",
      };
    case "cotizacion":
      return {
        paso: "La tienda ya subió la cotización de su material.",
        tu: "Aviva sigue con la liberación del crédito. Avísale al cliente que, en cuanto se libere, le llega su vale por WhatsApp.",
      };
    case "credito":
      return {
        paso: "El crédito se liberó y al cliente le llegó su vale por WhatsApp.",
        tu: "Es el momento clave: invítalo a la tienda con su vale para llevarse su material. El vale vence, así que no lo dejes pasar.",
      };
    case "disposicion":
      return {
        paso: "La caja validó el código del cliente y confirmó la venta.",
        tu: "Venta cerrada. Si la entrega quedó pendiente, coordínala con la tienda.",
      };
    case "comprobante":
      return {
        paso: "El cliente recibió su material y firmó el comprobante.",
        tu: "Nada pendiente. Buen momento para preguntarle cómo le fue.",
      };
    case "desembolso":
      return { paso: "El crédito llegó a su última etapa.", tu: "Terminado." };
    default:
      return { paso: "Etapa que registra Aviva.", tu: "Nada que empujar todavía." };
  }
}

function TablaEtapas() {
  return (
    <TablaSignificados
      columnas={["Va en", "Qué pasó", "Qué seguimiento puedes dar"]}
      filas={getEtapas().map((e) => {
        const s = seguimiento(e);
        return [
          <span className="cell-done">
            <span className="cell-done__check" aria-hidden>
              ✓
            </span>
            {e.label}
          </span>,
          s.paso,
          s.tu,
        ];
      })}
    />
  );
}

function Inicio() {
  return (
    <>
      <Seccion titulo="Para qué te sirve Paydesk">
        <p>
          En Paydesk ves a los clientes de tu tienda que Aviva ya aprobó, por cuánto y en
          qué etapa va su crédito. Con eso sabes a quién llamar y en qué momento, para
          acompañarlo hasta cerrar la venta.
        </p>
      </Seccion>

      <Seccion titulo="Lo que ves de cada cliente">
        <TablaSignificados
          columnas={["Columna", "Qué es", "Para qué te sirve"]}
          filas={[
            ["Va en", "La última etapa que alcanzó su crédito.", "Saber dónde está hoy."],
            ["Sigue", "La siguiente etapa que le falta.", "Saber qué seguimiento darle."],
            ["Monto aprobado", "Hasta cuánto le aprobó Aviva.", "Ofrecerle material a su medida."],
            ["Avance", "Cuántas etapas lleva de todas.", "Ver de un vistazo quién va adelantado."],
            ["Aprobado el", "Cuándo aprobó Aviva su solicitud.", "Detectar a quien lleva tiempo sin avanzar."],
          ]}
        />
      </Seccion>

      <Seccion titulo="Lo que no está en tu vista">
        <p>
          Tu perfil es de asesor de ventas: no subes cotizaciones ni comprobantes, no validas
          códigos en caja y no ves documentos. Eso lo hace el personal administrativo de
          tu tienda. Si un cliente necesita algo de eso, pásalo con ellos.
        </p>
        <p>
          Tampoco aparecen los créditos cancelados o expirados: tu lista es solo de
          clientes que siguen en proceso o ya terminaron.
        </p>
      </Seccion>

      <Importante titulo="La regla de oro">
        <p>
          El material solo se entrega cuando la caja valida el código del cliente en
          Paydesk. Un mensaje de WhatsApp o una captura de pantalla no bastan. No le
          prometas al cliente una entrega antes de eso.
        </p>
      </Importante>

      <Consejo>
        <p>
          El monto aprobado es información del cliente. Úsala para atenderlo a él y no la
          compartas con nadie más.
        </p>
      </Consejo>
    </>
  );
}

function Etapas() {
  return (
    <>
      <Seccion titulo="Cada etapa te dice qué hacer">
        <p>
          Un crédito avanza siempre en este orden. En cada etapa hay un seguimiento que
          puedes dar para que el cliente no se quede a medio camino:
        </p>
        <TablaEtapas />
      </Seccion>

      <Importante titulo="El momento que más importa">
        <p>
          Cuando un cliente llega a <strong>Crédito liberado</strong>, ya tiene su vale en
          el celular y puede llevarse su material. Es tu mejor momento para invitarlo a la
          tienda: el vale tiene fecha de vencimiento.
        </p>
      </Importante>

      <Consejo>
        <p>
          Quien lleva días en la misma etapa es quien más necesita tu llamada. Revisa la
          fecha de aprobación de los que siguen al principio.
        </p>
      </Consejo>
    </>
  );
}

function Seguimiento() {
  return (
    <>
      <Seccion titulo="Encuentra rápido a quién llamar">
        <ul>
          <li>
            <strong>Filtro por etapa</strong>: cada botón dice cuántos clientes van en esa
            etapa. Toca uno para ver solo a esos.
          </li>
          <li>
            <strong>Buscar cliente por nombre</strong>: para ver al instante en qué va
            alguien que te llama.
          </li>
          <li>
            <strong>Filtro por tienda</strong>: si vendes para más de una tienda, para ver
            solo los de una.
          </li>
        </ul>
        <Ejemplo titulo="el filtro por etapa">
          <div className="filters__row">
            <span className="chip chip--on cap-falso">
              Todas las etapas <span className="chip__count">8</span>
            </span>
            <span className="chip cap-falso">
              Crédito liberado <span className="chip__count">2</span>
            </span>
            <span className="chip cap-falso">
              KYC <span className="chip__count">1</span>
            </span>
          </div>
        </Ejemplo>
      </Seccion>

      <Seccion titulo="Tu lista se actualiza">
        <p>
          La lista se vuelve a cargar sola cada 5 minutos. Si acabas de hablar con el
          cliente y quieres ver si ya avanzó, toca <strong>“Actualizar”</strong>; junto
          al botón ves la hora de la última consulta.
        </p>
      </Seccion>

      <Seccion titulo="Ves a todos los clientes de tu tienda">
        <p>
          Paydesk no sabe qué asesor atendió a cada cliente, así que ves a todos los
          clientes aprobados de tu tienda, no solo a los tuyos. Pónganse de acuerdo en la
          tienda sobre quién le da seguimiento a quién.
        </p>
      </Seccion>
    </>
  );
}

export const LECCIONES_VENDEDOR: Leccion[] = [
  {
    id: "asesor-inicio",
    titulo: "Qué ves en Paydesk",
    resumen: "Para qué te sirve, qué significa cada columna y qué no está en tu vista.",
    minutos: 2,
    Contenido: Inicio,
  },
  {
    id: "asesor-etapas",
    titulo: "Qué hacer en cada etapa",
    resumen: "Qué significa cada etapa del crédito y qué seguimiento darle al cliente.",
    minutos: 4,
    Contenido: Etapas,
    Practica: ({ onCompletado }) => (
      <VendedorPractica
        onCompletado={onCompletado}
        misiones={[
          {
            id: "liberado",
            texto: "Encuentra a los clientes que ya pueden ir a la tienda por su material.",
            pista: "Son los que van en “Crédito liberado”.",
            hecha: (s) => s.etapa === "credito",
          },
          {
            id: "identidad",
            texto: "Encuentra a quien todavía tiene que confirmar su identidad con Aviva.",
            pista: "Va en “Solicitud aprobada”: lo siguiente es el KYC.",
            hecha: (s) => s.etapa === "solicitud",
          },
          {
            id: "material",
            texto: "Encuentra a quien ya puede elegir su material para la cotización.",
            pista: "Ya confirmó su identidad: va en “KYC”.",
            hecha: (s) => s.etapa === "kyc",
          },
        ]}
      />
    ),
  },
  {
    id: "asesor-seguimiento",
    titulo: "Encontrar a tus clientes",
    resumen: "Filtros, búsqueda y cómo tener la lista al día.",
    minutos: 3,
    Contenido: Seguimiento,
    Practica: ({ onCompletado }) => (
      <VendedorPractica
        onCompletado={onCompletado}
        misiones={[
          {
            id: "buscar",
            texto: "Pedro Sánchez te llama. Búscalo por nombre y mira en qué va.",
            hecha: (s) => s.busqueda.trim() !== "" && s.visibles.length === 1 && s.visibles[0] === "pedro",
          },
          {
            id: "tienda",
            texto: "Ve solo a los clientes de la Tienda Norte.",
            pista: "Usa los botones de tienda de arriba.",
            hecha: (s) => s.tienda === "p2",
          },
          {
            id: "actualizar",
            texto: "Vuelve a cargar la lista para ver si alguien avanzó.",
            pista: "El botón “Actualizar”, arriba a la derecha.",
            hecha: (s) => s.actualizaciones > 0,
          },
        ]}
      />
    ),
  },
];

export const MINUTOS_VENDEDOR = LECCIONES_VENDEDOR.reduce((s, l) => s + l.minutos, 0);

export const PREGUNTAS_VENDEDOR: PreguntaFrecuente[] = [
  {
    pregunta: "No veo a un cliente",
    respuesta:
      "Solo aparecen clientes que Aviva ya aprobó; los cancelados o expirados no aparecen. Quita la búsqueda y el filtro de etapa, y toca “Actualizar”. Si sigue sin aparecer, pregúntale al personal de tu tienda o a tu ejecutivo de Aviva.",
    leccion: "asesor-seguimiento",
  },
  {
    pregunta: "Veo clientes que yo no atendí",
    respuesta:
      "Es normal: ves a todos los clientes aprobados de tu tienda, porque Paydesk no sabe qué asesor atendió a cada uno.",
    leccion: "asesor-seguimiento",
  },
  {
    pregunta: "¿Por qué no puedo subir documentos ni validar códigos?",
    respuesta:
      "Tu perfil es de asesor de ventas. Las cotizaciones, los comprobantes y la caja los maneja el personal administrativo de tu tienda.",
    leccion: "asesor-inicio",
  },
  {
    pregunta: "El cliente dice que no le llegó su vale",
    respuesta:
      "Primero revisa que vaya en “Crédito liberado”: antes de esa etapa todavía no tiene vale. Si ya va ahí, el cliente le pide a Aviva que se lo reenvíe. Ni tú ni la tienda pueden generarlo.",
    leccion: "asesor-etapas",
  },
  {
    pregunta: "El cliente quiere llevar más material de lo que le aprobaron",
    respuesta:
      "Sí se puede. En caja se captura el total de la venta, aunque pase del monto aprobado.",
    leccion: "asesor-inicio",
  },
  {
    pregunta: "¿Cada cuánto se actualiza la lista?",
    respuesta: "Sola cada 5 minutos. Si quieres verla al momento, toca “Actualizar”.",
    leccion: "asesor-seguimiento",
  },
  {
    pregunta: "Un compañero asesor necesita entrar",
    respuesta: "Pídele a tu ejecutivo de Aviva que invite su correo como asesor de ventas. No le prestes tu cuenta.",
  },
  {
    pregunta: "Olvidé mi contraseña",
    respuesta:
      "En la pantalla de entrada toca “¿Olvidaste tu contraseña?” y escribe el correo con el que te invitaron.",
  },
  {
    pregunta: "¿Puedo usar Paydesk en el celular?",
    respuesta: "Sí, desde el navegador de tu celular, con tu misma cuenta.",
  },
];
