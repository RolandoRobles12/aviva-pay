import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { assertAdmin, assertSuperAdmin } from "../../auth/adminGuard";
import {
  borrarGrabacion,
  fragmentoDePantalla,
  getFragmentos,
  getGrabacion,
  getUsoConfigFresh,
  listarGrabaciones,
  lotesDeSesion,
  lotesDesde,
  setUsoConfig,
  type LoteDoc,
} from "../../firestore/usoRepository";
import { calcularUso, momentosDeSesion, puntosDePantalla } from "../../uso/calcular";
import { DISPOSITIVOS, type Dispositivo, type Perfil } from "../../uso/eventos";
import { DIAS_GRABAR_PERSONA } from "../../uso/grabacion";

const PERIODOS = [1, 7, 30, 90];
const DIA_MS = 86_400_000;

function periodo(dias: unknown): number {
  const d = Math.round(Number(dias));
  return PERIODOS.includes(d) ? d : 30;
}

interface Filtro {
  dias?: number;
  /** concesionarioId */
  tienda?: string;
  perfil?: Perfil;
}

function filtrar(lotes: LoteDoc[], f: Filtro): LoteDoc[] {
  return lotes.filter(
    (l) =>
      (!f.tienda || l.tiendas.includes(f.tienda)) &&
      (!f.perfil || l.perfil === f.perfil),
  );
}

async function nombresDeTiendas(): Promise<Record<string, string>> {
  const snap = await getFirestore().collection("paydesk_concesionarios").select("nombre").get();
  return Object.fromEntries(snap.docs.map((d) => [d.id, (d.data().nombre as string) ?? d.id]));
}

/** "Uso del portal": indicadores, embudos, pantallas, personas y errores. Cualquier admin. */
export const adminUsoResumen = onCall<Filtro>(
  { region: "us-central1", memory: "1GiB", timeoutSeconds: 120 },
  async (request) => {
    assertAdmin(request);
    const dias = periodo(request.data?.dias);
    const desde = new Date(Date.now() - dias * DIA_MS);
    const [lotes, tiendas] = await Promise.all([lotesDesde(desde), nombresDeTiendas()]);
    const resumen = calcularUso(filtrar(lotes, request.data ?? {}));
    return { dias, desde: desde.toISOString(), tiendas, ...resumen };
  },
);

/**
 * Los toques de una pantalla para el mapa, y una grabación cuya foto
 * completa muestra esa misma pantalla en ese tipo de equipo (el fondo).
 */
export const adminUsoMapa = onCall<Filtro & { pantalla?: string; dispositivo?: Dispositivo }>(
  { region: "us-central1", memory: "1GiB", timeoutSeconds: 120 },
  async (request) => {
    assertAdmin(request);
    const pantalla = String(request.data?.pantalla ?? "");
    const dispositivo = DISPOSITIVOS.includes(request.data?.dispositivo as Dispositivo)
      ? (request.data!.dispositivo as Dispositivo)
      : "escritorio";
    if (!pantalla) throw new HttpsError("invalid-argument", "Falta la pantalla.");
    const dias = periodo(request.data?.dias);
    const desde = new Date(Date.now() - dias * DIA_MS);
    const [lotes, fondo] = await Promise.all([
      lotesDesde(desde),
      // El fondo puede ser de antes del periodo: una pantalla de hace meses
      // sirve mientras no haya una más reciente.
      fragmentoDePantalla(pantalla, dispositivo, new Date(Date.now() - 365 * DIA_MS)),
    ]);
    const puntos = puntosDePantalla(filtrar(lotes, request.data ?? {}), pantalla, dispositivo);
    return { pantalla, dispositivo, puntos, fondo };
  },
);

/** Las sesiones grabadas del periodo, más recientes primero. Cualquier admin. */
export const adminListGrabaciones = onCall<Filtro & { email?: string }>(
  { region: "us-central1" },
  async (request) => {
    assertAdmin(request);
    const dias = periodo(request.data?.dias);
    const desde = new Date(Date.now() - dias * DIA_MS);
    const email = request.data?.email?.trim().toLowerCase();
    const [lista, tiendas] = await Promise.all([listarGrabaciones(desde, 500), nombresDeTiendas()]);
    return {
      tiendas,
      grabaciones: lista
        .filter(
          (g) =>
            (!email || g.email === email) &&
            (!request.data?.tienda || g.tiendas.includes(request.data.tienda)) &&
            (!request.data?.perfil || g.perfil === request.data.perfil),
        )
        .map((g) => ({
          sesionId: g.sesionId,
          email: g.email,
          perfil: g.perfil,
          tiendas: g.tiendas,
          dispositivo: g.dispositivo,
          inicio: g.inicio.toMillis(),
          fin: g.fin.toMillis(),
          fragmentos: g.fragmentos,
          bytes: g.bytes,
          pantallas: g.pantallas,
          elegida: g.elegida,
        })),
    };
  },
);

