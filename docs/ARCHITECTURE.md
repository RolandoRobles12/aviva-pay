# Arquitectura — Aviva Paydesk

Ver el requerimiento original en `docs/requerimiento.md` para el contexto de negocio completo. Este documento cubre las decisiones de implementación tomadas al construir el scaffold inicial.

## Marca

El frontend sigue los lineamientos de marca de Aviva (`web/src/styles/global.css`, tokens `:root`):

- **Tipografía:** Fustat (Google Fonts) como tipografía principal — 500/Medium en párrafos, 700+/Bold en títulos, botones y destacados. El wordmark "Aviva Paydesk" combina "Aviva" en Fustat Bold con "Paydesk" en Satisfy (sustituto de Simple Cakes, que no está disponible como web font), sizeado a Fustat × 1.5 según la proporción de la guía de marca.
- **Color:** Verde Aviva (`#16B877`) como acento primario (botones, enlaces), Verde Esmeralda (`#B0F5CD`) + Verde Musgo (`#026149`) para estados "completado", Gris Frío (`#F0F5FA`) como fondo de página, Negro Off (`#1E2024`) como color de texto base.

## Quién ve qué

El usuario de Aviva Paydesk es el **concesionario**: la tienda/sucursal de Construrama. Cada tienda tiene una página donde ve a **sus clientes** (una fila por solicitud de crédito) y ejecuta las acciones que le tocan: subir la cotización y subir el comprobante de entrega firmado.

El cliente final no usa esta página. En los diagramas de proceso aparece una vista para él ("Aviva Pay", el vale de crédito en la app móvil), pero **todavía no existe**: este repo construye únicamente Paydesk. Aviva Pay queda como proyecto separado y fuera de alcance (sección 3.2 del requerimiento).

## Página por concesionario, no por deal

El requerimiento (sección 2) dice "una página web... por cada solicitud de crédito", lo que en una primera versión se implementó literal: una URL por deal. El mockup de referencia mostró algo distinto: **una sola página por concesionario, con una tabla que lista todos sus clientes** (una fila por deal). Esta es la versión que se implementó — confirmado con el negocio.

- La tienda sale de la propiedad **"Kiosco"** del deal (`HUBSPOT_DEAL_PROPERTIES.kiosco`). No se usa el objeto Company de HubSpot ni ningún otro objeto — confirmado con el negocio: el concesionario se identifica con un campo en el deal, y cada tienda tiene un concesionario distinto (el corte es 1 tienda = 1 página).
- Cada deal sincronizado guarda su `concesionarioId` en `paydesk_deals/{dealId}` para poder hacer la query "todos los deals de esta tienda".
- `paydesk_concesionarios/{concesionarioId}` guarda el nombre visible de la tienda y la lista de correos invitados a entrar a ella (`usuarios`).

## Acceso: cuentas de correo + contraseña, muchas-a-muchas con tiendas

**El requerimiento (secciones 3.2 y 8) descartaba el login y apostaba a que la URL no fuera adivinable.** Ese modelo se abandonó primero por un código de tienda + NIP, y ese a su vez se reemplazó por completo: un NIP compartido no escala cuando una tienda tiene varias personas o una persona atiende varias tiendas. El modelo actual:

