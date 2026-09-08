# Arquitectura — Aviva Paydesk

Ver el requerimiento original en `docs/requerimiento.md` para el contexto de negocio completo. Este documento cubre las decisiones de implementación tomadas al construir el scaffold inicial.

## Marca

El frontend sigue los lineamientos de marca de Aviva (`web/src/styles/global.css`, tokens `:root`):

- **Tipografía:** Fustat (Google Fonts) como tipografía principal — 500/Medium en párrafos, 700+/Bold en títulos, botones y destacados. El wordmark "Aviva Paydesk" combina "Aviva" en Fustat Bold con "Paydesk" en Satisfy (sustituto de Simple Cakes, que no está disponible como web font), sizeado a Fustat × 1.5 según la proporción de la guía de marca.
- **Color:** Verde Aviva (`#16B877`) como acento primario (botones, enlaces), Verde Esmeralda (`#B0F5CD`) + Verde Musgo (`#026149`) para estados "completado", Gris Frío (`#F0F5FA`) como fondo de página, Negro Off (`#1E2024`) como color de texto base.

## Quién ve qué

El usuario de Aviva Paydesk es el **concesionario**: la tienda/sucursal de Construrama. Cada tienda tiene una página donde ve a **sus clientes** (una fila por solicitud de crédito) y ejecuta las acciones que le tocan: subir la cotización y subir el comprobante de entrega firmado.

El cliente final no usa la tabla de solicitudes, pero **sí tiene una pantalla propia**: `/vale/:token`, el vale que presenta en el mostrador y que le llega por WhatsApp. Es la única superficie de Paydesk sin sesión, y lo único que ve ahí es su propio vale — ver "Vale de un solo uso" más abajo.

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

## Vale de un solo uso

La tienda tenía que creerle a un WhatsApp que el cliente estaba aprobado y por cuánto. Un mensaje así se fabrica con un screenshot, así que la validación del saldo autorizado pasa a ser un **vale**: un código de 10 dígitos, impreso como código de barras, que el cliente presenta en el mostrador y que la caja valida contra Paydesk.

### Por qué un código corto

El código **no es un secreto criptográfico, y no necesita serlo**: validarlo exige una sesión de tienda ya autenticada, así que nadie puede ir probando números sin ser antes una tienda dada de alta, y cada intento fallido queda registrado con su tienda. Eso permite que sea corto y tecleable, que es el requisito real del mostrador: cuando la pistola falla o el cliente solo trae el número apuntado, alguien lo escribe a mano.

Son 10 dígitos y no otra cantidad porque tienen que ser **pares**: el vale se imprime como Code 128 en subset C, que codifica los dígitos de dos en dos. Y es Code 128 1D, no QR, porque es lo que leen las pistolas láser que las tiendas ya tienen en la caja — una pistola se comporta como teclado, así que escanear es teclear el número en el campo, sin integración con su hardware.

El **token de la URL** (`/vale/:token`) es harina de otro costal: ese sí es lo único que protege la página del cliente, que se abre sin sesión desde un link de WhatsApp, y por eso son 128 bits no enumerables. Código y token son cosas distintas a propósito.

### Leer no es usar

Son dos operaciones separadas, y de ahí sale la señal antifraude:

- **`validarVale`** dice si el código sirve y por cuánto, sin consumirlo. La tienda puede consultarlo las veces que necesite.
- **`confirmarDisposicion`** es el paso que lo quema, y pide el **monto realmente vendido** — que puede ser menor al autorizado, nunca mayor. Ese dato es el que hoy no existe: cuándo se gastó el crédito y cuánto.

Toda lectura queda en la bitácora (`paydesk_vales/{codigo}/lecturas`), incluidas las fallidas. Por eso la caja ve "ya se leyó 2 veces": si alguien fabricó una captura del vale y la pasea por varias tiendas, la segunda caja lo nota antes de entregar material. Un intento contra un código que no existe no tiene vale al que colgarse, así que va a `paydesk_vale_intentos`.

El consumo va en transacción de Firestore porque dos cajas de la misma tienda pueden confirmar el mismo vale a la vez, y solo una debe ganar.

### Tres maneras de meter el código, porque no todas las tiendas tienen el mismo equipo

