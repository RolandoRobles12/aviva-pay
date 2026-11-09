import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useOutletContext } from "react-router-dom";
import {
  accesoDeSesion,
  auth,
  getVendedorClientesCallable,
  guardarCapacitacionCallable,
  logout,
  type CapacitacionTienda,
  type DealVendedor,
} from "../lib/firebase";
import type { PayDeskConcesionario } from "../types/deal";
import { setEtapas } from "../lib/dealScope";
import { BrandMark } from "../components/BrandMark";
import { VendedorLista } from "../components/VendedorLista";
import { BienvenidaCapacitacion } from "../capacitacion/BienvenidaCapacitacion";
import { LECCIONES_VENDEDOR, MINUTOS_VENDEDOR } from "../capacitacion/leccionesVendedor";
import { calcularAvance, ORDEN_VENDEDOR } from "../capacitacion/progreso";

/** Cada cuánto se vuelve a pedir la lista sola: no hay listener en vivo para el vendedor. */
const REFRESCO_MS = 5 * 60 * 1000;

type Estado =
  | { status: "cargando" }
  | { status: "error"; mensaje: string }
  | {
      status: "listo";
      concesionarios: PayDeskConcesionario[];
      clientes: DealVendedor[];
      consultadoEn: string;
    };

export interface VendedorContexto {
  concesionarios: PayDeskConcesionario[];
  clientes: DealVendedor[];
  consultadoEn: string;
  actualizando: boolean;
  recargar: () => void;
  /** Su avance en el curso del vendedor (pestaña "Aprende"). */
  capacitacion: CapacitacionTienda | null;
  /** Anota una lección como pasada. Rechaza si no se pudo guardar. */
  marcarLeccion: (id: string) => Promise<void>;
}

export function useVendedor() {
  return useOutletContext<VendedorContexto>();
}

/**
 * El marco de la vista del vendedor: personal de la tienda que solo vende.
 * Ve los clientes aprobados de su tienda y en qué etapa va cada uno, para
 * darles seguimiento, y tiene su propio curso en "Aprende".
 *
 * Solo lectura de punta a punta: no hay botones de subir, ni caja, ni
 * archivos, y aunque alguien los invocara a mano, el servidor no le da
 * permiso (su cuenta trae `vendedorIds`, no `concesionarioIds`). Los datos
 * llegan ya recortados por el servidor (nombre, fecha, monto aprobado y
 * etapas; ver functions/src/vendedor/proyeccion.ts), así que lo que no se
 * ve aquí tampoco está en el navegador.
 */
