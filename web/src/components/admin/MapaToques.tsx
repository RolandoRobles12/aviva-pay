import { useEffect, useRef, useState } from "react";
import {
  adminUsoMapaCallable,
  type DispositivoUso,
  type FiltroUso,
  type MapaUso,
} from "../../lib/firebase";
import { cargarPedazos, cargarRrweb } from "../../lib/reproductor";
import { Cargando, Notice } from "./ui";

const DISPOSITIVOS: { valor: DispositivoUso; label: string }[] = [
  { valor: "escritorio", label: "Computadora" },
  { valor: "tablet", label: "Tablet" },
  { valor: "celular", label: "Celular" },
];

/** Un solo tono (más intenso = más toques), sobre la pantalla real. */
const TONO: [number, number, number] = [217, 72, 15];
const RADIO = 22;

function pintarCalor(
  canvas: HTMLCanvasElement,
  puntos: { x: number; y: number }[],
  escala: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  // Primero la intensidad en un lienzo aparte (solo alfa), luego el color.
  const capa = document.createElement("canvas");
  capa.width = width;
  capa.height = height;
  const c = capa.getContext("2d")!;
  const r = RADIO * Math.max(0.6, escala);
  for (const p of puntos) {
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, "rgba(0,0,0,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
  const img = c.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    d[i] = TONO[0];
    d[i + 1] = TONO[1];
    d[i + 2] = TONO[2];
    d[i + 3] = a > 0 ? Math.round(Math.min(0.85, 0.2 + a * 1.4) * 255) : 0;
  }
  ctx.clearRect(0, 0, width, height);
  ctx.putImageData(img, 0, 0);
}

/**
 * Mapa de toques de una pantalla. El fondo es la pantalla real, tomada de
 * la foto completa con la que empieza un pedazo de grabación de esa misma
 * pantalla y tipo de equipo (con los textos privados ya tapados). Si
 * todavía no hay ninguna grabación así, los toques se pintan sobre un
 * lienzo gris del ancho de la pantalla.
 */
export function MapaToques({
  filtro,
  pantallas,
  pantallaInicial,
}: {
  filtro: FiltroUso;
  pantallas: string[];
  pantallaInicial?: string;
}) {
  const [pantalla, setPantalla] = useState(pantallaInicial ?? pantallas[0] ?? "");
  const [dispositivo, setDispositivo] = useState<DispositivoUso>("escritorio");
  const [soloFrustracion, setSoloFrustracion] = useState(false);
  const [mapa, setMapa] = useState<MapaUso | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const fondoRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sinFondo, setSinFondo] = useState(false);

  useEffect(() => {
    if (pantallaInicial) setPantalla(pantallaInicial);
  }, [pantallaInicial]);

  useEffect(() => {
    if (!pantalla) return;
    let cancelado = false;
    setCargando(true);
    setError(null);
    adminUsoMapaCallable({ ...filtro, pantalla, dispositivo })
      .then((r) => !cancelado && setMapa(r.data))
      .catch((e) => !cancelado && setError(e instanceof Error ? e.message : "No se pudo cargar el mapa."))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [filtro, pantalla, dispositivo]);

  useEffect(() => {
    const cont = contenedor.current;
    const fondo = fondoRef.current;
    const canvas = canvasRef.current;
    if (!mapa || !cont || !fondo || !canvas) return;
    let cancelado = false;
    let destruir: (() => void) | undefined;
    fondo.innerHTML = "";
    const puntos = mapa.puntos.filter((p) => !soloFrustracion || p.f);

    (async () => {
      const anchoVista = cont.clientWidth;
      let ancho = Math.round(median(mapa.puntos.map((p) => p.w))) || 1280;
      let alto = Math.max(600, ...mapa.puntos.map((p) => p.y + 80));

      if (mapa.fondo) {
        try {
          const [{ eventos, fragmentos }, { Replayer }] = await Promise.all([
            cargarPedazos(mapa.fondo.sesionId, [mapa.fondo.n]),
            cargarRrweb(),
          ]);
          if (cancelado) return;
          if (eventos.length > 0) {
            ancho = fragmentos[0]?.ancho ?? ancho;
            const replayer = new Replayer(eventos as never, {
              root: fondo,
              mouseTail: false,
              showWarning: false,
              triggerFocus: false,
            });
            destruir = () => replayer.destroy();
            replayer.pause(0);
            // Las hojas de estilo del fondo tardan un momento en aplicarse.
            await new Promise((r) => setTimeout(r, 400));
            if (cancelado) return;
            const doc = replayer.iframe.contentDocument;
            alto = Math.max(alto, doc?.documentElement.scrollHeight ?? 0, fragmentos[0]?.alto ?? 0);
            replayer.iframe.style.width = `${ancho}px`;
            replayer.iframe.style.height = `${alto}px`;
            replayer.iframe.setAttribute("width", String(ancho));
            replayer.iframe.setAttribute("height", String(alto));
            replayer.wrapper.style.width = `${ancho}px`;
            replayer.wrapper.style.height = `${alto}px`;
            setSinFondo(false);
          } else setSinFondo(true);
        } catch {
          setSinFondo(true);
        }
      } else setSinFondo(true);

      if (cancelado) return;
      const escala = anchoVista / ancho;
      fondo.style.width = `${ancho}px`;
      fondo.style.height = `${alto}px`;
      fondo.style.transform = `scale(${escala})`;
      cont.style.height = `${alto * escala}px`;
      canvas.width = anchoVista;
      canvas.height = Math.round(alto * escala);
      pintarCalor(
        canvas,
        puntos.map((p) => ({ x: (p.x / p.w) * ancho * escala, y: p.y * escala })),
        escala,
      );
    })();

    return () => {
      cancelado = true;
      destruir?.();
    };
  }, [mapa, soloFrustracion]);

  return (
    <div className="uso-mapa">
      <div className="uso-filtros">
        <select aria-label="Pantalla" value={pantalla} onChange={(e) => setPantalla(e.target.value)}>
          {pantallas.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          aria-label="Equipo"
          value={dispositivo}
          onChange={(e) => setDispositivo(e.target.value as DispositivoUso)}
        >
          {DISPOSITIVOS.map((d) => (
            <option key={d.valor} value={d.valor}>
              {d.label}
            </option>
          ))}
        </select>
        <label className="uso-filtros__check">
          <input type="checkbox" checked={soloFrustracion} onChange={(e) => setSoloFrustracion(e.target.checked)} />
          Solo toques de frustración
        </label>
      </div>
      {error && <Notice tono="error">{error}</Notice>}
      {cargando && <Cargando texto="Armando el mapa..." />}
      {mapa && !cargando && (
        <p className="adm-field__ayuda">
          {mapa.puntos.length.toLocaleString("es-MX")} toques en {pantalla} ({DISPOSITIVOS.find((d) => d.valor === dispositivo)?.label.toLowerCase()}).
          Más intenso = más toques.
          {sinFondo && " Todavía no hay una grabación de esta pantalla en este equipo para usarla de fondo."}
        </p>
      )}
      <div className="uso-mapa__lienzo" ref={contenedor} hidden={!mapa || mapa.puntos.length === 0}>
        <div className="uso-mapa__fondo" ref={fondoRef} />
        <canvas className="uso-mapa__calor" ref={canvasRef} />
      </div>
    </div>
  );
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