| Entrada | Cómo | Cuándo sirve |
|---|---|---|
| **Lector de la caja** | Se comporta como teclado (HID): teclea los dígitos en el campo. Cero integración con su hardware. El campo se reenfoca solo después de cada validación, y se valida solo al completar los diez dígitos en ráfaga — no todos los lectores mandan Enter al final, algunos mandan Tab y otros nada, según cómo estén configurados. | Siempre sobre papel. **Sobre la pantalla del cliente, solo si el lector es de imagen** (imager 2D o CCD, incluidos los de presentación con base); **una pistola láser no.** |
| **Cámara del celular o la tablet** de la tienda | `BarcodeDetector` nativo (Chrome/Edge) y ZXing como respaldo para Safari en iOS, cargado con `import()` dinámico para que su peso solo baje cuando alguien abre la cámara. | Es la salida para las tiendas con **pistola láser**, que no puede leer pantallas. |
| **Tecleado a mano** | 10 dígitos en dos grupos de cinco. | Siempre, con cualquier equipo y sin ninguno. Es la ruta que nunca falla. |

Una **pistola láser no lee la pantalla de un celular**: el láser mide luz reflejada de una superficie mate, y una pantalla emite luz propia y refleja el ambiente. No es un defecto del código — el Code 128 es correcto — sino del lector. Por eso la cámara no es un adorno: es lo que permite que una tienda con equipo viejo no tenga que cambiarlo.

El escaneo por cámara solo acepta resultados de 10 dígitos, así que una etiqueta cualquiera del mostrador no dispara nada, y valida solo al leer, sin pedir otro toque.

**Los lectores de presentación repiten.** Los de base, siempre encendidos, vuelven a decodificar el mismo código cada fracción de segundo mientras el celular siga enfrente. Eso es un acto físico, no diez, así que `registrarLectura` colapsa en una sola lectura todo lo que la misma cuenta pase con el mismo código dentro de un minuto (`MS_MISMA_LECTURA`). Sin eso, dejar el teléfono apoyado cinco segundos inflaría el contador y la próxima caja vería una alarma de fraude que nadie disparó — el contador antifraude solo sirve si cuenta ocasiones, no fotogramas. La marca que sostiene esa ventana (`ultimoAccesoEn`/`ultimoAccesoUid`) es aparte de `ultimaLecturaEn`, que es lo que ve la tienda dueña y no debe moverse porque otra tienda intentara leer un vale ajeno.

### Qué NO se le dice a la tienda

Cuando el código es de otra tienda, la respuesta no trae nada del vale — ni cliente, ni monto, ni de qué tienda es. Si lo dijera, cualquier tienda podría teclear códigos y mapear clientes y montos de la competencia. Es la misma regla que ya siguen los endpoints de subida, donde un deal inexistente y un deal ajeno responden idéntico.

El costo es que el cajero se queda sin saber a dónde mandar al cliente; se compensa con la salida "el cliente pide a Aviva que lo reasignen". Es un intercambio deliberado entre privacidad entre tiendas y comodidad en el mostrador.

### Cuándo nace y cuándo se reemite

El vale se emite en `syncDealWebhook`, en cuanto el deal trae **fecha de crédito liberado**. Se dispara por esa fecha y no por un id de etapa cableado porque `creditoLiberadoFecha` ya sabe leerse desde varias propiedades de HubSpot a la vez (ver `STAGE_DATE_EXTRA_PROPERTIES_DEFAULT` y `stageDate()`), así que un deal que llega a la etapa por otro camino — o que vive en el pipeline viejo — también dispara el vale, sin mantener una lista de ids en dos lugares.

`emitirValeParaDeal` es idempotente: el workflow puede volver a disparar todas las veces que quiera sin generar un segundo vale. Solo un admin puede **reemitir** (`/admin/vales`), y emitir el nuevo cancela el anterior en el mismo paso, así que un vale viejo que ande circulando deja de servir de inmediato. Deliberadamente la tienda no puede reemitir: si pudiera, podría generarse un vale sin el cliente presente, que es justo el fraude que esto cierra.

Un vale ya utilizado no se reemite — el crédito de ese deal ya se dispuso, y emitir otro sería emitir un vale por dinero ya entregado.

La **vigencia** (72 horas por defecto) se edita desde `/admin/vales`, mismo patrón de caché-por-instancia que el diccionario de campos.

### Cómo le llega al cliente

`syncDealWebhook` escribe el código y la URL del vale de vuelta en el deal (`codigo_paydesk`, `link_codigo_paydesk`), y un workflow de HubSpot manda esa liga **por WhatsApp**. Paydesk no manda el mensaje: HubSpot ya tiene ese canal.