export function VendedorLayout() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado>({ status: "cargando" });
  const [actualizando, setActualizando] = useState(false);
  // Aparte de `estado`: recargar la lista no debe pisar una lección recién pasada.
  const [capacitacion, setCapacitacion] = useState<CapacitacionTienda | null>(null);

  const cargar = useCallback(async () => {
    setActualizando(true);
    try {
      // Igual que en la tienda: sin forzar, una tienda recién asignada no
      // aparece hasta que el token vence (hasta una hora).
      await auth.currentUser?.getIdToken(true);
      // Cada persona tiene un solo perfil (lo impide el panel). Si llega
      // aquí alguien con acceso completo, su vista es otra.
      if (auth.currentUser) {
        const acceso = await accesoDeSesion(auth.currentUser);
        if (acceso.tienda && !acceso.vendedor) {
          navigate("/solicitudes", { replace: true });
          return;
        }
      }
      const { data } = await getVendedorClientesCallable();
      setEtapas(data.etapas);
      setCapacitacion((actual) => actual ?? data.capacitacion ?? null);
      setEstado({
        status: "listo",
        concesionarios: data.concesionarios,
        clientes: data.clientes,
        consultadoEn: data.consultadoEn,
      });
    } catch (err) {
      setEstado((actual) =>
        // Si ya había lista, una recarga fallida no la borra.
        actual.status === "listo"
          ? actual
          : {
              status: "error",
              mensaje: err instanceof Error ? err.message : "No pudimos cargar tus clientes.",
            },
      );
    } finally {
      setActualizando(false);
    }
  }, [navigate]);

  useEffect(() => {
    void cargar();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar]);

  const marcarLeccion = useCallback(async (id: string) => {
    setCapacitacion((c) =>
      c && !c.completadas.includes(id) ? { ...c, completadas: [...c.completadas, id] } : c,
    );
    const { data } = await guardarCapacitacionCallable({ leccion: id });
    setCapacitacion(data);
  }, []);

  const cerrarBienvenida = useCallback(() => {
    setCapacitacion((c) => (c ? { ...c, bienvenidaVista: true } : c));
    // Si no se guarda, a lo más se le vuelve a ofrecer en el siguiente ingreso.
    guardarCapacitacionCallable({ bienvenidaVista: true }).catch(() => {});
  }, []);

  async function salir() {
    await logout();
    navigate("/", { replace: true });
  }

  if (estado.status === "cargando") {
    return <p className="page-message">Cargando tus clientes...</p>;
  }

  if (estado.status === "error") {
    return (
      <div className="page-message page-message--error">
        <p>{estado.mensaje}</p>
        <button type="button" className="link-button" onClick={salir}>
          Volver a iniciar sesión
        </button>
      </div>
    );
  }

  const { concesionarios } = estado;
  const avance = capacitacion ? calcularAvance(capacitacion.completadas, ORDEN_VENDEDOR) : null;
  // Solo a quien nunca la ha visto ni ha empezado: es una invitación, no un muro.
  const mostrarBienvenida =
    capacitacion !== null && !capacitacion.bienvenidaVista && capacitacion.completadas.length === 0;

  const contexto: VendedorContexto = {
    concesionarios,
    clientes: estado.clientes,
    consultadoEn: estado.consultadoEn,
    actualizando,
    recargar: () => void cargar(),
    capacitacion,
    marcarLeccion,
  };

  return (
    <main className="app-shell">
      <header className="app-bar">
        <BrandMark />
        <div className="header-right">
          <div className="store-badge">
            <span className="store-badge__nombre">
              {concesionarios.length > 1
                ? `${concesionarios.length} tiendas`
                : concesionarios[0]?.nombre ?? "Consulta"}
            </span>
            <span className="store-badge__numero">Vendedor</span>
          </div>
          <button type="button" className="link-button" onClick={salir}>
            Salir
          </button>
        </div>
      </header>

      <nav className="tabs">
        <NavLink to="/consulta" end>
          Clientes
        </NavLink>
        <NavLink to="/consulta/aprende" className="tabs__aprende">
          Aprende
          {avance && !avance.completa && (
            <span className="tabs__pill" title={`${avance.hechas} de ${avance.total} lecciones completadas`}>
              {avance.hechas}/{avance.total}
            </span>
          )}
        </NavLink>
      </nav>

      <div className="app-body">
        <Outlet context={contexto} />
      </div>

      {mostrarBienvenida && (
        <BienvenidaCapacitacion
          onCerrar={cerrarBienvenida}
          primeraLeccion="/consulta/aprende/vendedor-inicio"
          lecciones={LECCIONES_VENDEDOR.length}
          minutos={MINUTOS_VENDEDOR}
          aprenderas="qué significa cada etapa del crédito y qué seguimiento darle a cada cliente para cerrar la venta."
          puntos={[
            "Practicas con tu misma pantalla y clientes inventados.",
            "Puedes dejarla a medias y seguir después donde te quedaste.",
            "Siempre la encuentras en la pestaña “Aprende”.",
          ]}
        />
      )}
    </main>
  );
}

/** La pestaña "Clientes": la lista de seguimiento. */
export function VendedorClientes() {
  const { concesionarios, clientes, consultadoEn, actualizando, recargar } = useVendedor();
  return (
    <VendedorLista
      concesionarios={concesionarios}
      clientes={clientes}
      consultadoEn={consultadoEn}
      actualizando={actualizando}
      onActualizar={recargar}
    />
  );
}
