import { describe, expect, it } from "vitest";
import { dimensionesObjetivo, esHeic, esImagenReducible, nombreJpg } from "../src/lib/imagenes";
import { llavesCambiadas } from "../src/lib/bitacora";

describe("preparación de fotos", () => {
  it("reconoce HEIC por tipo o por extensión", () => {
    expect(esHeic({ name: "IMG_1.HEIC", type: "" })).toBe(true);
    expect(esHeic({ name: "x", type: "image/heif" })).toBe(true);
    expect(esHeic({ name: "x.jpg", type: "image/jpeg" })).toBe(false);
  });
  it("no toca PDF ni XML", () => {
    expect(esImagenReducible({ type: "application/pdf" })).toBe(false);
    expect(esImagenReducible({ type: "image/png" })).toBe(true);
  });
  it("reduce al lado máximo conservando proporción y nunca agranda", () => {
    expect(dimensionesObjetivo(4800, 3600)).toEqual({ ancho: 2400, alto: 1800 });
    expect(dimensionesObjetivo(3000, 6000)).toEqual({ ancho: 1200, alto: 2400 });
    expect(dimensionesObjetivo(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });
  it("cambia la extensión a .jpg", () => {
    expect(nombreJpg("IMG_0001.HEIC")).toBe("IMG_0001.jpg");
  });
});

describe("bitácora", () => {
  it("solo marca las llaves que cambiaron", () => {
    expect(llavesCambiadas({ a: 1, b: [1, 2] }, { a: 1, b: [1, 3], c: true })).toEqual(["b", "c"]);
    expect(llavesCambiadas(null, { a: 1 })).toEqual(["a"]);
  });
});