/** Una sesión: sus datos, la lista de pedazos y los momentos clave. Cualquier admin. */
export const adminGetGrabacion = onCall<{ sesionId?: string }>(
  { region: "us-central1", memory: "512MiB" },
  async (request) => {
    assertAdmin(request);
    const sesionId = String(request.data?.sesionId ?? "");
    const [g, lotes] = await Promise.all([getGrabacion(sesionId), lotesDeSesion(sesionId)]);
    if (!g) throw new HttpsError("not-found", "Esa grabación ya no existe.");
    return {
      sesionId,
      email: g.grabacion.email,
      perfil: g.grabacion.perfil,
      tiendas: g.grabacion.tiendas,
      dispositivo: g.grabacion.dispositivo,
      inicio: g.grabacion.inicio.toMillis(),
      fin: g.grabacion.fin.toMillis(),
      elegida: g.grabacion.elegida,
      fragmentos: g.fragmentos,
      momentos: momentosDeSesion(lotes.flatMap((l) => l.eventos)),
    };
  },
);

/** Los datos de hasta 10 pedazos (gzip en base64), para el reproductor. */
export const adminGetFragmentos = onCall<{ sesionId?: string; ns?: number[] }>(
  { region: "us-central1", memory: "512MiB" },
  async (request) => {
    assertAdmin(request);
    const sesionId = String(request.data?.sesionId ?? "");
    const ns = (request.data?.ns ?? []).map(Number).filter((n) => Number.isInteger(n) && n >= 0).slice(0, 10);
    const frags = await getFragmentos(sesionId, ns);
    return {
      fragmentos: frags.map((f) => ({
        n: f.n,
        inicio: f.inicio,
        fin: f.fin,
        ancho: f.ancho,
        alto: f.alto,
        pantallas: f.pantallas,
        datos: Buffer.from(f.datos).toString("base64"),
      })),
    };
  },
);

/** Borra una grabación con todos sus pedazos. Solo super admins. */
export const adminBorrarGrabacion = onCall<{ sesionId?: string }>(
  { region: "us-central1" },
  async (request) => {
    assertSuperAdmin(request);
    const sesionId = String(request.data?.sesionId ?? "");
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(sesionId)) throw new HttpsError("invalid-argument", "Sesión inválida.");
    await borrarGrabacion(sesionId);
    return { ok: true as const };
  },
);

function configPublica(c: Awaited<ReturnType<typeof getUsoConfigFresh>>) {
  const ahora = Date.now();
  return {
    porcentajeGrabacion: c.porcentajeGrabacion,
    diasInteracciones: c.diasInteracciones,
    diasGrabaciones: c.diasGrabaciones,
    grabarHasta: Object.entries(c.grabarHasta)
      .filter(([, hasta]) => hasta > ahora)
      .map(([email, hasta]) => ({ email, hasta }))
      .sort((a, b) => a.hasta - b.hasta),
  };
}

export const adminGetUsoConfig = onCall({ region: "us-central1" }, async (request) => {
  assertAdmin(request);
  return configPublica(await getUsoConfigFresh());
});

/**
 * Cambia el % de grabación, los días que se guarda todo, o a quién grabar:
 * `grabar: { email, dias }` con dias 1, 3 o 7 (0 deja de grabarla). Solo
 * super admins, y queda en la bitácora de configuración.
 */
export const adminSetUsoConfig = onCall<{
  porcentajeGrabacion?: number;
  diasInteracciones?: number;
  diasGrabaciones?: number;
  grabar?: { email?: string; dias?: number };
}>({ region: "us-central1" }, async (request) => {
  const caller = assertSuperAdmin(request);
  const d = request.data ?? {};
  const cambio: Parameters<typeof setUsoConfig>[0] = {};

  if (d.porcentajeGrabacion !== undefined) {
    const p = Number(d.porcentajeGrabacion);
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      throw new HttpsError("invalid-argument", "El porcentaje va de 0 a 100.");
    }
    cambio.porcentajeGrabacion = Math.round(p);
  }
  for (const campo of ["diasInteracciones", "diasGrabaciones"] as const) {
    if (d[campo] === undefined) continue;
    const v = Math.round(Number(d[campo]));
    if (!Number.isFinite(v) || v < 7 || v > 730) {
      throw new HttpsError("invalid-argument", "Los días a guardar van de 7 a 730.");
    }
    cambio[campo] = v;
  }
  if (d.grabar) {
    const email = d.grabar.email?.trim().toLowerCase() ?? "";
    const dias = Number(d.grabar.dias);
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new HttpsError("invalid-argument", "Correo inválido.");
    if (dias !== 0 && !(DIAS_GRABAR_PERSONA as readonly number[]).includes(dias)) {
      throw new HttpsError("invalid-argument", "Se graba por 1, 3 o 7 días.");
    }
    const actual = await getUsoConfigFresh();
    const grabarHasta = { ...actual.grabarHasta };
    if (dias === 0) delete grabarHasta[email];
    else grabarHasta[email] = Date.now() + dias * DIA_MS;
    cambio.grabarHasta = grabarHasta;
  }

  const config = await setUsoConfig(cambio, caller.email ?? caller.uid);
  return configPublica(config);
});
