import { useCallback, useRef, useState } from "react";
import {
  confirmarDisposicionCallable,
  validarValeCallable,
} from "../lib/firebase";
import { CurrencyInput } from "./CurrencyInput";
import { EscanerCamara } from "./EscanerCamara";
import type { ValidacionVale } from "../types/vale";

const moneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

function hora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Cuánto puede tardar, como mucho, la ráfaga de teclas de una pistola de
 * código de barras. Una pistola manda los 10 dígitos en unos pocos
 * milisegundos; una persona tarda segundos. El umbral no cambia lo que
 * pasa con el vale — solo queda anotado en la bitácora, para poder
 * distinguir después un escaneo de un tecleo cuando se investiga un
 * intento raro.
 */
const MS_MAX_ESCANEO = 400;

type Resultado =
  | { tipo: "nada" }
  | { tipo: "validando" }
  | { tipo: "validado"; validacion: ValidacionVale }
  | { tipo: "confirmado"; monto: number; cliente: string | null }
  | { tipo: "error"; mensaje: string };

/**
 * La caja: escanear o teclear el código del cliente, ver si sirve y por
 * cuánto, y confirmar la disposición.
 *
 * Validar no consume el vale — la tienda puede consultarlo sin gastarlo.
 * Confirmar sí, y pide el monto realmente vendido: es el dato que hoy no
 * existe, y es lo que permite comparar autorizado contra gastado.
 *
 * Hay tres maneras de meter el código, porque no todas las tiendas tienen
 * el mismo equipo:
 *
 * 1. **Pistola de la caja.** Se comporta como teclado: teclea los dígitos
 *    en el campo y manda Enter. El campo se mantiene enfocado justo para
 *    eso — el cajero escanea uno tras otro sin tocar el mouse. Ojo: una
 *    pistola láser no lee pantallas de celular, solo papel.
 * 2. **Cámara del celular o la tablet** de la tienda. Es la salida para
 *    las tiendas con pistola láser, que sí necesitan leer la pantalla del
 *    cliente.
 * 3. **Tecleado a mano.** La ruta que siempre funciona, con cualquier
 *    equipo y sin ninguno.
 */
