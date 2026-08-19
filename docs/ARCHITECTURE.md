# Arquitectura — Aviva Pay Desk

Ver el requerimiento original en `docs/requerimiento.md` para el contexto de negocio completo. Este documento cubre las decisiones de implementación tomadas al construir el scaffold inicial.

## Componentes

| Componente | Rol |
|---|---|
| HubSpot CRM | Fuente de verdad. Deals con la información de la solicitud de crédito. |
| Workflow de HubSpot | Dispara `syncDealWebhook` en creación de deal / cambio de stage o propiedad relevante (pipeline de Solicitudes). |
| Cloud Functions (`functions/`) | Sincroniza HubSpot → Firestore, expone el API de lectura para el frontend, y escribe de vuelta hacia HubSpot (propiedades y archivos). |
| Firestore (`paydesk_deals`) | Mirror operativo de solo los campos necesarios por deal (`dealId` como ID de documento). |
| Firebase Storage | No se usa como almacenamiento final — los archivos van directo a HubSpot Files API; ver nota en `storage.rules`. |
| Aviva Pay Desk (`web/`) | React + Firebase Hosting, ruta `/d/:dealId`, sin login. |

## Por qué "sin login" + "tiempo real" no son contradictorios

El requerimiento pide dos cosas que a primera vista chocan:

- "La página nunca lee Firestore directo desde el cliente" (para que nadie pueda enumerar deals).
- "Actualización en tiempo real mediante listeners de Firestore".

Solución implementada: al cargar la página, el frontend llama a la función callable `getDealStatus` con el `dealId` de la URL. Esa función:

1. Verifica que el documento exista en Firestore y regresa su contenido ya filtrado (nunca expone el deal completo de HubSpot, solo lo que vive en `paydesk_deals`).
2. Emite un **custom auth token** de Firebase con un único claim: `dealId`.

El cliente usa ese token para autenticarse (usuario anónimo, sin cuenta real) y abre un listener `onSnapshot` directo a `paydesk_deals/{dealId}`. Las reglas de Firestore (`firestore.rules`) solo permiten `get` — nunca `list` — y solo cuando `request.auth.token.dealId == dealId`. Así el cliente nunca puede enumerar ni consultar otros deals, pero sí recibe actualizaciones en tiempo real del suyo.

Esta parte de la arquitectura (el mecanismo de token con claim de un solo deal) es una decisión de implementación tomada para este scaffold, no algo especificado literalmente en el requerimiento — vale la pena confirmarla con el equipo de seguridad junto con el resto de la sección 8.

## Diccionario de campos (pendiente)

Todos los nombres de propiedades de HubSpot están centralizados en **`functions/src/config/fields.ts`**. Hoy son placeholders (`TODO_*`) que reflejan las etiquetas de la sección 7 del requerimiento, no los nombres internos reales. Cuando el diccionario de campos esté listo:

1. Reemplaza cada valor `TODO_*` en `HUBSPOT_DEAL_PROPERTIES` por el nombre interno real de la propiedad en HubSpot.
2. Si algún campo viene de una asociación (contacto/company) en vez de una propiedad del deal directamente, marca eso también — hoy todo el código asume que son propiedades del deal.
3. Nada más debería requerir cambios: `hubspot/deals.ts`, los endpoints de sync/upload y el modelo de Firestore ya leen/escriben a través de este mapa.

## Flujo de sincronización (HubSpot → Firestore)

1. Un workflow de HubSpot (pipeline de Solicitudes) se dispara en creación de deal o cambio de stage/propiedad.
2. El paso de Custom Code llama a `syncDealWebhook` (HTTPS) con `{ dealId }` y un header `Authorization: Bearer <HUBSPOT_WEBHOOK_SECRET>`.
3. La función trae el deal completo de HubSpot (solo las propiedades en `HUBSPOT_DEAL_PROPERTY_LIST`) y hace upsert en `paydesk_deals/{dealId}`.
4. Si es la primera vez que se crea el documento, escribe la URL de la página de vuelta en el deal (`paydeskUrl`), para que un segundo workflow de HubSpot detecte esa propiedad y notifique al contacto del concesionario (sección 9).

## Flujo de escritura (concesionario → HubSpot)

1. El concesionario llena el módulo de "Nueva cotización" o "Comprobante de entrega" en la página.
2. El frontend hace `POST multipart/form-data` a `uploadCotizacion` / `uploadComprobante`.
3. La función valida que el deal exista, sube el archivo a HubSpot Files API, actualiza las propiedades del deal (estatus, URL, fecha, monto/firma), y hace un `patch` del mismo cambio en Firestore para que el listener en tiempo real refleje el cambio sin esperar al próximo sync desde HubSpot.

## Pendientes conocidos

- Diccionario de campos real (`functions/src/config/fields.ts`).
- Confirmar pipeline/stage IDs de HubSpot (`HUBSPOT_PIPELINE` en `fields.ts`).
- Confirmar mecanismo exacto de la notificación del workflow adicional (sección 9).
- Definir con seguridad/negocio el nivel de exposición aceptable del modelo sin login (sección 8) antes de producción.
- Provisionar el private app de HubSpot dedicado (scopes: lectura/escritura de deals, asociaciones y files).
- Dominio propio (`pay.avivacredito.com`) y proyecto Firebase separado del resto de Aviva.