- Todas las tiendas entran por la **misma URL**. Reenviar el link no expone nada.
- Un concesionario es una cuenta real de **Firebase Auth (correo + contraseña)**, nunca un secreto compartido por tienda. Una tienda puede tener más de un correo invitado, y el mismo correo puede estar invitado a más de una tienda — quien entra ve la **lista combinada** de todos sus clientes, de todas sus tiendas, en una sola tabla.
- El alta ocurre desde `/admin/tiendas`: un admin agrega uno o más correos a `usuarios` en el documento de la tienda. Eso crea (si no existía) una cuenta de Firebase Auth **sin contraseña utilizable** para ese correo — ver `concesionario/userSync.ts` — y dispara `sendPasswordResetEmail` desde el cliente, que es lo que convierte esa cuenta en una que la persona puede usar. No hay servicio de correo propio: las tiendas usan dominios y proveedores distintos entre sí, así que se apoya en el envío nativo de Firebase, que no depende del proveedor del destinatario.
- "Olvidé mi contraseña" en el login es exactamente el mismo mecanismo (`enviarRestablecerContrasena`), y siempre muestra el mismo mensaje exista o no la cuenta — evita que la pantalla sirva para sondear qué correos están dados de alta.
- El acceso de cada cuenta vive en `paydesk_concesionario_users/{uid}` (índice inverso uid → lista de `concesionarioId`), mantenido en sync con el `usuarios` de cada tienda por `syncConcesionarioUsuarios`. De ahí se recalcula el custom claim `concesionarioIds: string[]` en el token — la lista completa de tiendas que esa cuenta puede ver.
- El cliente abre un listener `onSnapshot` sobre `paydesk_deals` filtrado con `where("concesionarioId", "in", ids)` (troceado de 30 en 30, el límite de Firestore para `in`).
- Las reglas de Firestore (`firestore.rules`) solo permiten `get`/`list` cuando `resource.data.concesionarioId` está en `request.auth.token.concesionarioIds`. Firestore rechaza cualquier query que no incluya ese filtro exacto, así que el cliente no puede pedir un listado más amplio que sus propias tiendas.
- El checkbox "Mantener sesión iniciada" en el login decide la persistencia (`browserLocalPersistence` vs `browserSessionPersistence`) antes de autenticar.

Esto también resuelve el pendiente que traía la sección 8: el control de acceso ya no depende de que una URL no se adivine.

Los endpoints de subida (`uploadCotizacion`, `uploadComprobante`) también verifican el token y que el deal pertenezca a una de las tiendas de `concesionarioIds` que llama — antes dependían de que la URL fuera secreta.

## Panel de administración

En `/admin`, con cuentas de **Firebase Auth (Google)** que llevan un custom claim `admin: true`. Cada endpoint admin verifica el claim vía `assertAdmin()`. El login de admin siempre persiste la sesión entre reinicios del navegador (`browserLocalPersistence`) — no hay checkbox "recordar" como en el login de concesionario.

### Alta de administradores

El claim se otorga **fuera de la aplicación** solo para el *primer* admin — si la app pudiera otorgarlo sin que nadie con el claim lo pidiera, cualquiera que se registrara (con correo o con Google) podría promoverse. Para dar de alta a ese primer admin: crear el usuario en Firebase Console (Authentication → Users; si va a entrar con Google, basta con que inicie sesión una vez para que su cuenta exista) y luego, una sola vez, desde un entorno con credenciales de Admin SDK:

```js
await getAuth().setCustomUserClaims(uid, { admin: true });
```

La persona debe volver a iniciar sesión para que el claim entre en su token.

A partir de ahí, cualquier admin puede dar de alta a los siguientes desde `/admin/administradores` (ver abajo) — ya no hace falta tocar la consola ni el Admin SDK a mano.

### Qué administra

| Pantalla | Para qué |
|---|---|
| **Tiendas** (`/admin/tiendas`) | Catálogo de las ~481 tiendas, que aparecen solas conforme llegan deals. Renombrar (de `#0046 - TEQ CR` al nombre real), invitar o quitar correos con acceso, y fijar su fecha de arranque individual. |
| **Diccionario de campos** (`/admin/diccionario`) | Mapeo de cada dato de Paydesk a su propiedad interna de HubSpot, editable sin desplegar. |
| **Administradores** (`/admin/administradores`) | Otorgar o revocar el acceso al panel, y ver el historial de quién se lo dio a quién y cuándo. |

### Gestión de administradores (`/admin/administradores`)

Otorgar acceso (`adminCreateAdmin`) busca la cuenta de Firebase Auth por correo y, si no existe, la crea sin contraseña — la persona entra después con "Continuar con Google" usando ese mismo correo, que Firebase enlaza automáticamente porque la cuenta recién creada no tiene ningún proveedor de inicio de sesión todavía. Luego pone el claim `admin: true`.