export function ValidarCodigoPanel({
  dealIdEsperado,
  clienteEsperado,
  onConfirmado,
}: {
  /**
   * Cuando la ventana se abre desde la fila de un cliente, sabemos de qué
   * solicitud debería ser el vale. Sirve para avisar —no para bloquear—
   * cuando el código escaneado es de otro cliente de la misma tienda: el
   * cajero está viendo una fila y podría entregar el material equivocado.
   */
  dealIdEsperado?: string;
  clienteEsperado?: string | null;
  onConfirmado?: () => void;
} = {}) {
  const [codigo, setCodigo] = useState("");
  const [resultado, setResultado] = useState<Resultado>({ tipo: "nada" });
  const [monto, setMonto] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const inicioCaptura = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Evita que el Enter del lector vuelva a mandar lo que el auto-envío ya mandó. */
  const autoEnviado = useRef(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    autoEnviado.current = false;
    if (inicioCaptura.current === null) inicioCaptura.current = Date.now();

    const valor = e.target.value;
    setCodigo(valor);
    if (resultado.tipo !== "nada") setResultado({ tipo: "nada" });

    // No todos los lectores mandan Enter al final: algunos mandan Tab y
    // otros no mandan nada, según cómo estén configurados. Si el código
    // llegó completo y llegó rápido, es un lector — se valida solo, en vez
    // de dejar los diez dígitos ahí esperando a que alguien le dé clic.
    const digitos = valor.replace(/\D/g, "");
    const rafaga = Date.now() - (inicioCaptura.current ?? Date.now()) <= MS_MAX_ESCANEO;
    if (digitos.length === 10 && rafaga) {
      autoEnviado.current = true;
      void validar(digitos, "escaneo");
    }
  }

  const validar = useCallback(
    async (aValidar: string, medio: "escaneo" | "manual") => {
      inicioCaptura.current = null;
      setResultado({ tipo: "validando" });
      try {
        const { data } = await validarValeCallable({ codigo: aValidar, medio });
        setResultado({ tipo: "validado", validacion: data });
        if (data.estado === "ok") {
          setMonto(data.montoAutorizado !== null ? String(data.montoAutorizado) : "");
        }
      } catch (err) {
        setResultado({
          tipo: "error",
          mensaje:
            err instanceof Error
              ? err.message
              : "No se pudo validar el código. Intenta de nuevo.",
        });
      } finally {
        // Devolver el foco al campo es lo que deja la caja lista para el
        // siguiente escaneo con pistola sin tocar nada.
        inputRef.current?.focus();
      }
    },
    [],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // El lector ya disparó la validación al completar los diez dígitos;
    // su Enter llega después y no debe mandar lo mismo otra vez.
    if (autoEnviado.current) return;
    const transcurrido = Date.now() - (inicioCaptura.current ?? Date.now());
    await validar(codigo, transcurrido <= MS_MAX_ESCANEO ? "escaneo" : "manual");
  }

  /** La cámara ya entrega los 10 dígitos limpios: se valida sola, sin pedir otro toque. */
  const handleCodigoEscaneado = useCallback(
    (leido: string) => {
      setCamaraAbierta(false);
      setCodigo(leido);
      void validar(leido, "escaneo");
    },
    [validar],
  );

  async function handleConfirmar(e: React.FormEvent) {
    e.preventDefault();
    setConfirmando(true);
    try {
      const { data } = await confirmarDisposicionCallable({
        codigo,
        montoDispuesto: Number(monto),
      });

      if (data.ok) {
        setResultado({ tipo: "confirmado", monto: data.montoDispuesto, cliente: data.cliente });
        setCodigo("");
        setMonto("");
        onConfirmado?.();
      } else {
        // El vale cambió de estado entre la lectura y la confirmación:
        // venció, o lo consumió la otra caja. Se vuelve a pintar el
        // estado real en vez de dejar la pantalla vieja.
        const { ok: _ok, ...validacion } = data;
        setResultado({ tipo: "validado", validacion: validacion as ValidacionVale });
      }
    } catch (err) {
      setResultado({
        tipo: "error",
        mensaje:
          err instanceof Error
            ? err.message
            : "No se pudo confirmar la disposición. Intenta de nuevo.",
      });
    } finally {
      setConfirmando(false);
    }
  }

  function nuevaBusqueda() {
    setCodigo("");
    setMonto("");
    setResultado({ tipo: "nada" });
    inicioCaptura.current = null;
    autoEnviado.current = false;
    inputRef.current?.focus();
  }

  return (
    <section className="validar">
      <form className="validar-captura" onSubmit={handleSubmit}>
        <label htmlFor="codigo-vale">Escanea o teclea el código del cliente</label>
        <div className="validar-captura__fila">
          <input
            id="codigo-vale"
            ref={inputRef}
            className="validar-captura__input"
            value={codigo}
            onChange={handleChange}
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="00000 00000"
          />
          <button type="submit" disabled={resultado.tipo === "validando" || !codigo}>
            {resultado.tipo === "validando" ? "Validando..." : "Validar"}
          </button>
        </div>
        <div className="validar-captura__medios">
          <button
            type="button"
            className="link-button"
            onClick={() => setCamaraAbierta((v) => !v)}
          >
            {camaraAbierta ? "Cerrar cámara" : "Escanear con la cámara"}
          </button>
          <p className="form-note">
            La pistola de la caja lo teclea sola. Si es de láser no va a leer la
            pantalla del cliente: usa la cámara, o escribe los 10 dígitos.
          </p>
        </div>
      </form>

      {camaraAbierta && (
        <EscanerCamara
          onCodigo={handleCodigoEscaneado}
          onCerrar={() => setCamaraAbierta(false)}
        />
      )}

      {resultado.tipo === "error" && (
        <p className="page-message page-message--error">{resultado.mensaje}</p>
      )}

      {resultado.tipo === "confirmado" && (
        <div className="vale-resultado vale-resultado--ok">
          <p className="vale-resultado__titulo">Disposición confirmada</p>
          <p className="vale-resultado__detalle">
            {moneda.format(resultado.monto)}
            {resultado.cliente ? ` · ${resultado.cliente}` : ""}. El vale ya no
            vuelve a servir.
          </p>
          <button type="button" className="link-button" onClick={nuevaBusqueda}>
            Validar otro código
          </button>
        </div>
      )}

      {resultado.tipo === "validado" && (
        <ResultadoValidacion
          validacion={resultado.validacion}
          dealIdEsperado={dealIdEsperado}
          clienteEsperado={clienteEsperado}
          monto={monto}
          setMonto={setMonto}
          confirmando={confirmando}
          onConfirmar={handleConfirmar}
        />
      )}
    </section>
  );
}

/**
 * Las pantallas de resultado. Las dos rojas frenan la entrega; las dos
 * ámbar son recuperables — esa es la única distinción que el cajero tiene
 * que procesar rápido, y por eso cada una cierra con qué hacer.
 */
