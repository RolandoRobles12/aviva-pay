import { useState } from "react";
import { Link } from "react-router-dom";
import { useCapacitacion } from "./contexto";
import { coincideBusqueda, type LeccionId } from "./progreso";

/**
 * Material de consulta: lo que la tienda busca cuando algo le pasa, no lo
 * que estudia una vez. Cada pregunta frecuente salió de una situación que
 * hoy termina en llamada o en WhatsApp a Aviva; la respuesta dice qué hacer
 * y, si hace falta más, a qué lección ir.
 */
export interface PreguntaFrecuente {
  pregunta: string;
  respuesta: string;
  leccion?: LeccionId;
}

export const PREGUNTAS_FRECUENTES: PreguntaFrecuente[] = [
  {
    pregunta: "No veo a un cliente en mi lista",
    respuesta:
      "La lista abre en “Este mes”. Toca “Todo” o búscalo por nombre. Si atiendes varias tiendas, revisa que no tengas elegida solo una. Si sigue sin aparecer, revisa la pestaña “Canceladas”. Si tampoco está ahí, avísale a tu ejecutivo de Aviva: puede que el crédito no esté asignado a tu tienda.",
    leccion: "mis-clientes",
  },
  {
    pregunta: "No me llegó el correo para crear mi contraseña",
    respuesta:
      "Revisa la carpeta de correo no deseado o spam. Si no está, en la pantalla de entrada toca “¿Olvidaste tu contraseña?” y escribe el mismo correo con el que te invitaron. Si aun así no llega, confirma con tu ejecutivo que tu correo esté bien escrito.",
    leccion: "tienda-inicio",
  },
  {
    pregunta: "Me sale “Tu cuenta no tiene acceso a ninguna tienda todavía”",
    respuesta:
      "Tu cuenta existe, pero Aviva todavía no la ha agregado a tu tienda. Pídele a tu ejecutivo que lo haga y después recarga la página.",
    leccion: "tienda-inicio",
  },
  {
    pregunta: "Me dieron acceso a otra tienda y no la veo",
    respuesta: "Recarga la página. Si sigue sin aparecer, sal de tu cuenta y vuelve a entrar.",
    leccion: "tienda-inicio",
  },
  {
    pregunta: "Un compañero necesita entrar a Paydesk",
    respuesta:
      "Pídele a tu ejecutivo de Aviva que invite su correo. No le prestes tu cuenta: todo lo que se hace queda registrado a nombre de quien entró.",
    leccion: "tienda-inicio",
  },
  {
    pregunta: "La pistola de la caja no lee el código del celular del cliente",
    respuesta:
      "Las pistolas de láser no leen pantallas, solo papel. Toca “Escanear con la cámara” para usar la cámara de tu celular o tablet, o teclea los 10 dígitos que vienen debajo del código de barras. También ayuda pedirle al cliente que suba el brillo de su pantalla al máximo.",
    leccion: "validar-codigo",
  },
  {
    pregunta: "El cliente no tiene su vale o no le llegó el WhatsApp",
    respuesta:
      "Tú no puedes generar ni reenviar vales. El cliente tiene que pedirle a Aviva que se lo reenvíe. No entregues material sin validar un código.",
    leccion: "validar-codigo",
  },
  {
    pregunta: "El cliente quiere llevar más material de lo que cubre su crédito",
    respuesta:
      "Sí se puede. Al confirmar, captura el total de la venta, aunque pase del crédito autorizado.",
    leccion: "validar-codigo",
  },
  {
    pregunta: "Confirmé una venta con el monto o el cliente equivocado",
    respuesta:
      "Una confirmación no se puede deshacer desde Paydesk. Avísale a tu ejecutivo de Aviva de inmediato, con el nombre del cliente y el monto que capturaste.",
    leccion: "validar-codigo",
  },
  {
    pregunta: "Al validar sale “Ya se leyó” varias veces",
    respuesta:
      "El código es válido, pero alguien lo escaneó antes. Si fuiste tú o alguien de tu tienda hace un momento, puedes seguir. Si no, pregúntale al cliente antes de entregar; si algo no cuadra, llama a Aviva.",
    leccion: "validar-codigo",
  },
  {
    pregunta: "La columna “Disposición del crédito” sigue en Pendiente",
    respuesta:
      "Se marca cuando confirmas la venta en caja con el código del cliente (“Confirmar disposición”). Si ya lo confirmaste y sigue pendiente, recarga la página.",
    leccion: "validar-codigo",
  },
  {
    pregunta: "Subí el archivo equivocado",
    respuesta:
      "En la fila del cliente toca “Corregir documento” (o “Reemplazar” si está en revisión) y sube el correcto. El nuevo reemplaza al anterior.",
    leccion: "documentos",
  },
  {
    pregunta: "¿Qué tipo de archivos puedo subir?",
    respuesta:
      "Cotización: PDF, foto o XML. Comprobante de entrega: PDF o foto. Las fotos del celular sirven, incluidas las de iPhone.",
    leccion: "documentos",
  },
  {
    pregunta: "Mi documento no se acepta y no me dicen por qué",
    respuesta:
      "Por seguridad, Paydesk no explica qué encontró. Revisa que sea el documento correcto de ese cliente, completo y legible, y vuelve a subirlo. Si se rechaza dos veces y estás seguro de que está bien, toca “Solicitar verificación manual”.",
    leccion: "documentos",
  },
  {
    pregunta: "Mi documento lleva mucho tiempo “En revisión”",
    respuesta:
      "Una persona de Aviva lo está revisando y no tienes que hacer nada. Si pasa más de un día y el cliente está esperando, pregúntale a tu ejecutivo.",
    leccion: "documentos",
  },
  {
    pregunta: "Me sale “Demasiados intentos seguidos”",
    respuesta: "Espera unos minutos y vuelve a intentarlo.",
    leccion: "documentos",
  },
  {
    pregunta: "Un cliente aparece en “Canceladas”",
    respuesta:
      "Aviva canceló su crédito, o expiró porque no lo usó a tiempo. Su código ya no sirve y no hay nada que subir: no le entregues material. Si todavía quiere su material a crédito, tiene que solicitar de nuevo con Aviva.",
  },
  {
    pregunta: "En “Canceladas” dice “Alcanzó a usarlo”",
    respuesta:
      "Se entregó material antes de que su crédito se cancelara. Repórtalo a tu ejecutivo de Aviva.",
  },
  {
    pregunta: "¿Para qué sirve la pestaña “Reporte”?",
    respuesta:
      "Te dice cómo van los créditos de tus clientes: cuántos tienes, cuántos documentos te faltan, en qué etapa se juntan y cuánto se ha desembolsado. Usa los mismos filtros que tu lista.",
  },
  {
    pregunta: "Un cliente tiene la etiqueta “Anterior”",
    respuesta:
      "Su crédito cerró antes de que tu tienda empezara a usar Paydesk. No tienes que subir nada.",
    leccion: "mis-clientes",
  },
  {
    pregunta: "¿Tengo que recargar la página para ver los cambios?",
    respuesta:
      "No. La lista se actualiza sola cuando Aviva avanza un crédito. Solo recarga si te dieron acceso a una tienda nueva.",
    leccion: "mis-clientes",
  },
  {
    pregunta: "¿Puedo usar Paydesk en el celular?",
    respuesta:
      "Sí, desde el navegador de tu celular o tablet, con tu misma cuenta. La cámara del celular también sirve para escanear el código del cliente.",
  },
];

