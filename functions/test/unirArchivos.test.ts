import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { ArchivosInvalidosError, formatoDe, MAX_ARCHIVOS, unirArchivos } from "../src/http/unirArchivos";

// 1×1 px, lo mínimo para que pdf-lib los incruste.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function pdfDe(paginas: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage([200, 300]);
  return Buffer.from(await doc.save());
}

describe("unirArchivos", () => {
  it("un solo archivo pasa intacto", async () => {
    const solo = { fileName: "a.png", mimeType: "image/png", buffer: PNG };
    expect(await unirArchivos([solo])).toBe(solo);
  });

  it("une fotos y PDFs en un PDF, en orden, una página por foto", async () => {
    const r = await unirArchivos([
      { fileName: "frente.png", mimeType: "image/png", buffer: PNG },
      { fileName: "hojas.pdf", mimeType: "application/pdf", buffer: await pdfDe(2) },
      { fileName: "reverso.png", mimeType: "image/png", buffer: PNG },
    ]);
    expect(r.mimeType).toBe("application/pdf");
    expect(r.fileName).toBe("frente-y-2-mas.pdf");
    const doc = await PDFDocument.load(r.buffer);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getPage(1).getSize()).toEqual({ width: 200, height: 300 });
  });

  it("reconoce el formato por los bytes, no por el nombre", () => {
    expect(formatoDe({ fileName: "foto.jpg", mimeType: "image/jpeg", buffer: PNG })).toBe("png");
  });

  it("no mezcla una factura XML con otros archivos", async () => {
    const xml = { fileName: "f.xml", mimeType: "text/xml", buffer: Buffer.from("<cfdi/>") };
    await expect(
      unirArchivos([xml, { fileName: "a.png", mimeType: "image/png", buffer: PNG }]),
    ).rejects.toBeInstanceOf(ArchivosInvalidosError);
  });

  it("rechaza formatos que no se pueden unir, archivos dañados y de más", async () => {
    const png = { fileName: "a.png", mimeType: "image/png", buffer: PNG };
    await expect(
      unirArchivos([png, { fileName: "b.webp", mimeType: "image/webp", buffer: Buffer.from("RIFF0000WEBP") }]),
    ).rejects.toThrow(/no es PDF, JPG ni PNG/);
    await expect(
      unirArchivos([png, { fileName: "roto.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-roto") }]),
    ).rejects.toThrow(/No se pudo leer "roto.pdf"/);
    await expect(unirArchivos(Array(MAX_ARCHIVOS + 1).fill(png))).rejects.toThrow(/máximo/);
  });
});