function ResultadoValidacion({
  validacion,
  dealIdEsperado,
  clienteEsperado,
  monto,
  setMonto,
  confirmando,
  onConfirmar,
}: {
  validacion: ValidacionVale;
  dealIdEsperado?: string;
  clienteEsperado?: string | null;
  monto: string;
  setMonto: (v: string) => void;
  confirmando: boolean;
  onConfirmar: (e: React.FormEvent) => void;
}) {
  if (validacion.estado === "ok") {
    // Vale legítimo, pero de otra fila. No se bloquea —el vale sirve— pero
    // el cajero tiene que ver que el material que va a entregar es de otro
    // cliente antes de confirmar.
    const otroCliente =
      dealIdEsperado !== undefined && validacion.dealId !== dealIdEsperado;

    return (
      <div className="vale-resultado vale-resultado--ok">
        {otroCliente && (
          <p className="vale-resultado__alerta">
            Este vale no es de {clienteEsperado ?? "el cliente de esta fila"}, es
            de <strong>{validacion.cliente ?? "otro cliente"}</strong>. Revisa
            que estés entregando el material correcto.
          </p>
        )}
        <div className="vale-resultado__chips">
          <span className="vale-chip vale-chip--verde">Código válido</span>
          {validacion.lecturasPrevias > 0 && (
            <span className="vale-chip vale-chip--ambar">
              Ya se leyó {validacion.lecturasPrevias}{" "}
              {validacion.lecturasPrevias === 1 ? "vez" : "veces"}
              {validacion.ultimaLecturaEn
                ? ` · última ${hora(validacion.ultimaLecturaEn)}`
                : ""}
            </span>
          )}
        </div>

        <p className="vale-resultado__etiqueta">Crédito autorizado (MXN)</p>
        <p className="vale-resultado__monto">
          {validacion.montoAutorizado === null
            ? "—"
            : moneda.format(validacion.montoAutorizado)}
        </p>

        <dl className="vale-resultado__datos">
          <div>
            <dt>Cliente</dt>
            <dd>{validacion.cliente ?? "—"}</dd>
          </div>
          <div>
            <dt>Emitido</dt>
            <dd>{hora(validacion.emitidoEn)}</dd>
          </div>
          <div>
            <dt>Vence</dt>
            <dd>{hora(validacion.venceEn)}</dd>
          </div>
        </dl>

        <form className="vale-resultado__confirmar" onSubmit={onConfirmar}>
          <label htmlFor="monto-dispuesto">
            Monto de la venta (puede ser menor al autorizado)
          </label>
          <CurrencyInput id="monto-dispuesto" value={monto} onChange={setMonto} required />
          <button type="submit" disabled={confirmando || !monto}>
            {confirmando ? "Confirmando..." : "Confirmar disposición"}
          </button>
          <p className="form-note">
            Al confirmar, el código queda utilizado, no vuelve a servir, y la
            disposición se escribe de vuelta en HubSpot.
          </p>
        </form>
      </div>
    );
  }

  const tarjetas: Record<
    Exclude<ValidacionVale["estado"], "ok">,
    { tono: "rojo" | "ambar"; titulo: string; cuerpo: string; accion: string[] }
  > = {
    "ya-utilizado": {
      tono: "rojo",
      titulo: "Este vale ya se usó",
      cuerpo:
        validacion.estado === "ya-utilizado"
          ? `Se confirmó una disposición${
              validacion.montoDispuesto !== null
                ? ` de ${moneda.format(validacion.montoDispuesto)}`
                : ""
            } el ${hora(validacion.consumidoEn)}, en esta tienda. Un vale sirve una sola vez.`
          : "",
      accion: [
        "No entregues material.",
        "Si el cliente dice que no fue él, repórtalo a Aviva.",
      ],
    },
    "otra-tienda": {
      tono: "rojo",
      titulo: "Este código no es de tu tienda",
      cuerpo:
        "El crédito de este cliente quedó autorizado para otra tienda. Cuál es, solo lo puede ver Aviva.",
      accion: ["No entregues material.", "El cliente pide a Aviva que lo reasignen."],
    },
    vencido: {
      tono: "ambar",
      titulo: "Este vale ya venció",
      cuerpo:
        validacion.estado === "vencido"
          ? `Venció el ${hora(validacion.venceEn)}.`
          : "",
      accion: [
        "No entregues material.",
        "Aviva reemite uno nuevo y le llega por WhatsApp.",
      ],
    },
    cancelado: {
      tono: "ambar",
      titulo: "Este vale fue reemplazado",
      cuerpo:
        "Aviva emitió uno más reciente para este cliente, y ese es el único que sirve.",
      accion: [
        "No entregues material.",
        "Pídele al cliente el último vale que le llegó.",
      ],
    },
    "no-existe": {
      tono: "ambar",
      titulo: "Revisa los 10 dígitos",
      cuerpo:
        "Puede ser un dígito mal tecleado, o un código de otro producto. Compáralo con el que trae el vale del cliente: 5 dígitos, espacio, 5 dígitos.",
      accion: [
        "Vuelve a escanear, o teclea el número impreso debajo del código de barras.",
      ],
    },
  };

  const tarjeta = tarjetas[validacion.estado];

  return (
    <div className={`vale-resultado vale-resultado--${tarjeta.tono}`}>
      <p className="vale-resultado__titulo">{tarjeta.titulo}</p>
      {tarjeta.cuerpo && <p className="vale-resultado__detalle">{tarjeta.cuerpo}</p>}
      <p className="vale-resultado__etiqueta">Qué hacer</p>
      <ul className="vale-resultado__accion">
        {tarjeta.accion.map((linea) => (
          <li key={linea}>{linea}</li>
        ))}
      </ul>
    </div>
  );
}
