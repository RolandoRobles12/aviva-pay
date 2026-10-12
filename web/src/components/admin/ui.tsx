import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

/**
 * Piezas comunes del panel de administración. Todas las pantallas se arman
 * con estas, para que se vean y se usen igual: un encabezado que dice qué
 * es la página, tarjetas para cada tema, avisos con el mismo lenguaje y
 * botones con el mismo peso visual. Estilos en styles/admin.css.
 */

export function PageHeader({
  titulo,
  descripcion,
  acciones,
  volver,
}: {
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  volver?: { to: string; label: string };
}) {
  return (
    <header className="adm-page-head">
      <div>
        {volver && (
          <Link to={volver.to} className="adm-page-head__volver">
            ← {volver.label}
          </Link>
        )}
        <h1>{titulo}</h1>
        {descripcion && <p>{descripcion}</p>}
      </div>
      {acciones && <div className="adm-page-head__acciones">{acciones}</div>}
    </header>
  );
}

/** Pestañas para secciones hermanas de un mismo apartado del menú. */
export function Tabs({ items }: { items: { to: string; label: string }[] }) {
  return (
    <nav className="adm-tabs" aria-label="Secciones">
      {items.map((t) => (
        <NavLink key={t.to} to={t.to} end>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Card({
  titulo,
  descripcion,
  acciones,
  pie,
  children,
}: {
  titulo?: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  pie?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="adm-card">
      {(titulo || acciones) && (
        <div className="adm-card__head">
          <div>
            {titulo && <h2>{titulo}</h2>}
            {descripcion && <p>{descripcion}</p>}
          </div>
          {acciones}
        </div>
      )}
      {children}
      {pie && <div className="adm-card__pie">{pie}</div>}
    </section>
  );
}

const ICONO_AVISO = { info: "i", warn: "!", error: "!", ok: "✓" } as const;

export function Notice({
  tono = "info",
  titulo,
  children,
}: {
  tono?: "info" | "warn" | "error" | "ok";
  titulo?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`adm-notice adm-notice--${tono}`} role={tono === "error" ? "alert" : undefined}>
      <span className="adm-notice__icono" aria-hidden>
        {ICONO_AVISO[tono]}
      </span>
      <div className="adm-notice__cuerpo">
        {titulo && <strong>{titulo}</strong>}
        {children && (typeof children === "string" ? <p>{children}</p> : children)}
      </div>
    </div>
  );
}

export function Field({
  label,
  ayuda,
  htmlFor,
  children,
}: {
  label: ReactNode;
  ayuda?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="adm-field">
      <label className="adm-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {ayuda && <span className="adm-field__ayuda">{ayuda}</span>}
    </div>
  );
}

export interface Opcion<T extends string> {
  valor: T;
  titulo: string;
  descripcion?: string;
  etiqueta?: string;
}

/** Elegir una opción entre varias, cada una con lo que significa. */
export function OpcionesTarjeta<T extends string>({
  nombre,
  valor,
  opciones,
  onChange,
}: {
  nombre: string;
  valor: T;
  opciones: Opcion<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="adm-opciones" role="radiogroup">
      {opciones.map((o) => (
        <label key={o.valor} className={`adm-opcion${valor === o.valor ? " adm-opcion--elegida" : ""}`}>
          <input
            type="radio"
            name={nombre}
            checked={valor === o.valor}
            onChange={() => onChange(o.valor)}
          />
          <span>
            <span className="adm-opcion__titulo">
              {o.titulo}
              {o.etiqueta && <Badge tono="neutro">{o.etiqueta}</Badge>}
            </span>
            {o.descripcion && <span className="adm-opcion__desc">{o.descripcion}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="adm-switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export function Badge({
  tono = "neutro",
  children,
  title,
}: {
  tono?: "ok" | "warn" | "error" | "neutro";
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`adm-badge adm-badge--${tono}`} title={title}>
      {children}
    </span>
  );
}

export function EmptyState({
  icono = "✓",
  titulo,
  children,
}: {
  icono?: string;
  titulo: string;
  children?: ReactNode;
}) {
  return (
    <div className="adm-card adm-vacio">
      <span className="adm-vacio__icono" aria-hidden>
        {icono}
      </span>
      <strong>{titulo}</strong>
      {children}
    </div>
  );
}

export function Cargando({ texto = "Cargando..." }: { texto?: string }) {
  return <p className="adm-cargando">{texto}</p>;
}

/** Mensaje corto junto a un botón: "Guardado" o el error. */
export function MensajeInline({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={`adm-inline-msg adm-inline-msg--${ok ? "ok" : "error"}`} role="status">
      {children}
    </span>
  );
}

/** Detalles técnicos plegados: para quien los necesita, sin estorbar al resto. */
export function Detalles({ resumen = "Detalles técnicos", children }: { resumen?: string; children: ReactNode }) {
  return (
    <details className="adm-detalles">
      <summary>{resumen}</summary>
      {children}
    </details>
  );
}

/**
 * Barra fija abajo que aparece en cuanto hay cambios sin guardar: deja
 * claro que falta guardar y ofrece descartar. Si el último intento falló
 * o salió bien, lo dice ahí mismo.
 */
export function BarraGuardar({
  hayCambios,
  guardando,
  mensaje,
  onGuardar,
  onDescartar,
}: {
  hayCambios: boolean;
  guardando: boolean;
  mensaje?: { ok: boolean; texto: string } | null;
  onGuardar: () => void;
  onDescartar?: () => void;
}) {
  if (!hayCambios && !mensaje) return null;
  return (
    <div className={`adm-barra-guardar${hayCambios ? " adm-barra-guardar--cambios" : ""}`} role="region" aria-label="Guardar cambios">
      <span className="adm-barra-guardar__texto">
        {hayCambios ? "Tienes cambios sin guardar." : mensaje && <MensajeInline ok={mensaje.ok}>{mensaje.texto}</MensajeInline>}
        {hayCambios && mensaje && !mensaje.ok && <> <MensajeInline ok={false}>{mensaje.texto}</MensajeInline></>}
      </span>
      {hayCambios && (
        <span className="adm-page-head__acciones">
          {onDescartar && (
            <button type="button" className="adm-btn adm-btn--secundario" onClick={onDescartar} disabled={guardando}>
              Descartar
            </button>
          )}
          <button type="button" className="adm-btn adm-btn--primario" onClick={onGuardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </span>
      )}
    </div>
  );
}