export function PreguntasFrecuentes({
  preguntas = PREGUNTAS_FRECUENTES,
  placeholder = "Busca tu duda: contraseña, pistola, revisión…",
}: {
  preguntas?: PreguntaFrecuente[];
  placeholder?: string;
} = {}) {
  const { base } = useCapacitacion();
  const [busqueda, setBusqueda] = useState("");
  const visibles = preguntas.filter((p) =>
    coincideBusqueda(`${p.pregunta} ${p.respuesta}`, busqueda),
  );

  return (
    <div className="cap-faq">
      <input
        type="search"
        className="admin-search cap-faq__buscar"
        placeholder={placeholder}
        aria-label="Buscar en preguntas frecuentes"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      {visibles.length === 0 ? (
        <p className="form-note">
          No encontramos nada con esas palabras. Prueba con otras, o pregúntale a tu
          ejecutivo de Aviva.
        </p>
      ) : (
        visibles.map((p) => (
          <details key={p.pregunta} className="cap-faq__item">
            <summary>{p.pregunta}</summary>
            <p>{p.respuesta}</p>
            {p.leccion && (
              <Link to={`${base}/${p.leccion}`} className="cap-faq__leccion">
                Ver la lección →
              </Link>
            )}
          </details>
        ))
      )}
    </div>
  );
}

/**
 * La pregunta que más llamadas ahorra: ¿esto lo arreglo yo o necesito a
 * Aviva? Separa lo que la tienda resuelve sola, lo que tiene que hacer el
 * cliente con Aviva, y lo que de verdad necesita al ejecutivo.
 */
