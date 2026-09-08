import { useEffect, useRef, useState } from "react";

/**
 * Escanear con la cámara del celular o la tablet de la tienda.
 *
 * Existe por una razón concreta: **una pistola láser no lee pantallas.**
 * El láser mide luz reflejada de una superficie mate, y la pantalla del
 * cliente emite luz propia y además refleja el ambiente. Las tiendas con
 * pistola láser no tienen por qué cambiar de equipo — usan su teléfono
 * para este paso y siguen usando la pistola para lo suyo.
 *
 * Dos motores, en este orden:
 *
 * 1. `BarcodeDetector`, el decodificador nativo del navegador (Chrome y
 *    Edge en Android y escritorio). Es el más rápido y no descarga nada.
 * 2. ZXing, cargado con `import()` dinámico — Safari en iOS no trae
 *    `BarcodeDetector`. Al ser dinámico, el peso solo se descarga cuando
 *    alguien abre la cámara, no en cada carga de Paydesk.
 *
 * Si los dos fallan, o no hay permiso de cámara, se dice con todas sus
 * letras y queda el tecleo manual, que es la ruta que siempre funciona.
 */
export function EscanerCamara({
  onCodigo,
  onCerrar,
}: {
  onCodigo: (codigo: string) => void;
  onCerrar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [motor, setMotor] = useState<"nativo" | "zxing" | null>(null);

  useEffect(() => {
    let cancelado = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let detener: (() => void) | null = null;

    /** Un resultado solo cuenta si trae los 10 dígitos del vale — así una etiqueta cualquiera del mostrador no dispara nada. */
    function entregar(texto: string) {
      const digitos = texto.replace(/\D/g, "");
      if (digitos.length !== 10 || cancelado) return;
      cancelado = true;
      onCodigo(digitos);
    }

    async function arrancar() {
      const video = videoRef.current;
      if (!video) return;

      // getUserMedia solo existe en contexto seguro. En http:// la
      // propiedad ni siquiera está, y el error del navegador no dice por
      // qué — mejor decirlo aquí.
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "Este navegador no da acceso a la cámara. Teclea los 10 dígitos del vale.",
        );
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch {
        setError(
          "No pudimos abrir la cámara. Dale permiso al navegador, o teclea los 10 dígitos.",
        );
        return;
      }

      if (cancelado) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      video.srcObject = stream;
      await video.play().catch(() => undefined);

      const Detector = (
        window as unknown as {
          BarcodeDetector?: {
            new (opciones: { formats: string[] }): {
              detect: (fuente: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
            };
            getSupportedFormats?: () => Promise<string[]>;
          };
        }
      ).BarcodeDetector;

      const formatos: string[] =
        (await Detector?.getSupportedFormats?.().catch(() => [] as string[])) ?? [];

      if (Detector && formatos.includes("code_128")) {
        setMotor("nativo");
        const detector = new Detector({ formats: ["code_128"] });

        const tick = async () => {
          if (cancelado) return;
          try {
            const codigos = await detector.detect(video);
            if (codigos.length > 0) {
              entregar(codigos[0].rawValue);
              return;
            }
          } catch {
            // Un cuadro que no se pudo analizar no es un fallo del
            // escaneo: se sigue con el siguiente.
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return;
      }

      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelado) return;
        setMotor("zxing");
        const lector = new BrowserMultiFormatReader();
        const controles = lector.decodeFromVideoElement(video, (resultado) => {
          if (resultado) entregar(resultado.getText());
        });
        detener = () => {
          void Promise.resolve(controles).then((c) => c.stop());
        };
      } catch {
        setError(
          "Este navegador no puede leer el código con la cámara. Teclea los 10 dígitos.",
        );
      }
    }

    void arrancar();

    return () => {
      cancelado = true;
      cancelAnimationFrame(raf);
      detener?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCodigo]);

  return (
    <div className="escaner">
      <div className="escaner__marco">
        <video ref={videoRef} className="escaner__video" muted playsInline />
        {/* La guía no recorta nada: solo le dice al cajero dónde apuntar,
            que es la diferencia entre leer a la primera o a la quinta. */}
        <div className="escaner__guia" aria-hidden />
      </div>

      {error ? (
        <p className="page-message page-message--error">{error}</p>
      ) : (
        <p className="form-note">
          Apunta al código de barras del cliente. Si no lee, pídele que suba el
          brillo de su pantalla.
          {motor === "zxing" && " (lector compatible)"}
        </p>
      )}

      <button type="button" className="link-button" onClick={onCerrar}>
        Cerrar cámara
      </button>
    </div>
  );
}