### Qué escribe Paydesk en HubSpot, y qué NO

Son tres propiedades, y la lista corta es deliberada.

| Propiedad | Cuándo |
|---|---|
| `codigo_paydesk` | Al emitir. Los 10 dígitos con su espacio, para que soporte los vea sin abrir Paydesk. |
| `link_codigo_paydesk` | Al emitir. Es la que el workflow lee para mandar el WhatsApp. |
| `codigo_paydesk_estatus` | `Emitido` al emitir, `Utilizado` al confirmar. |

Los valores del desplegable viven en `VALE_ESTADO_HUBSPOT` y tienen que coincidir **exactamente** con los valores internos de las opciones en HubSpot. La opción `Error` existe en el desplegable pero Paydesk nunca la escribe: está reservada para marcar a mano un caso atorado.

Dos cosas que Paydesk **no** escribe, y por qué:

- **La fecha de disposición.** Ya la estampa HubSpot solo cuando el deal entra a la etapa de disposición (`disposicionCreditoFecha` → `hs_v2_date_entered_1341580183`). Esas propiedades son calculadas y rechazan escrituras; intentarlo no solo fallaría, tumbaría la llamada entera — `updateDealProperties` manda todas las propiedades de una confirmación en un solo `update`. El camino es al revés: Paydesk escribe `Utilizado`, un workflow reacciona y mueve la etapa, y HubSpot pone la fecha.
- **El monto dispuesto.** El monto de la compra ya vive en `monto_de_compra_construrama`, que la tienda captura con la cotización, y **no es el mismo número**: la cotización puede ser mayor que el crédito. Escribir encima lo corrompería. El monto realmente dispuesto se guarda en el vale y se ve en `/admin/vales`; si algún día hace falta en el CRM, va en una propiedad nueva y dedicada.

### Rutas y colecciones nuevas

| Ruta | Quién |
|---|---|
| `/vale/:token` | El cliente final, sin sesión. La única pantalla de Paydesk sin login. |
| `/solicitudes/validar` | La caja de la tienda. |
| `/admin/vales` | Aviva: consultar, reemitir y fijar la vigencia. |

`paydesk_vales/{codigo}` (el código es el id del documento, así que la búsqueda de la caja es un `get` directo), su subcolección `lecturas`, y `paydesk_vale_intentos`. Ninguna se lee desde el cliente: todo pasa por Cloud Functions — si la colección fuera legible, una tienda podría enumerar los vales de otras.

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
| **Tiendas** (`/admin/tiendas`) | Catálogo de las ~481 tiendas, que aparecen solas conforme llegan deals. Renombrar (de `#0046 - TEQ CR` al nombre real), invitar o quitar correos con acceso, y fijar su fecha de arranque individual. Desde la vista de una tienda (`/admin/tiendas/:concesionarioId`) un admin también puede ver los archivos de cotización/comprobante de cada solicitud y reemplazarlos si la tienda subió el incorrecto (`adminUploadCotizacion`/`adminUploadComprobante` — mismo write-back que usa la tienda, gateado por el claim `admin` en vez de por `concesionarioIds`). |
| **Diccionario de campos** (`/admin/diccionario`) | Mapeo de cada dato de Paydesk a su propiedad interna de HubSpot, editable sin desplegar. |
| **Fechas de etapa** (`/admin/etapas-fecha`) | Para cada una de las cinco fechas de hito (`fechaSolicitud`, `estatusKyc`, `creditoLiberadoFecha`, `disposicionCreditoFecha`, `desembolsoFecha`), lista editable de propiedades adicionales de HubSpot donde esa fecha pudiera vivir, más allá de la propiedad del diccionario de campos — un deal puede alcanzar la misma etapa por más de un camino en HubSpot. Se revisan en orden, la primera con valor gana (ver `hubspot/deals.ts`, `stageDate()`). Vive en Firestore (`paydesk_config/stage_date_properties`), mismo patrón de caché-por-instancia que el diccionario de campos. |
| **Administradores** (`/admin/administradores`) | Otorgar o revocar el acceso al panel, y ver el historial de quién se lo dio a quién y cuándo. |

### Gestión de administradores (`/admin/administradores`)

