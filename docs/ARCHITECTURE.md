# Arquitectura — Aviva Pay Desk

Ver el requerimiento original en `docs/requerimiento.md` para el contexto de negocio completo. Este documento cubre las decisiones de implementación tomadas al construir el scaffold inicial.

## Marca

El frontend sigue los lineamientos de marca de Aviva (`web/src/styles/global.css`, tokens `:root`):

- **Tipografía:** Fustat (Google Fonts) como tipografía principal — 500/Medium en párrafos, 700+/Bold en títulos, botones y destacados. El wordmark "Aviva Pay Desk" combina "Aviva" en Fustat Bold con "Pay Desk" en Satisfy (sustituto de Simple Cakes, que no está disponible como web font), sizeado a Fustat × 1.5 según la proporción de la guía de marca.
- **Color:** Verde Aviva (`#16B877`) como acento primario (botones, enlaces), Verde Esmeralda (`#B0F5CD`) + Verde Musgo (`#026149`) para estados "completado", Gris Frío (`#F0F5FA`) como fondo de página, Negro Off (`#1E2024`) como color de texto base.

## Quién ve qué

El usuario de Aviva Pay Desk es el **concesionario**: la tienda/sucursal de Construrama. Cada tienda tiene una página donde ve a **sus clientes** (una fila por solicitud de crédito) y ejecuta las acciones que le tocan: subir la cotización y subir el comprobante de entrega firmado.

El cliente final no usa esta página. En los diagramas de proceso aparece una vista para él ("Aviva Pay", el vale de crédito en la app móvil), pero **todavía no existe**: este repo construye únicamente Pay Desk. Aviva Pay queda como proyecto separado y fuera de alcance (sección 3.2 del requerimiento).

## Página por concesionario, no por deal

El requerimiento (sección 2) dice "una página web... por cada solicitud de crédito", lo que en una primera versión se implementó literal: una URL por deal. El mockup de referencia mostró algo distinto: **una sola página por concesionario, con una tabla que lista todos sus clientes** (una fila por deal). Esta es la versión que se implementó — confirmado con el negocio.

- La tienda sale de la propiedad **"Kiosco"** del deal (`HUBSPOT_DEAL_PROPERTIES.kiosco`). No se usa el objeto Company de HubSpot ni ningún otro objeto — confirmado con el negocio: el concesionario se identifica con un campo en el deal, y cada tienda tiene un concesionario distinto (el corte es 1 tienda = 1 página).
- Cada deal sincronizado guarda su `concesionarioId` en `paydesk_deals/{dealId}` para poder hacer la query "todos los deals de esta tienda".
- `paydesk_concesionarios/{concesionarioId}` guarda el nombre visible de la tienda y sus credenciales de acceso.

## Acceso: código de tienda + NIP

**El requerimiento (secciones 3.2 y 8) descartaba el login y apostaba a que la URL no fuera adivinable.** Ese modelo se abandonó: la propiedad Kiosco resultó tener numeración secuencial (`#0001`…`#0481`), así que cualquier identificador derivado de ella era enumerable, y una URL secreta se filtra en cuanto alguien la reenvía por WhatsApp. En su lugar hay autenticación real:

- Todas las tiendas entran por la **misma URL**. Reenviar el link no expone nada.
- El concesionario captura su **código de tienda** (por defecto el número, ej. `0046`) y su **NIP** de 6 dígitos.
- `loginConcesionario` valida y emite un **custom token** cuyo único claim es el `concesionarioId`. El cliente se autentica con ese token y abre un listener `onSnapshot` sobre `paydesk_deals` filtrado por ese id.
- Las reglas de Firestore (`firestore.rules`) solo permiten `get`/`list` cuando `resource.data.concesionarioId == request.auth.token.concesionarioId`. Firestore rechaza cualquier query que no incluya ese filtro exacto, así que el cliente no puede pedir un listado más amplio. Esto es lo que concilia "la página nunca lee Firestore directo" (sección 6) con "actualización en tiempo real".

Esto también resuelve el pendiente que traía la sección 8: el control de acceso ya no depende de que una URL no se adivine.

### Cómo se protege el NIP

Un NIP de 6 dígitos son 10⁶ combinaciones — suficiente con las defensas correctas, indefendible sin ellas:

