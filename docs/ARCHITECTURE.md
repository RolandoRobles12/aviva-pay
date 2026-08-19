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

El requerimiento (sección 2) dice "una página web... por cada solicitud de crédito", lo que en una primera versión se implementó literal: una URL por deal (`/d/:dealId`). El mockup de referencia mostró algo distinto: **una sola página por concesionario, con una tabla que lista todos sus clientes** (una fila por deal). Esta es la versión que se implementó — confirmado con el negocio.

Esto significa que la URL de la página identifica a la **tienda**, no a un deal individual:

- Ruta del frontend: `/c/:concesionarioId`.
- `concesionarioId` sale de una **propiedad del deal** (`HUBSPOT_DEAL_PROPERTIES.concesionarioId`) que nombra la tienda de Construrama. No se usa el objeto Company de HubSpot ni ningún otro objeto — confirmado con el negocio: el concesionario se identifica con un campo en el deal.
- Cada deal sincronizado guarda su `concesionarioId` en `paydesk_deals/{dealId}` para poder hacer la query "todos los deals de esta tienda".
- Existe además `paydesk_concesionarios/{concesionarioId}` — un documento por tienda, usado únicamente para saber si ya se le notificó (ver más abajo) y como ancla de las reglas de Firestore.

Nota: como el valor de esa propiedad termina directo en la URL, conviene que sea un identificador estable y no adivinable (ver "Pendientes conocidos").

## Componentes

| Componente | Rol |
|---|---|
| HubSpot CRM | Fuente de verdad. Deals (solicitudes de crédito de los clientes), cada uno con la tienda de Construrama a la que pertenece. |
| Workflow de HubSpot | Dispara `syncDealWebhook` en creación de deal / cambio de stage o propiedad relevante (pipeline de Solicitudes). |
| Cloud Functions (`functions/`) | Sincroniza HubSpot → Firestore, expone el API de lectura para el frontend, y escribe de vuelta hacia HubSpot (propiedades y archivos del deal). |
| Firestore (`paydesk_deals`, `paydesk_concesionarios`) | Mirror operativo de solo los campos necesarios, agrupable por tienda. |
| Firebase Storage | No se usa como almacenamiento final — los archivos van directo a HubSpot Files API; ver nota en `storage.rules`. |
| Aviva Pay Desk (`web/`) | React + Firebase Hosting, ruta `/c/:concesionarioId`, sin login, tabla con una fila por cliente/solicitud. |

## Por qué "sin login" + "tiempo real" no son contradictorios

El requerimiento pide dos cosas que a primera vista chocan:

- "La página nunca lee Firestore directo desde el cliente" (para que nadie pueda enumerar deals).
- "Actualización en tiempo real mediante listeners de Firestore".

Solución implementada: al cargar la página, el frontend llama a la función callable `getConcesionarioDeals` con el `concesionarioId` de la URL. Esa función:

1. Verifica que exista el documento `paydesk_concesionarios/{concesionarioId}` y regresa todos los deals de `paydesk_deals` con ese `concesionarioId` (nunca expone los deals completos de HubSpot, solo lo que vive en Firestore).
2. Emite un **custom auth token** de Firebase con un único claim: `concesionarioId`.

El cliente usa ese token para autenticarse (usuario anónimo, sin cuenta real) y abre un listener `onSnapshot` sobre una query `paydesk_deals` filtrada por `concesionarioId`. Las reglas de Firestore (`firestore.rules`) solo permiten `get`/`list` cuando `resource.data.concesionarioId == request.auth.token.concesionarioId` — y Firestore rechaza cualquier query que no incluya ese filtro exacto, así que el cliente nunca puede pedir un listado más amplio. Así el cliente nunca puede enumerar ni consultar los deals de otro concesionario, pero sí recibe actualizaciones en tiempo real de los suyos.

