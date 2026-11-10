import { Link } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { CURSO_TIENDA, CURSO_VENDEDOR, type Curso } from "../capacitacion/cursos";
import "../styles/capacitacion.css";

interface Perfil {
  curso: Curso;
  titulo: string;
  quien: string;
  puedes: string[];
  noTeToca?: string;
  guia: string;
}

/**
 * Paydesk tiene dos perfiles y cada uno su guía. Esto es lo que abre
 * "¿Primera vez? Conoce cómo funciona Paydesk" en el login: antes llevaba
 * directo al curso del personal de tienda, y un vendedor terminaba en
 * lecciones de documentos y caja que no le tocan.
 *
 * Los textos tienen que decir lo mismo que el panel y las guías: qué hace
 * cada perfil, no cómo se configura.
 */
const PERFILES: Perfil[] = [
  {
    curso: CURSO_TIENDA,
    titulo: "Personal de la tienda",
    quien: "Atiendes la caja y haces el trabajo administrativo de los créditos.",
    puedes: [
      "Ves a tus clientes y en qué etapa va cada crédito.",
      "Subes la cotización y el comprobante de entrega firmado.",
      "Validas el código del cliente y confirmas la venta en caja.",
    ],
    guia: "/ayuda",
  },
  {
    curso: CURSO_VENDEDOR,
    titulo: "Vendedor",
    quien: "Vendes y das seguimiento a tus clientes, sin trabajo administrativo.",
    puedes: [
      "Ves a los clientes aprobados de tu tienda y su monto aprobado.",
      "Sabes en qué etapa va cada uno y qué seguimiento darle.",
    ],
    noTeToca: "Los documentos y la caja los maneja el personal de la tienda.",
    guia: "/ayuda/vendedores",
  },
];

export function ConocePage() {
  return (
    <main className="app-shell">
      <header className="app-bar">
        <BrandMark />
        <div className="header-right">
          <Link to="/" className="link-button">
            Entrar a Paydesk
          </Link>
        </div>
      </header>
      <div className="app-body cap">
        <section className="conoce">
          <h1>¿Cómo vas a usar Paydesk?</h1>
          <p className="conoce__intro">
            Paydesk tiene dos perfiles, y cada uno tiene su guía. Elige el tuyo.
          </p>

          <div className="conoce__perfiles">
            {PERFILES.map((p) => (
              <Link key={p.guia} to={p.guia} className="conoce__perfil">
                <strong className="conoce__titulo">{p.titulo}</strong>
                <span className="conoce__quien">{p.quien}</span>
                <ul className="cap-checklist">
                  {p.puedes.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                {p.noTeToca && <span className="conoce__nota">{p.noTeToca}</span>}
                <span className="cap-boton conoce__cta">
                  Ver la guía · {p.curso.lecciones.length} lecciones, {p.curso.minutos} min →
                </span>
              </Link>
            ))}
          </div>

          <p className="conoce__pie">
            ¿No sabes cuál es tu perfil? Te lo dice tu ejecutivo de Aviva cuando invita
            tu correo.
          </p>
        </section>
      </div>
    </main>
  );
}