- **Nunca se guarda en claro.** Solo el hash **scrypt** (`functions/src/auth/nip.ts`). scrypt es deliberadamente lento, lo que importa aquí porque un espacio de 10⁶ con un hash rápido se agota en segundos si alguien obtiene la base.
- **Bloqueo por intentos**: 5 fallos consecutivos bloquean la tienda 15 minutos. El contador vive en el documento de la tienda, así que el bloqueo aplica aunque los intentos caigan en instancias distintas de Cloud Functions.
- **Mensajes de error idénticos** para "código inexistente", "NIP incorrecto" y "tienda sin NIP": distinguirlos permitiría sondear qué códigos existen.
- **Se genera con CSPRNG** (`randomInt`), no con `Math.random()`.
- **Se muestra una sola vez**, al generarlo en el panel. No es recuperable después; si se pierde, se genera otro.
- El NIP **nunca se escribe en HubSpot**. El workflow de notificación (sección 9) manda la liga y el código; el NIP se entrega aparte.

Los endpoints de subida (`uploadCotizacion`, `uploadComprobante`) también verifican el token y que el deal pertenezca a la tienda que llama — antes dependían de que la URL fuera secreta.

## Panel de administración

En `/admin`, con cuentas de **Firebase Auth (correo + contraseña)** que llevan un custom claim `admin: true`. No es SSO ni Google. Cada endpoint admin verifica el claim vía `assertAdmin()`.

### Alta de administradores

El claim se otorga **fuera de la aplicación** — si la app pudiera otorgarlo, cualquiera que se registrara podría promoverse. Para dar de alta a alguien: crear el usuario en Firebase Console (Authentication → Users) y luego, una sola vez, desde un entorno con credenciales de Admin SDK:

```js
await getAuth().setCustomUserClaims(uid, { admin: true });
```

La persona debe volver a iniciar sesión para que el claim entre en su token.

### Qué administra

| Pantalla | Para qué |
|---|---|
| **Tiendas** (`/admin/tiendas`) | Catálogo de las ~481 tiendas, que aparecen solas conforme llegan deals. Renombrar (de `#0046 - TEQ CR` al nombre real), cambiar el código de acceso, generar/regenerar NIP, ver último acceso y desbloquear. |
| **Diccionario de campos** (`/admin/diccionario`) | Mapeo de cada dato de Pay Desk a su propiedad interna de HubSpot, editable sin desplegar. |

El diccionario vive en `paydesk_config/field_dictionary` y `config/fields.ts` queda como **valores por defecto**: cualquier campo que el documento no defina cae al valor del código, así que agregar un campo nuevo en código no rompe un deployment cuyo documento es anterior. Se cachea por instancia de Cloud Function (cada sync lo necesita y cambia dos veces al año), por lo que un cambio aplica conforme se reciclan las instancias, no al instante — está advertido en la propia pantalla.

> **Nota:** el diccionario editable es un arma de doble filo: un nombre de propiedad mal capturado rompe la sincronización de todas las tiendas sin pasar por revisión de código. La pantalla valida que las llaves sean conocidas y los valores no vayan vacíos, y ofrece "Restaurar" por campo, pero el riesgo operativo sigue ahí.

## El valor de "Kiosco" y cómo se muestra

La propiedad Kiosco es de tipo **multiple checkboxes**, con ~481 opciones cuyo texto es nomenclatura interna: `#0046 - TEQ CR` (número de tienda, abreviatura, `CR` = Construrama).

- **Como identificador interno**: `concesionarioId` es el slug del valor (`0046-teq-cr`). Determinístico, así que dos deals de una tienda nueva sincronizando a la vez convergen al mismo documento sin tabla de lookup ni condición de carrera. No aparece en ninguna URL pública, así que no necesita ser secreto — y siendo legible, el catálogo y los logs se leen mejor.
- **Como nombre visible**: `#0046 - TEQ CR` no le dice nada a un concesionario. Se muestra `Construrama TEQ` con `Tienda 0046` como dato secundario, **y el panel permite reemplazarlo por el nombre real de la tienda**. El valor crudo se guarda para trazabilidad pero nunca se le muestra a la tienda.
- Como es *multi-checkbox*, HubSpot puede devolver varios valores separados por `;`. Una solicitud pertenece a una sola tienda, así que se toma el primero y se deja un `logger.warn` cuando llegan varios — pendiente confirmar con el admin de HubSpot si eso puede pasar legítimamente.

## Componentes