Esta parte de la arquitectura (el mecanismo de token con claim de concesionario) es una decisión de implementación tomada para este scaffold, no algo especificado literalmente en el requerimiento — vale la pena confirmarla con el equipo de seguridad junto con el resto de la sección 8.

## Diccionario de campos (pendiente)

Todos los nombres de propiedades de HubSpot están centralizados en **`functions/src/config/fields.ts`** (`HUBSPOT_DEAL_PROPERTIES`). Hoy son placeholders (`TODO_*`) que reflejan las etiquetas de la sección 7 del requerimiento, no los nombres internos reales. Cuando el diccionario de campos esté listo:

1. Reemplaza cada valor `TODO_*` por el nombre interno real de la propiedad en HubSpot — incluyendo `concesionarioId`, la propiedad que identifica la tienda de Construrama.
2. Si algún campo en realidad vive en el contacto en vez del deal, marca eso — hoy todo `HUBSPOT_DEAL_PROPERTIES` asume que son propiedades del deal.
3. Nada más debería requerir cambios: `hubspot/deals.ts`, los endpoints de sync/upload y el modelo de Firestore ya leen/escriben a través de este mapa.

## Flujo de sincronización (HubSpot → Firestore)

1. Un workflow de HubSpot (pipeline de Solicitudes) se dispara en creación de deal o cambio de stage/propiedad.
2. El paso de Custom Code llama a `syncDealWebhook` (HTTPS) con `{ dealId }` y un header `Authorization: Bearer <HUBSPOT_WEBHOOK_SECRET>`.
3. La función trae el deal de HubSpot (propiedades en `HUBSPOT_DEAL_PROPERTY_LIST`, incluida la tienda) y hace upsert en `paydesk_deals/{dealId}`.
4. Si es la primera vez que se ve a esa tienda (no existía `paydesk_concesionarios/{concesionarioId}`), escribe la URL de la página de vuelta en el deal (`HUBSPOT_DEAL_PROPERTIES.paydeskUrl`), para que un segundo workflow de HubSpot detecte esa propiedad y notifique al contacto de la tienda (sección 9). Deals posteriores de la misma tienda solo agregan una fila — no se repite la notificación.
5. Si el deal todavía no trae la tienda capturada, el sync se omite (queda pendiente hasta el próximo disparo del workflow, cuando se espera que el campo ya esté lleno).

## Flujo de escritura (concesionario → HubSpot)

1. El concesionario llena el módulo de "Nueva cotización" o "Comprobante de entrega" para una fila (deal) específica de su tabla.
2. El frontend hace `POST multipart/form-data` a `uploadCotizacion` / `uploadComprobante` con ese `dealId`.
3. La función valida que el deal exista, sube el archivo a HubSpot Files API, actualiza las propiedades del deal (estatus, URL, fecha, monto/firma), y hace un `patch` del mismo cambio en Firestore para que el listener en tiempo real refleje el cambio sin esperar al próximo sync desde HubSpot.

## Pendientes conocidos

- Diccionario de campos real (`functions/src/config/fields.ts`).
- **Qué valor lleva la propiedad de tienda**: si es un nombre legible ("Construrama Caysma Norte") termina visible y adivinable en la URL, lo que choca con el modelo de acceso de la sección 8 ("identificador no enumerable ni predecible"). Si es así, conviene generar un identificador opaco por tienda (guardado en Firestore, mapeado al nombre) y usar ese en la URL. Decisión pendiente con negocio/seguridad.
- Confirmar pipeline/stage IDs de HubSpot (`HUBSPOT_PIPELINE` en `fields.ts`).
- Confirmar con el dueño del workflow de HubSpot: cómo se dispara la notificación (sección 9) y a qué contacto de la tienda le llega.
- Definir con seguridad/negocio el nivel de exposición aceptable del modelo sin login (sección 8) antes de producción.
- Provisionar el private app de HubSpot dedicado (scopes: lectura/escritura de deals y files).
- Dominio propio (`pay.avivacredito.com`) y proyecto Firebase separado del resto de Aviva.