Otorgar acceso (`adminCreateAdmin`) busca la cuenta de Firebase Auth por correo y, si no existe, la crea sin contraseña — la persona entra después con "Continuar con Google" usando ese mismo correo, que Firebase enlaza automáticamente porque la cuenta recién creada no tiene ningún proveedor de inicio de sesión todavía. Luego pone el claim `admin: true`.

Revocar acceso (`adminRevokeAdmin`) pone el claim en `false`. Un admin no puede revocarse a sí mismo — es la manera de evitar que alguien se quede sin poder entrar por error; si de verdad hace falta quitarle el acceso al último admin activo, hay que hacerlo con el mismo comando de Admin SDK que se usa para dar de alta al primero.

Dos colecciones de Firestore respaldan esta pantalla, ambas de solo lectura/escritura desde las Cloud Functions (igual que el resto — ver `firestore.rules`):

- `paydesk_admins/{uid}` — el roster actual: correo, nombre, quién lo otorgó y cuándo, y `revokedAt` (null mientras está activo).
- `paydesk_admin_audit/{id}` — bitácora de auditoría, un documento por cada alta o baja, nunca se edita ni se borra.

Ninguna de las dos es la fuente de verdad de quién es admin — esa sigue siendo el custom claim en el token de Firebase Auth, que es lo único que valida `assertAdmin()`. Son el registro de lectura para la UI y el historial; si alguna vez quedaran desincronizadas del claim (por ejemplo, alguien corrió `setCustomUserClaims` a mano sin pasar por estas funciones), lo que manda para efectos de acceso sigue siendo el claim.

El diccionario vive en `paydesk_config/field_dictionary` y `config/fields.ts` queda como **valores por defecto**: cualquier campo que el documento no defina cae al valor del código, así que agregar un campo nuevo en código no rompe un deployment cuyo documento es anterior. Se cachea por instancia de Cloud Function (cada sync lo necesita y cambia dos veces al año), pero **con caducidad de un minuto** (`TTL_CONFIG_MS`), y las pantallas de admin leen siempre fresco, saltándose el caché.

Las dos cosas juntas arreglan algo que parecía un bug de guardado. En Cloud Functions v2 **cada función es su propio servicio**, con su propio proceso: cuando `adminSetFieldDictionary` limpiaba su caché, lo limpiaba en un proceso que no es el que atiende `adminGetFieldDictionary`. El admin guardaba, recargaba la pantalla, y le seguían saliendo los valores viejos —a veces por horas, hasta que esa instancia se reciclara— aunque el dato sí estuviera guardado en Firestore. Lo que mentía era la lectura, no la escritura. Mismo patrón y misma corrección en etiquetas, fechas de etapa, rollout y vigencia del vale.

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
| Firebase Storage | Copia canónica de cada archivo subido (cotización/comprobante) — es a donde apunta "Ver archivo" en Paydesk. Ver `storage/dealFiles.ts` y la nota en `storage.rules`. |
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
3. La función valida la sesión, que el deal exista **y que pertenezca a la tienda que llama**, y sube el archivo a **dos lugares en paralelo**: HubSpot Files (para que el equipo de Aviva lo vea sin salir del CRM) y Cloud Storage (la copia que sirve Paydesk). Cada copia tiene su propia liga y cada una va a un destino distinto: la de HubSpot Files se escribe en la propiedad del deal (`updateDealProperties`); la de Storage se guarda en Firestore vía `patch` (`patchDealFields`), que es lo que el listener en tiempo real refleja de inmediato y lo que "Ver archivo" abre en Paydesk. Un admin puede reemplazar el archivo de una tienda desde `/admin/tiendas/:concesionarioId` con el mismo flujo (`adminUploadCotizacion`/`adminUploadComprobante`, gateado por el claim `admin` en vez de por dueño de la tienda).

## Pendientes conocidos

- Diccionario de campos real — se puede capturar desde `/admin/diccionario` o en `config/fields.ts`. Incluye el nombre interno de la propiedad "Kiosco". Las tres del vale ya están mapeadas.
- Crear el workflow de HubSpot que manda la liga del vale por WhatsApp cuando `link_codigo_paydesk` se llena, y confirmar a qué teléfono del cliente le llega.
- Crear el workflow que mueve el deal a la etapa de disposición cuando `codigo_paydesk_estatus` pasa a `Utilizado`. Sin él, la fecha de disposición nunca se estampa y se pierde el dato de cuándo se gastó el crédito.
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