| Componente | Rol |
|---|---|
| HubSpot CRM | Fuente de verdad. Deals (solicitudes de crédito de los clientes), cada uno con la tienda de Construrama a la que pertenece. |
| Workflow de HubSpot | Dispara `syncDealWebhook` en creación de deal / cambio de stage o propiedad relevante (pipeline de Solicitudes). |
| Cloud Functions (`functions/`) | Sincroniza HubSpot → Firestore, autentica tiendas y admins, expone el API de lectura, y escribe de vuelta hacia HubSpot (propiedades y archivos del deal). |
| Firestore (`paydesk_deals`, `paydesk_concesionarios`, `paydesk_config`) | Mirror operativo, catálogo de tiendas con credenciales, y diccionario de campos. |
| Firebase Auth | Custom tokens con claim de tienda para concesionarios; correo/contraseña con claim `admin` para el equipo de Aviva. |
| Firebase Storage | No se usa como almacenamiento final — los archivos van directo a HubSpot Files API; ver nota en `storage.rules`. |
| Aviva Pay Desk (`web/`) | React + Firebase Hosting. `/` login de tienda, `/solicitudes` tabla de clientes, `/admin/*` panel interno. |

## Flujo de sincronización (HubSpot → Firestore)

1. Un workflow de HubSpot (pipeline de Solicitudes) se dispara en creación de deal o cambio de stage/propiedad.
2. El paso de Custom Code llama a `syncDealWebhook` (HTTPS) con `{ dealId }` y un header `Authorization: Bearer <HUBSPOT_WEBHOOK_SECRET>`.
3. La función trae el deal de HubSpot (las propiedades del diccionario, incluida la tienda) y hace upsert en `paydesk_deals/{dealId}`.
4. Si es la primera vez que se ve a esa tienda, se crea su documento en `paydesk_concesionarios` (sin NIP todavía) y se escriben de vuelta en el deal la liga de Pay Desk y el código de la tienda, para que un segundo workflow los mande al contacto (sección 9). El NIP no viaja por ahí: se genera en el panel y se entrega aparte. Deals posteriores de la misma tienda solo agregan una fila — no se repite la notificación.
5. Si el deal todavía no trae la tienda capturada, el sync se omite (queda pendiente hasta el próximo disparo del workflow, cuando se espera que el campo ya esté lleno).

## Flujo de escritura (concesionario → HubSpot)

1. El concesionario llena el módulo de "Nueva cotización" o "Comprobante de entrega" para una fila (deal) específica de su tabla.
2. El frontend hace `POST multipart/form-data` a `uploadCotizacion` / `uploadComprobante` con ese `dealId`.
3. La función valida la sesión, que el deal exista **y que pertenezca a la tienda que llama**, sube el archivo a HubSpot Files API, actualiza las propiedades del deal (estatus, URL, fecha, monto/firma), y hace un `patch` del mismo cambio en Firestore para que el listener en tiempo real refleje el cambio sin esperar al próximo sync desde HubSpot.

## Pendientes conocidos

- Diccionario de campos real — se puede capturar desde `/admin/diccionario` o en `config/fields.ts`. Incluye el nombre interno de la propiedad "Kiosco".
- Catálogo de nombres reales de tienda: se puede capturar tienda por tienda en `/admin/tiendas`. Si Aviva tiene el catálogo de códigos (`TEQ`, `TEO`, `FER`…) → nombres, vale la pena un import masivo en vez de 481 ediciones a mano.
- Confirmar con el admin de HubSpot si un deal puede tener más de un Kiosco marcado (hoy se toma el primero y se loguea el caso).
- Crear las cuentas de admin y otorgarles el claim `admin` (ver "Alta de administradores").
- Definir el proceso operativo de entrega de NIPs a las ~481 tiendas, y a quién contactan cuando lo olvidan.
- Considerar caducidad/rotación de NIP y si el bloqueo de 15 minutos es el adecuado para la operación.
- Confirmar pipeline/stage IDs de HubSpot (`HUBSPOT_PIPELINE` en `fields.ts`).
- Confirmar con el dueño del workflow de HubSpot: cómo se dispara la notificación (sección 9) y a qué contacto de la tienda le llega.
- Provisionar el private app de HubSpot dedicado (scopes: lectura/escritura de deals y files).
- Dominio propio (`pay.avivacredito.com`) y proyecto Firebase separado del resto de Aviva.
