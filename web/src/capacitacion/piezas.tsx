import type { ReactNode } from "react";

/**
 * Piezas de las lecciones. Los ejemplos de pantalla usan las mismas clases
 * que la app real (cell-done, upload-button, vale-chip…), así que lo que la
 * tienda aprende aquí se ve exactamente igual cuando lo encuentra en su
 * lista. Estilos en styles/capacitacion.css.
 */

export function Seccion({
  titulo,
  id,
  children,
}: {
  titulo: string;
  /** Para ligar directo a la sección, p. ej. /ayuda/validar-codigo#simulador. */
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className="cap-seccion" id={id}>
      <h2>{titulo}</h2>
      {children}
    </section>
  );
}

/** Pasos numerados. Cada uno es una acción concreta, en el orden en que se hace. */
export function Pasos({ children }: { children: ReactNode }) {
  return <ol className="cap-pasos">{children}</ol>;
}

export function Paso({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <li>
      <strong>{titulo}</strong>
      {children && <div className="cap-pasos__detalle">{children}</div>}
    </li>
  );
}

/** Lo que no se puede olvidar. Ámbar, como el resto de los avisos de la app. */
export function Importante({ titulo = "Importante", children }: { titulo?: string; children: ReactNode }) {
  return (
    <div className="cap-aviso cap-aviso--importante" role="note">
      <strong>{titulo}</strong>
      <div>{children}</div>
    </div>
  );
}

export function Consejo({ children }: { children: ReactNode }) {
  return (
    <div className="cap-aviso cap-aviso--consejo" role="note">
      <strong>Consejo</strong>
      <div>{children}</div>
    </div>
  );
}

/** Un recorte de pantalla dibujado con los componentes reales. */
export function Ejemplo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <figure className="cap-ejemplo">
      <figcaption>Así se ve: {titulo}</figcaption>
      <div className="cap-ejemplo__marco">{children}</div>
    </figure>
  );
}

/** Lo que aparece en pantalla → qué significa → qué haces. */
export function TablaSignificados({
  filas,
  columnas = ["Lo que ves", "Qué significa", "Qué haces"],
}: {
  filas: Array<[ReactNode, ReactNode, ReactNode]>;
  columnas?: [string, string, string];
}) {
  return (
    <div className="cap-tabla-wrap">
      <table className="cap-tabla">
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              <td>{f[0]}</td>
              <td>{f[1]}</td>
              <td>{f[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Píldoras de estado idénticas a las de la tabla de clientes. */
export function Listo({ fecha = "12 de noviembre de 2026" }: { fecha?: string }) {
  return (
    <span className="cell-done">
      <span className="cell-done__check" aria-hidden>
        ✓
      </span>
      {fecha}
    </span>
  );
}

export function Pendiente() {
  return <span className="cell-pending">Pendiente</span>;
}

export function BotonSubir({ children }: { children: ReactNode }) {
  return (
    <span className="upload-button cap-falso" aria-hidden>
      <span>↑</span> {children}
    </span>
  );
}

export function EnRevision() {
  return <span className="cell-review">En revisión</span>;
}

export function Rechazado() {
  return (
    <span className="cell-rejected">
      Hubo un problema con el documento. Vuelve a subirlo.
    </span>
  );
}

export function Avance({ hechas, total = 7 }: { hechas: number; total?: number }) {
  return (
    <div className="progress">
      <div className="progress__track" role="img" aria-label={`${hechas} de ${total} etapas completadas`}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`progress__seg${i < hechas ? " progress__seg--on" : ""}${
              hechas === total ? " progress__seg--complete" : ""
            }`}
          />
        ))}
      </div>
      <span className="progress__count">
        {hechas}/{total}
      </span>
    </div>
  );
}
