/**
 * Calibración de la verificación de documentos con documentos reales.
 *
 * Corre la misma verificación que producción (ocr/analizar.ts + las reglas
 * de ocr/validate.ts) sobre una carpeta de documentos que ya sabes si son
 * buenos o no, y te dice en cuántos acierta. Sirve para ajustar las reglas
 * —o decidir entre Sonnet y Haiku— con datos y no a ojo.
 *
 * Uso (desde functions/):
 *
 *   ANTHROPIC_API_KEY=... npx tsx scripts/calibrar.ts <carpeta> [sonnet|haiku]
 *
 * La carpeta lleva los archivos y un `esperado.csv` con encabezado:
 *
 *   archivo,tipo,esperado,monto,fecha,cliente
 *   cot-001.pdf,cotizacion,aceptar,11600,,Juan Pérez López
 *   comp-007.jpg,comprobante,revision,,2025-03-12,Ana Ruiz
 *   selfie.jpg,cotizacion,rechazar,5000,,Ana Ruiz
 *
 * `esperado` es lo que debería pasar: aceptar, revision o rechazar. Deja
 * vacíos monto/fecha si no aplican. Escribe `resultados.csv` en la misma
 * carpeta, con lo que leyó Claude y los motivos de cada documento.
 *
 * Cada documento es una llamada real a la API (cuesta centavos). Los
 * documentos traen datos de clientes: córrelo en un equipo de Aviva y no
 * subas la carpeta al repositorio.
 */
import { readFileSync, writeFileSync } from "fs";
import { extname, join } from "path";
import { analizarDocumento } from "../src/ocr/analizar";
import { validarAnalisis, type DocumentoTipo } from "../src/ocr/validate";
import type { ModeloOcr } from "../src/firestore/ocrConfigRepository";

type Esperado = "aceptar" | "revision" | "rechazar";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xml": "application/xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function leerCsv(ruta: string): Record<string, string>[] {
  const [encabezado, ...filas] = readFileSync(ruta, "utf8").trim().split(/\r?\n/);
  const cols = encabezado.split(",").map((c) => c.trim());
  return filas
    .filter((f) => f.trim())
    .map((f) => {
      const v = f.split(",");
      return Object.fromEntries(cols.map((c, i) => [c, (v[i] ?? "").trim()]));
    });
}

const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

async function main() {
  const [carpeta, modeloArg] = process.argv.slice(2);
  if (!carpeta) {
    console.error("Uso: npx tsx scripts/calibrar.ts <carpeta> [sonnet|haiku]");
    process.exit(1);
  }
  const modelo: ModeloOcr = modeloArg === "haiku" ? "haiku" : "sonnet";
  const casos = leerCsv(join(carpeta, "esperado.csv"));
  const salida: string[] = [
    "archivo,tipo,esperado,obtenido,acierto,motivos,tipo_detectado,total_leido,cliente_leido,fechas_leidas,firma,alteraciones",
  ];
  const matriz: Record<string, Record<string, number>> = {};
  let aciertos = 0;

  for (const c of casos) {
    const tipo = c.tipo as DocumentoTipo;
    const esperado = c.esperado as Esperado;
    const buffer = readFileSync(join(carpeta, c.archivo));
    let obtenido: Esperado | "error";
    let motivos = "";
    let datos: Awaited<ReturnType<typeof analizarDocumento>> | null = null;
    try {
      datos = await analizarDocumento(
        tipo,
        { fileName: c.archivo, buffer, mimeType: MIME[extname(c.archivo).toLowerCase()] },
        modelo,
      );
      const r = validarAnalisis({
        tipo,
        analisis: datos,
        cliente: c.cliente || null,
        montoDeclarado: c.monto ? Number(c.monto) : null,
        fechaDeclarada: c.fecha || null,
      });
      obtenido = r.estado === "aprobado" ? "aceptar" : r.estado === "revisar" ? "revision" : "rechazar";
      motivos = r.reglas.filter((x) => !x.ok).map((x) => x.detalle).join(" | ");
    } catch (err) {
      // En producción un fallo del análisis manda el documento a revisión.
      obtenido = "error";
      motivos = err instanceof Error ? err.message : String(err);
    }
    const acierto = obtenido === esperado || (obtenido === "error" && esperado === "revision");
    if (acierto) aciertos++;
    matriz[esperado] ??= {};
    matriz[esperado][obtenido] = (matriz[esperado][obtenido] ?? 0) + 1;
    console.log(`${acierto ? "✓" : "✗"} ${c.archivo}: esperado ${esperado}, obtenido ${obtenido}${motivos ? ` — ${motivos}` : ""}`);
    salida.push(
      [
        c.archivo, tipo, esperado, obtenido, acierto ? "si" : "no", motivos,
        datos?.tipoDetectado, datos?.montoTotal, datos?.nombreCliente,
        datos?.fechas.join(" "), datos?.tieneFirma, datos?.senalesAlteracion.join("; "),
      ].map(csv).join(","),
    );
  }

  writeFileSync(join(carpeta, "resultados.csv"), salida.join("\n"));
  console.log(`\nModelo: ${modelo}. Aciertos: ${aciertos}/${casos.length}`);
  console.log("Esperado → obtenido:");
  for (const [e, fila] of Object.entries(matriz)) {
    console.log(`  ${e.padEnd(9)} ${Object.entries(fila).map(([o, n]) => `${o}: ${n}`).join(", ")}`);
  }
  console.log(`\nDetalle en ${join(carpeta, "resultados.csv")}`);
  // Lo más grave: un documento que debía rechazarse o revisarse y se aceptó solo.
  const colados = (matriz.rechazar?.aceptar ?? 0) + (matriz.revision?.aceptar ?? 0);
  if (colados > 0) console.log(`⚠ ${colados} documentos se habrían aceptado sin revisión.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