export const CUANDO_LLAMAR: Array<{
  situacion: string;
  quien: "tu" | "cliente" | "aviva";
  accion: string;
}> = [
  { situacion: "No encuentras a un cliente", quien: "tu", accion: "Cambia el periodo a “Todo”, búscalo por nombre y revisa “Canceladas”." },
  { situacion: "Olvidaste tu contraseña", quien: "tu", accion: "“¿Olvidaste tu contraseña?” en la pantalla de entrada." },
  { situacion: "Subiste el archivo equivocado", quien: "tu", accion: "“Corregir documento” o “Reemplazar”." },
  { situacion: "Un documento no se aceptó", quien: "tu", accion: "Súbelo correcto, completo y legible. Tras dos rechazos, pide verificación manual." },
  { situacion: "La pistola no lee la pantalla", quien: "tu", accion: "Usa la cámara o teclea los 10 dígitos." },
  { situacion: "“Este código no es de tu tienda”", quien: "cliente", accion: "No entregues. El cliente pide a Aviva que reasignen su crédito." },
  { situacion: "Vale vencido, reemplazado o perdido", quien: "cliente", accion: "No entregues. El cliente pide a Aviva un vale nuevo." },
  { situacion: "Cliente en “Canceladas”", quien: "cliente", accion: "No entregues. El cliente solicita de nuevo con Aviva." },
  { situacion: "Un compañero necesita acceso", quien: "aviva", accion: "Pide a tu ejecutivo que invite su correo." },
  { situacion: "Confirmaste una venta por error", quien: "aviva", accion: "Avisa a tu ejecutivo de inmediato." },
  { situacion: "“Este vale ya se usó” y el cliente dice que no fue él", quien: "aviva", accion: "No entregues y repórtalo a tu ejecutivo." },
  { situacion: "Cancelada con “Alcanzó a usarlo”", quien: "aviva", accion: "Repórtalo a tu ejecutivo." },
  { situacion: "Un cliente no aparece ni en “Todo” ni en “Canceladas”", quien: "aviva", accion: "Pregunta a tu ejecutivo si el crédito está asignado a tu tienda." },
];

const QUIEN: Record<"tu" | "cliente" | "aviva", string> = {
  tu: "Lo resuelves tú",
  cliente: "Lo resuelve el cliente con Aviva",
  aviva: "Llama a tu ejecutivo",
};

export function CuandoLlamar() {
  return (
    <div className="cap-tabla-wrap">
      <table className="cap-tabla">
        <thead>
          <tr>
            <th>Situación</th>
            <th>Quién</th>
            <th>Qué hacer</th>
          </tr>
        </thead>
        <tbody>
          {CUANDO_LLAMAR.map((f) => (
            <tr key={f.situacion}>
              <td>{f.situacion}</td>
              <td>
                <span className={`cap-quien cap-quien--${f.quien === "tu" ? "tu" : f.quien === "cliente" ? "cliente" : "llamar"}`}>
                  {QUIEN[f.quien]}
                </span>
              </td>
              <td>{f.accion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Una hoja para imprimir y pegar junto a la caja. Solo lo que se consulta
 * con un cliente enfrente: las tres tareas, qué hacer con cada respuesta
 * del código, y lo que nunca se hace.
 */
export function GuiaRapida() {
  return (
    <article className="cap-guia">
      <header className="cap-guia__head">
        <h1>Guía rápida de Paydesk</h1>
        <button type="button" className="button-secondary cap-no-imprimir" onClick={() => window.print()}>
          Imprimir
        </button>
      </header>
      <p className="cap-guia__sub">Para tener junto a la caja.</p>

      <div className="cap-guia__columnas">
        <section>
          <h2>Tus tres tareas</h2>
          <ol>
            <li>
              <strong>Cotización</strong>: “Mis clientes” → “Subir cotización” → archivo,
              fecha de entrega acordada y el total de la cotización.
            </li>
            <li>
              <strong>Código en caja</strong>: “Validar código” → escanea o teclea los 10
              dígitos → captura el monto de la venta → “Confirmar disposición” →
              entrega.
            </li>
            <li>
              <strong>Comprobante</strong>: con la firma del cliente → “Subir
              comprobante” → archivo, fecha de entrega y casilla de firma.
            </li>
          </ol>

          <h2>Nunca</h2>
          <ul>
            <li>Entregues material sin validar el código en Paydesk.</li>
            <li>Confirmes la venta antes de tener el total y entregar.</li>
            <li>Captures un monto mayor a lo que vendiste.</li>
            <li>Subas un comprobante sin la firma del cliente.</li>
            <li>Compartas tu contraseña.</li>
          </ul>
        </section>

        <section>
          <h2>Qué dice el código</h2>
          <table className="cap-guia__tabla">
            <tbody>
              <tr>
                <td className="cap-verde">Código válido</td>
                <td>Revisa el nombre, captura el monto, confirma y entrega.</td>
              </tr>
              <tr>
                <td className="cap-ambar">Ya se leyó N veces</td>
                <td>Si no fue tu tienda, pregunta antes de entregar.</td>
              </tr>
              <tr>
                <td className="cap-rojo">Ya se usó</td>
                <td>No entregues. Si el cliente dice que no fue él, llama a Aviva.</td>
              </tr>
              <tr>
                <td className="cap-rojo">No es de tu tienda</td>
                <td>No entregues. El cliente pide a Aviva que lo reasignen.</td>
              </tr>
              <tr>
                <td className="cap-ambar">Venció</td>
                <td>No entregues. Aviva le manda uno nuevo.</td>
              </tr>
              <tr>
                <td className="cap-ambar">Reemplazado</td>
                <td>No entregues. Pide el último vale que le llegó.</td>
              </tr>
              <tr>
                <td className="cap-ambar">Revisa los 10 dígitos</td>
                <td>Vuelve a escanear o teclea con cuidado.</td>
              </tr>
            </tbody>
          </table>

          <h2>¿La pistola no lee el celular?</h2>
          <p>Usa “Escanear con la cámara” o teclea los 10 dígitos.</p>
        </section>
      </div>
    </article>
  );
}
