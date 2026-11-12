import { useEffect, useRef, useState } from "react";
import { ResultadoValidacion } from "../components/ValidarCodigoPanel";
import { limpiarCodigoTecleado } from "../lib/codigoVale";
import type { ValidacionVale } from "../types/vale";
import {
  CODIGOS_PRACTICA,
  errorMontoPractica,
  formatearCodigo,
  validarPractica,
} from "./simulador";

const moneda = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

type Estado =
  | { tipo: "nada" }
  | { tipo: "incompleto" }
  | { tipo: "validado"; validacion: ValidacionVale }
  | { tipo: "confirmado"; monto: number; cliente: string | null };

/**
 * La caja, en modo práctica. Pinta las mismas pantallas de resultado que
 * la caja real (ResultadoValidacion), pero nunca llama al servidor: los
 * códigos y las respuestas salen de simulador.ts. Así la tienda ve cada
 * caso —el verde, los rojos que frenan la entrega, los ámbar que se
 * arreglan— antes de encontrárselo con un cliente enfrente.
 */
export function SimuladorCaja({ onCompletado }: { onCompletado?: () => void } = {}) {
  const [codigo, setCodigo] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "nada" });
  const [monto, setMonto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [probados, setProbados] = useState<Set<string>>(new Set());
  const [confirmoVenta, setConfirmoVenta] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const avisado = useRef(false);

  // Se da por practicado cuando vio cada pantalla y cerró al menos una venta.
  const completo = probados.size === CODIGOS_PRACTICA.length && confirmoVenta;
  useEffect(() => {
    if (completo && !avisado.current) {
      avisado.current = true;
      onCompletado?.();
    }
  }, [completo, onCompletado]);

  function validar(entrada: string) {
    setError(null);
    const resultado = validarPractica(entrada);
    if (!resultado) {
      setEstado({ tipo: "incompleto" });
      return;
    }
    const limpio = entrada.replace(/\D/g, "");
    setProbados((p) => new Set(p).add(limpio));
    setEstado({ tipo: "validado", validacion: resultado });
    setMonto(
      resultado.estado === "ok" && resultado.montoAutorizado !== null
        ? String(resultado.montoAutorizado)
        : "",
    );
  }

  function usarCodigo(c: string) {
    setCodigo(formatearCodigo(c));
    validar(c);
  }

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (estado.tipo !== "validado" || estado.validacion.estado !== "ok") return;
    const err = errorMontoPractica(Number(monto), estado.validacion.montoAutorizado);
    if (err) {
      setError(err);
      return;
    }
    setConfirmoVenta(true);
    setEstado({ tipo: "confirmado", monto: Number(monto), cliente: estado.validacion.cliente });
  }

  function otraVez() {
    setCodigo("");
    setMonto("");
    setError(null);
    setEstado({ tipo: "nada" });
    inputRef.current?.focus();
  }

  return (
    <div className="cap-simulador">
      <div className="cap-simulador__banda">
        Modo práctica · Nada de lo que hagas aquí afecta a clientes reales
      </div>

      <div className="cap-simulador__cuerpo">
        <div className="cap-simulador__misiones">
          <p className="cap-simulador__titulo">Prueba cada caso</p>
          <p className="form-note">
            Toca un código o tecléalo en la caja. Mira qué te dice la pantalla y
            qué te pide hacer.
          </p>
          <ul>
            {CODIGOS_PRACTICA.map((c) => (
              <li key={c.codigo}>
                <button
                  type="button"
                  className={`cap-mision${probados.has(c.codigo) ? " cap-mision--hecha" : ""}`}
                  onClick={() => usarCodigo(c.codigo)}
                >
                  <span className="cap-mision__check" aria-hidden>
                    {probados.has(c.codigo) ? "✓" : ""}
                  </span>
                  <span>
                    <span className="cap-mision__codigo">{formatearCodigo(c.codigo)}</span>
                    <span className="cap-mision__texto">{c.practica}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="form-note">
            {probados.size} de {CODIGOS_PRACTICA.length} casos probados
            {confirmoVenta ? " · venta confirmada ✓" : " · falta confirmar una venta"}
          </p>
        </div>

        <section className="validar cap-simulador__caja">
          <form
            className="validar-captura"
            onSubmit={(e) => {
              e.preventDefault();
              validar(codigo);
            }}
          >
            <label htmlFor="codigo-practica">Escanea o teclea el código del cliente</label>
            <div className="validar-captura__fila">
              <input
                id="codigo-practica"
                ref={inputRef}
                className="validar-captura__input"
                value={codigo}
                onChange={(e) => {
                  setCodigo(limpiarCodigoTecleado(e.target.value));
                  if (estado.tipo !== "nada") setEstado({ tipo: "nada" });
                }}
                inputMode="numeric"
                pattern="[0-9 ]*"
                maxLength={11}
                autoComplete="off"
                placeholder="00000 00000"
              />
              <button type="submit" className="boton-caja" disabled={!codigo}>
                Validar
              </button>
            </div>
          </form>

          {estado.tipo === "incompleto" && (
            <p className="page-message page-message--error">
              El código tiene 10 dígitos: 5, un espacio y otros 5.
            </p>
          )}

          {estado.tipo === "validado" && (
            <>
              <ResultadoValidacion
                validacion={estado.validacion}
                monto={monto}
                setMonto={(v) => {
                  setMonto(v);
                  setError(null);
                }}
                confirmando={false}
                onConfirmar={confirmar}
              />
              {error && <p className="form-error cap-simulador__error">{error}</p>}
            </>
          )}

          {estado.tipo === "confirmado" && (
            <div className="vale-resultado vale-resultado--ok">
              <p className="vale-resultado__titulo">Disposición confirmada</p>
              <p className="vale-resultado__detalle">
                {moneda.format(estado.monto)}
                {estado.cliente ? ` · ${estado.cliente}` : ""}. El vale ya no vuelve a
                servir.
              </p>
              <p className="form-note">
                En la caja real, en este momento el código queda utilizado y se
                registra la disposición. Ahora sí, entrega el material.
              </p>
              <button type="button" className="link-button" onClick={otraVez}>
                Validar otro código
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
