import { useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";

/**
 * Lo primero que ve alguien la primera vez que entra a Paydesk. Es una
 * invitación y no un muro: "Ahora no" lo deja trabajar, y la pestaña
 * "Aprende" sigue marcando cuántas lecciones le faltan. Se muestra una
 * sola vez por persona (se guarda en el servidor, no en el navegador),
 * así que no reaparece en el celular después de verla en la caja.
 *
 * Sirve a los dos cursos: cada perfil le pasa su primera lección y qué va
 * a aprender.
 */
export function BienvenidaCapacitacion({
  onCerrar,
  primeraLeccion,
  lecciones,
  minutos,
  aprenderas,
  puntos,
}: {
  onCerrar: () => void;
  /** Ruta de la primera lección del curso. */
  primeraLeccion: string;
  lecciones: number;
  minutos: number;
  /** "Aprenderás a …", sin el arranque. */
  aprenderas: string;
  puntos: string[];
}) {
  const navigate = useNavigate();

  function empezar() {
    onCerrar();
    navigate(primeraLeccion);
  }

  return (
    <Modal onClose={onCerrar}>
      <div className="upload-form cap-bienvenida">
        <h2>Te damos la bienvenida a Paydesk</h2>
        <p>
          Antes de empezar, toma la capacitación: {lecciones} lecciones cortas, unos{" "}
          {minutos} minutos. Aprenderás {aprenderas}
        </p>
        <ul className="cap-bienvenida__puntos">
          {puntos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <div className="upload-form__actions">
          <button type="button" className="button-secondary" onClick={onCerrar}>
            Ahora no
          </button>
          <button type="button" onClick={empezar}>
            Empezar capacitación
          </button>
        </div>
      </div>
    </Modal>
  );
}
