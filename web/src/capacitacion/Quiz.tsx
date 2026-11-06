import { useState } from "react";
import { quizAprobado } from "./progreso";

export interface Opcion {
  texto: string;
  correcta?: boolean;
  /** Por qué sí o por qué no. Se enseña al elegirla, también en las incorrectas. */
  explicacion: string;
}

export interface Pregunta {
  id: string;
  /** Un caso del mostrador, no una definición: "Llega un cliente y…". */
  enunciado: string;
  opciones: Opcion[];
}

/**
 * "Comprueba lo que aprendiste": casos reales del mostrador, uno por
 * pregunta. Cada opción explica por qué es o no es lo correcto — elegir
 * mal también enseña — y se puede volver a intentar sin castigo. La
 * lección se da por pasada cuando todas tienen la respuesta correcta.
 */
export function Quiz({
  preguntas,
  aprobadaAntes,
  onAprobado,
}: {
  preguntas: Pregunta[];
  /** Ya la había pasado: se muestra igual para repasar, sin volver a pedirla. */
  aprobadaAntes: boolean;
  onAprobado: () => void;
}) {
  const [respuestas, setRespuestas] = useState<Record<string, number | undefined>>({});

  const correctas = Object.fromEntries(
    preguntas.map((p) => [p.id, p.opciones.findIndex((o) => o.correcta)]),
  );

  function responder(preguntaId: string, opcion: number) {
    const nuevas = { ...respuestas, [preguntaId]: opcion };
    setRespuestas(nuevas);
    if (quizAprobado(correctas, nuevas) && !quizAprobado(correctas, respuestas)) {
      onAprobado();
    }
  }

  const bien = preguntas.filter((p) => respuestas[p.id] === correctas[p.id]).length;

  return (
    <div className="cap-quiz">
      <p className="cap-quiz__intro">
        {aprobadaAntes
          ? "Ya pasaste esta lección. Puedes repasar las preguntas cuando quieras."
          : `Contesta ${preguntas.length === 1 ? "la pregunta" : `las ${preguntas.length} preguntas`} para completar la lección. Si te equivocas, lee la explicación y vuelve a intentarlo.`}
      </p>
      {preguntas.map((p, n) => {
        const elegida = respuestas[p.id];
        return (
          <fieldset key={p.id} className="cap-pregunta">
            <legend>
              <span className="cap-pregunta__num">{n + 1}</span>
              {p.enunciado}
            </legend>
            <div className="cap-pregunta__opciones">
              {p.opciones.map((o, i) => {
                const marcada = elegida === i;
                const clase = marcada
                  ? o.correcta
                    ? " cap-opcion--bien"
                    : " cap-opcion--mal"
                  : "";
                return (
                  <label key={i} className={`cap-opcion${clase}`}>
                    <input
                      type="radio"
                      name={`pregunta-${p.id}`}
                      checked={marcada}
                      onChange={() => responder(p.id, i)}
                    />
                    <span className="cap-opcion__texto">{o.texto}</span>
                    {marcada && (
                      <span className="cap-opcion__explicacion" role="status">
                        <strong>{o.correcta ? "Correcto. " : "No exactamente. "}</strong>
                        {o.explicacion}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <p className="cap-quiz__marcador" aria-live="polite">
        {bien} de {preguntas.length} correctas
      </p>
    </div>
  );
}
