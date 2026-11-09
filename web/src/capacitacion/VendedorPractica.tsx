import { useCallback, useEffect, useRef, useState } from "react";
import { VendedorLista, type EstadoListaVendedor } from "../components/VendedorLista";
import type { DealVendedor } from "../lib/firebase";

/**
 * La lista del vendedor en modo práctica: el mismo componente que usa en
 * /consulta (VendedorLista), con clientes inventados. Nada llama al
 * servidor; "Actualizar" solo cuenta que lo tocó.
 */

export const TIENDAS_PRACTICA_VENDEDOR = [
  { concesionarioId: "p1", nombre: "Tienda Centro (práctica)", numero: null },
  { concesionarioId: "p2", nombre: "Tienda Norte (práctica)", numero: null },
];

const DIA = 86_400_000;

/** Un cliente por etapa, en dos tiendas, para que cada filtro tenga a alguien. */
export function clientesPracticaVendedor(hoy = new Date()): DealVendedor[] {
  const d = (dias: number) => new Date(hoy.getTime() - dias * DIA).toISOString();
  const c = (
    dealId: string,
    cliente: string,
    tienda: string,
    dias: number,
    monto: number,
    hasta: number,
  ): DealVendedor => ({
    dealId,
    concesionarioId: tienda,
    cliente,
    fechaSolicitud: d(dias),
    montoAprobado: monto,
    estatusKyc: hasta >= 1 ? d(dias - 1) : null,
    cotizacionEstatus: hasta >= 2 ? "completado" : "pendiente",
    creditoLiberadoFecha: hasta >= 3 ? d(dias - 3) : null,
    disposicionCreditoFecha: hasta >= 4 ? d(dias - 4) : null,
    comprobanteEntregaEstatus: hasta >= 5 ? "completado" : "pendiente",
    desembolsoFecha: hasta >= 6 ? d(dias - 6) : null,
    etapasExtra: {},
  });
  // `hasta`: 0 = solo aprobada, 1 = KYC, 2 = cotización, 3 = crédito
  // liberado, 4 = disposición, 5 = comprobante, 6 = desembolso.
  return [
    c("ana", "Ana Martínez", "p1", 1, 20_000, 0),
    c("luis", "Luis Ramírez", "p1", 3, 25_000, 1),
    c("rosa", "Rosa Díaz", "p2", 5, 15_000, 2),
    c("pedro", "Pedro Sánchez", "p1", 7, 18_000, 3),
    c("marta", "Marta Ruiz", "p2", 8, 22_000, 3),
    c("carmen", "Carmen Ortiz", "p2", 12, 30_000, 4),
    c("jorge", "Jorge Medina", "p1", 20, 16_000, 5),
    c("lucia", "Lucía Fernández", "p1", 30, 12_000, 6),
  ];
}

export interface MisionVendedor {
  id: string;
  texto: string;
  pista?: string;
  hecha: (s: EstadoListaVendedor) => boolean;
}

export function VendedorPractica({
  misiones,
  onCompletado,
}: {
  misiones: MisionVendedor[];
  onCompletado: () => void;
}) {
  const [clientes] = useState(() => clientesPracticaVendedor());
  const [consultadoEn, setConsultadoEn] = useState(() => new Date().toISOString());
  const [estado, setEstado] = useState<EstadoListaVendedor | null>(null);
  const [logradas, setLogradas] = useState<ReadonlySet<string>>(new Set());
  const avisado = useRef(false);

  const onCambio = useCallback((e: EstadoListaVendedor) => setEstado(e), []);

  // Una misión cumplida se queda cumplida aunque después cambien los filtros.
  const ahora = estado ? misiones.filter((m) => m.hecha(estado)).map((m) => m.id) : [];
  const nuevas = ahora.filter((id) => !logradas.has(id)).join(",");
  useEffect(() => {
    if (nuevas) setLogradas((prev) => new Set([...prev, ...nuevas.split(",")]));
  }, [nuevas]);
  const hechas = misiones.map((m) => logradas.has(m.id) || ahora.includes(m.id));
  const todas = hechas.every(Boolean);

  useEffect(() => {
    if (todas && !avisado.current) {
      avisado.current = true;
      onCompletado();
    }
  }, [todas, onCompletado]);

  return (
    <div className="cap-simulador cap-tienda">
      <div className="cap-simulador__banda">Consulta de práctica · Clientes inventados</div>
      <div className="cap-tienda__misiones">
        <p className="cap-simulador__titulo">
          Tus misiones · {hechas.filter(Boolean).length} de {misiones.length}
        </p>
        <ol>
          {misiones.map((m, i) => (
            <li key={m.id} className={hechas[i] ? "cap-tienda__mision--hecha" : undefined}>
              <span className="cap-mision__check" aria-hidden>
                {hechas[i] ? "✓" : ""}
              </span>
              <span>
                {m.texto}
                {m.pista && !hechas[i] && <span className="cap-tienda__pista">{m.pista}</span>}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="cap-tienda__lista">
        <VendedorLista
          concesionarios={TIENDAS_PRACTICA_VENDEDOR}
          clientes={clientes}
          consultadoEn={consultadoEn}
          onActualizar={() => setConsultadoEn(new Date().toISOString())}
          onCambio={onCambio}
        />
      </div>
    </div>
  );
}
