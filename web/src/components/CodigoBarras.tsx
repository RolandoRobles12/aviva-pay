import { useMemo } from "react";
import { code128c } from "../lib/code128";

/**
 * El código de barras del vale, dibujado como SVG.
 *
 * SVG y no imagen porque tiene que verse nítido en cualquier pantalla:
 * lo que se escanea es la pantalla del celular del cliente, y un código
 * borroso es un código que la pistola no lee.
 *
 * La zona de silencio (los 10 módulos en blanco de cada lado) no es
 * decorativa: sin ella el lector no encuentra dónde empieza el código.
 */
export function CodigoBarras({
  codigo,
  alto = 96,
  moduloAncho = 3,
}: {
  codigo: string;
  alto?: number;
  moduloAncho?: number;
}) {
  const { barras, ancho } = useMemo(() => {
    const ZONA_SILENCIO = 10;
    const modulos = code128c(codigo);
    const total =
      modulos.reduce((suma, m) => suma + m.ancho, 0) + ZONA_SILENCIO * 2;

    const barras: Array<{ x: number; ancho: number }> = [];
    let x = ZONA_SILENCIO;
    for (const modulo of modulos) {
      if (modulo.barra) barras.push({ x, ancho: modulo.ancho });
      x += modulo.ancho;
    }
    return { barras, ancho: total };
  }, [codigo]);

  return (
    <svg
      className="codigo-barras"
      viewBox={`0 0 ${ancho} ${alto / moduloAncho}`}
      width="100%"
      height={alto}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Código de barras ${codigo}`}
    >
      {barras.map((barra) => (
        <rect
          key={barra.x}
          x={barra.x}
          y={0}
          width={barra.ancho}
          height={alto / moduloAncho}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