Revocar acceso (`adminRevokeAdmin`) pone el claim en `false`. Un admin no puede revocarse a sí mismo — es la manera de evitar que alguien se quede sin poder entrar por error; si de verdad hace falta quitarle el acceso al último admin activo, hay que hacerlo con el mismo comando de Admin SDK que se usa para dar de alta al primero.

Dos colecciones de Firestore respaldan esta pantalla, ambas de solo lectura/escritura desde las Cloud Functions (igual que el resto — ver `firestore.rules`):

- `paydesk_admins/{uid}` — el roster actual: correo, nombre, quién lo otorgó y cuándo, y `revokedAt` (null mientras está activo).
- `paydesk_admin_audit/{id}` — bitácora de auditoría, un documento por cada alta o baja, nunca se edita ni se borra.

Ninguna de las dos es la fuente de verdad de quién es admin — esa sigue siendo el custom claim en el token de Firebase Auth, que es lo único que valida `assertAdmin()`. Son el registro de lectura para la UI y el historial; si alguna vez quedaran desincronizadas del claim (por ejemplo, alguien corrió `setCustomUserClaims` a mano sin pasar por estas funciones), lo que manda para efectos de acceso sigue siendo el claim.

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
| Firestore (`paydesk_deals`, `paydesk_concesionarios`, `paydesk_concesionario_users`, `paydesk_config`) | Mirror operativo, catálogo de tiendas con sus correos invitados, índice inverso uid → tiendas, y diccionario de campos. |
| Firebase Auth | Correo/contraseña con claim `concesionarioIds: string[]` para concesionarios; correo/contraseña o Google con claim `admin` para el equipo de Aviva. |
| Firebase Storage | No se usa como almacenamiento final — los archivos van directo a HubSpot Files API; ver nota en `storage.rules`. |
| Aviva Paydesk (`web/`) | React + Firebase Hosting. `/` login de tienda, `/solicitudes` tabla de clientes, `/admin/*` panel interno. |

## Flujo de sincronización (HubSpot → Firestore)

1. Un workflow de HubSpot (pipeline de Solicitudes) se dispara en creación de deal o cambio de stage/propiedad.
2. El paso de Custom Code llama a `syncDealWebhook` (HTTPS) con `{ dealId }` y un header `Authorization: Bearer <HUBSPOT_WEBHOOK_SECRET>`.
3. La función trae el deal de HubSpot (las propiedades del diccionario, incluida la tienda) y hace upsert en `paydesk_deals/{dealId}`.
4. Si es la primera vez que se ve a esa tienda, se crea su documento en `paydesk_concesionarios` (sin usuarios invitados todavía) y se escribe de vuelta en el deal la liga de Paydesk. Invitar a alguien de esa tienda es un paso aparte, manual, desde `/admin/tiendas`. Deals posteriores de la misma tienda solo agregan una fila.
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
- Habilitar el proveedor Google en Firebase Console (Authentication → Sign-in method) — el botón "Continuar con Google" no funciona hasta activarlo en el proyecto.
- **Corte operativo del reemplazo de NIP por correo/contraseña**: el acceso viejo (código + NIP) quedó retirado por completo, así que ninguna tienda puede entrar hasta que un admin le invite al menos un correo desde `/admin/tiendas`. Falta correr ese alta inicial para las tiendas que ya estaban activas.
- Revisar la plantilla del correo que envía `sendPasswordResetEmail` (Firebase Console → Authentication → Templates) — hoy es la genérica de Firebase; vale la pena personalizarla con la marca de Aviva ya que es el único correo que recibe una tienda invitada.
- Confirmar pipeline/stage IDs de HubSpot (`HUBSPOT_PIPELINE` en `fields.ts`).
- Confirmar con el dueño del workflow de HubSpot: cómo se dispara la notificación (sección 9) y a qué contacto de la tienda le llega.
- Provisionar el private app de HubSpot dedicado (scopes: lectura/escritura de deals y files).
- Dominio propio (`pay.avivacredito.com`) y proyecto Firebase separado del resto de Aviva.
