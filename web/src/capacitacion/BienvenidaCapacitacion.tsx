import { useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { LECCIONES, MINUTOS_TOTALES } from "./lecciones";

/**
 * Lo primero que ve alguien la primera vez que entra a Paydesk. Es una
 * invitación y no un muro: "Ahora no" lo deja trabajar, y la pestaña
 * "Aprende" sigue marcando cuántas lecciones le faltan. Se muestra una
 * sola vez por persona (se guarda en el servidor, no en el navegador),
 * así que no reaparece en el celular después de verla en la caja.
 */
export function BienvenidaCapacitacion({ onCerrar }: { onCerrar: () => void }) {
  const navigate = useNavigate();

  function empezar() {
    onCerrar();
    navigate("/solicitudes/aprende/bienvenida");
  }

  return (
    <Modal onClose={onCerrar}>
      <div className="upload-form cap-bienvenida">
        <h2>Te damos la bienvenida a Paydesk</h2>
        <p>
          Antes de empezar, toma la capacitación: {LECCIONES.length} lecciones cortas,
          unos {MINUTOS_TOTALES} minutos. Aprenderás a subir documentos, a validar el
          código de tus clientes en caja y a resolver por tu cuenta las dudas más
          comunes.
        </p>
        <ul className="cap-bienvenida__puntos">
          <li>Practicas cada tarea en simuladores con las pantallas reales, sin tocar clientes reales.</li>
          <li>Puedes dejarla a medias y seguir después donde te quedaste.</li>
          <li>Siempre la encuentras en la pestaña “Aprende”.</li>
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
