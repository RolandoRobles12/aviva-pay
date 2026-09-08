/**
 * El vale: el código de un solo uso que el cliente presenta en la caja
 * para que la tienda compruebe que su crédito existe y por cuánto es.
 *
 * Sustituye a la validación por WhatsApp/correo, que era falsificable con
 * un screenshot. Un vale vive en su propia colección
 * (`paydesk_vales/{codigo}`) y no dentro del deal, por dos razones:
 *
 * 1. La caja busca **por código**, que es lo único que trae el cliente.
 *    Con el código como id del documento esa búsqueda es un `get`
 *    directo, sin query ni índice.
 * 2. Un deal puede acumular varios vales a lo largo del tiempo (el
 *    primero venció, Aviva reemitió). El deal apunta al vigente
 *    (`valeCodigoVigente`); los demás quedan como historia.
 */

/**
 * Leer NO es usar. Un vale se puede consultar las veces que haga falta
 * sin consumirse: solo "confirmar disposición" lo pasa a `utilizado`.
 * Esa separación es la que permite detectar un vale que anda circulando
 * — cada lectura queda registrada aunque nadie confirme nada.
 */
export type ValeEstado =
  | "emitido"
  | "utilizado"
  /** Reemitido por un admin: el vale viejo deja de servir en el momento en que nace el nuevo. */
  | "cancelado";

/** Por dónde entró el código a la caja. Se registra para poder distinguir un escaneo de un tecleo cuando se investiga un intento raro. */
export type ValeMedioLectura = "escaneo" | "manual";

/**
 * Cómo terminó un intento de validación. Los cuatro casos que no son
 * `ok` son los que la caja ve como pantalla de error, y todos quedan
 * registrados: un intento fallido es justamente la señal que interesa
 * cuando alguien anda probando vales ajenos.
 */
export type ValeResultadoLectura =
  | "ok"
  | "ya-utilizado"
  | "otra-tienda"
  | "vencido"
  | "cancelado";

/** Un documento en `paydesk_vales/{codigo}`. */
export interface PayDeskVale {
  /** Los 10 dígitos que el cliente presenta. Es también el id del documento. */
  codigo: string;
  /**
   * Secreto largo que va en la URL del vale (`/vale/:token`), el link que
   * HubSpot manda por WhatsApp. Separado del código a propósito: el
   * código es corto para poder teclearse y viaja impreso en el vale, así
   * que no puede ser lo que autoriza a abrir la página.
   */
  token: string;

  dealId: string;
  concesionarioId: string;
  /** Nombre del cliente, copiado al emitir para que la página del vale no tenga que leer el deal. */
  cliente: string | null;
  /** Monto del deal (no de la cotización): es el crédito que Aviva autorizó. */
  montoAutorizado: number | null;

  estado: ValeEstado;
  emitidoEn: FirebaseFirestore.Timestamp;
  /** ISO. Pasada esta fecha el vale ya no sirve, aunque su estado siga en `emitido`. */
  venceEn: string;

  /** Contadores de lectura, para que la caja vea "ya se leyó N veces" sin recorrer la subcolección. */
  lecturasTotal: number;
  ultimaLecturaEn: FirebaseFirestore.Timestamp | null;

  /**
   * Última vez que ALGUIEN pasó este código por la caja, sin importar el
   * resultado, y quién. Solo sirve para no contar dos veces la misma
   * lectura física: un lector de presentación (los de base, siempre
   * encendidos) vuelve a leer el mismo código cada segundo mientras el
   * celular sigue enfrente. Sin esto, dejar el teléfono cinco segundos
   * frente al lector inflaría el contador a cinco lecturas y la próxima
   * caja vería una alarma de fraude que nadie disparó.
   *
   * Es aparte de `ultimaLecturaEn` a propósito: aquel es lo que la tienda
   * dueña ve, y no debe moverse porque otra tienda haya intentado leer un
   * vale ajeno.
   */
  ultimoAccesoEn: FirebaseFirestore.Timestamp | null;
  ultimoAccesoUid: string | null;

  consumidoEn: FirebaseFirestore.Timestamp | null;
  /** uid de la cuenta de tienda que confirmó la disposición. */
  consumidoPor: string | null;
  /** Lo que la tienda dijo que se gastó de verdad, que puede ser menos que el autorizado. */
  montoDispuesto: number | null;

  /** Quién lo emitió: el webhook de HubSpot, o el admin que lo reemitió. */
  emitidoPor: string;
  /** Código del vale al que reemplaza, cuando nace de una reemisión. */
  reemplazaA: string | null;
}

/** Un documento en `paydesk_vales/{codigo}/lecturas/{id}` — la bitácora. */
export interface ValeLectura {
  resultado: ValeResultadoLectura;
  medio: ValeMedioLectura;
  /** Tienda que hizo la lectura. En un intento desde otra tienda, es quien lo intentó, no la dueña del vale. */
  concesionarioId: string | null;
  uid: string;
  email: string | null;
  en: FirebaseFirestore.Timestamp;
}

/**
 * Un intento contra un código que no existe — dígito mal tecleado, o
 * alguien probando números. No hay vale al que colgarle la bitácora, así
 * que van a `paydesk_vale_intentos`, que además es lo que permite ver si
 * una misma tienda está probando códigos al azar.
 */
export interface ValeIntentoFallido {
  codigo: string;
  medio: ValeMedioLectura;
  concesionarioId: string | null;
  uid: string;
  email: string | null;
  en: FirebaseFirestore.Timestamp;
}
