# Aviva Pay Desk — Requerimiento de creación de proyecto

> Copia en Markdown del documento fuente (`Aviva_Pay_Desk_Requerimiento_1.docx`) para referencia rápida dentro del repo.

> **Aclaraciones posteriores** (el texto de abajo se conserva tal cual del documento fuente; estas correcciones son las que rigen la implementación — ver `docs/ARCHITECTURE.md`):
>
> 1. **Una página por concesionario, no por deal.** El texto original (secciones 2 y 3.1) describe "una página por deal". El mockup mostró que en realidad es una página por tienda de Construrama, con una tabla de varias filas: una por cliente/solicitud.
> 2. **El concesionario no es una company de HubSpot.** La sección 4 menciona "deals y companies"; en la práctica la tienda se identifica con una **propiedad del deal**, no con el objeto Company ni ningún otro objeto asociado.
> 3. **Aviva Pay todavía no existe.** La vista del cliente final aparece en los diagramas de proceso, pero este repo construye únicamente Pay Desk.

- **Autor:** Rolando Robles — Growth Ops Squad
- **Área:** Aviva Crédito (Aviva Financial S.A. de C.V.)
- **Relacionado con:** Aviva Embedded Finance Platform (Amran Frey)
- **Estado:** Borrador para revisión

## 1. Contexto

Aviva está formalizando el ciclo de crédito con aliados comerciales que no operan con un monedero digital propio (a diferencia de Cashi), hoy limitado a Construrama y Casa Marchand. El objetivo de fondo, descrito en la propuesta de Aviva Embedded Finance Platform, es mantener control end-to-end sobre la existencia, el gasto y la conciliación de los créditos otorgados a través de estos aliados.

Dentro de ese ciclo, hoy no existe una forma confiable de que el concesionario (la tienda o sucursal del aliado) consulte el estatus de una solicitud de crédito ni respalde el proceso de entrega. La validación actual del saldo autorizado se hace por WhatsApp/email, un mecanismo fácil de falsificar, y el respaldo de entrega de materiales dejó de gestionarse de forma estructurada.

Este documento define el requerimiento para construir Aviva Pay Desk: una vista para el concesionario que muestra el estatus de sus solicitudes de crédito y le permite subir la cotización y el comprobante de entrega, alimentada automáticamente desde HubSpot.

## 2. Objetivo del proyecto

Crear, para cada solicitud de crédito (deal en HubSpot), una página web accesible por el concesionario correspondiente, generada automáticamente cuando el deal se crea o cambia de estatus en HubSpot, sin que el concesionario necesite crear una cuenta ni iniciar sesión.

## 3. Alcance

### 3.1 Incluye

- Página web por deal con el layout definido en el mockup: cliente, fecha de solicitud, monto aprobado, estatus de KYC, cotización, crédito liberado, disposición del crédito, comprobante de entrega y desembolso del crédito.
- Módulo de subida de cotización (archivo PDF/imagen/XML, fecha de entrega acordada, monto total de la compra).
- Módulo de subida de comprobante de entrega (archivo, fecha de entrega, confirmación de firma del cliente).
- Sincronización automática de datos desde HubSpot hacia la página, disparada por workflow (creación de deal o cambio de stage).
- Escritura de vuelta hacia HubSpot: los archivos y datos capturados por el concesionario deben reflejarse en el deal correspondiente.
- Envío automático de la URL de la página al contacto del concesionario cuando esta se genera.

### 3.2 No incluye (descartado para este proyecto)

- Sistema de login o cuentas de usuario para los concesionarios.
- Uso de HubDB y páginas dinámicas de HubSpot como mecanismo de entrega — se descartó a favor de una plataforma nueva e independiente.
- Generación o administración manual de tokens de acceso.
- Vista del cliente final ("Aviva Pay" / vale de crédito) — queda fuera de este requerimiento y se aborda como proyecto separado.

## 4. Arquitectura propuesta

HubSpot se mantiene como fuente de verdad del negocio; el proyecto no migra ni duplica lógica de negocio fuera de HubSpot, solo expone una vista de lectura/escritura acotada para un público externo.

| Componente | Responsabilidad |
|---|---|
| HubSpot CRM | Fuente de verdad. Deals y companies con la información de la solicitud de crédito. |
| Workflow de HubSpot | Detecta la creación del deal o el cambio de stage/propiedad relevante y dispara la sincronización. |
| Cloud Functions (Firebase) | Recibe el disparo del workflow, sincroniza los datos hacia Firestore, expone el API que consume la página y escribe de vuelta hacia HubSpot (propiedades y archivos). |
| Firestore y Storage | Almacena los datos operativos que consume la página (solo las propiedades necesarias, no el deal completo) y los archivos subidos por el concesionario antes de enviarlos a HubSpot. |
| Aviva Pay Desk (React) | Aplicación en Firebase Hosting con una ruta dinámica por deal. Sin login: el identificador del deal en la URL determina qué información se muestra. |

## 5. Requerimientos funcionales

### 5.1 Vista principal (tabla de estatus)

Columnas a mostrar, reflejando el estado actual del deal en HubSpot:

- Cliente
- Fecha de solicitud
- Monto aprobado
- Estatus de KYC
- Cotización (estatus + acceso a subir si está pendiente)
- Crédito liberado
- Disposición del crédito
- Comprobante de entrega (estatus + acceso a subir si está pendiente)
- Desembolso del crédito

### 5.2 Módulo "Nueva cotización"

- Campo de carga de archivo (PDF, imagen o XML).
- Fecha de entrega acordada.
- Monto total de la compra.
- Al guardar, el archivo y los datos se asocian al deal en HubSpot y el estatus de la columna "Cotización" cambia a completado.

### 5.3 Módulo "Comprobante de entrega"

- Campo de carga de archivo (PDF o imagen).
- Fecha de entrega.
- Confirmación por checkbox de que el cliente firmó el documento de entrega.
- Al guardar, el archivo y los datos se asocian al deal en HubSpot y el estatus de la columna "Comprobante de Entrega" cambia a completado.

## 6. Requerimientos técnicos

- Stack: React + Firebase Hosting (frontend), Cloud Functions (backend/proxy), Firestore (datos operativos), Firebase Storage (archivos en tránsito antes de subirlos a HubSpot).
- Private app de HubSpot dedicado a este proyecto, con scopes acotados a lo estrictamente necesario (lectura/escritura de deals, asociaciones y files) — no reutilizar el token general (Ro_Bot) usado en los scripts batch existentes.
- La página nunca lee Firestore directo desde el cliente: toda lectura pasa por una Cloud Function que valida el identificador del deal y regresa solo los campos permitidos, para evitar que el frontend pueda enumerar o listar otros deals.
- Actualización en tiempo real en la página mediante listeners de Firestore, para reflejar cambios de estatus sin que el concesionario tenga que refrescar.
- Dominio propio para el proyecto (ej. pay.avivacredito.com), separado de los demás proyectos Firebase de Aviva.

## 7. Modelo de datos (Firestore)

Colección propuesta: `paydesk_deals` — un documento por deal, usando el `deal_id` de HubSpot como identificador del documento.

| Campo | Tipo | Origen |
|---|---|---|
| deal_id | string | HubSpot — dealId |
| cliente | string | HubSpot — propiedad de contacto/deal |
| fecha_solicitud | date | HubSpot — fecha de creación del deal |
| monto_aprobado | number | HubSpot — propiedad del deal |
| estatus_kyc | string | HubSpot — propiedad del deal |
| cotizacion_estatus / cotizacion_url | string | HubSpot — propiedad del deal / Files API |
| credito_liberado_fecha | date | HubSpot — propiedad del deal |
| disposicion_credito_fecha | date | HubSpot — propiedad del deal |
| comprobante_entrega_estatus / comprobante_url | string | HubSpot — propiedad del deal / Files API |
| desembolso_fecha | date | HubSpot — propiedad del deal |
| actualizado_en | timestamp | Generado por la Cloud Function en cada sincronización |

> **Nota:** los nombres de columna de esta tabla son las etiquetas propuestas en el requerimiento, no los nombres internos reales de las propiedades en HubSpot. El diccionario de campos real se está construyendo por separado y se integra en `functions/src/config/fields.ts` (ver `docs/ARCHITECTURE.md`).

## 8. Seguridad y control de acceso

No existe autenticación de usuarios. El control de acceso se basa en que el identificador del deal en la URL no es enumerable ni predecible de forma útil, y en que el backend nunca expone una operación de "listar todos los deals" al cliente. Toda lectura y escritura pasa por Cloud Functions autenticadas contra HubSpot con un private app de scopes acotados.

Queda pendiente de definir, junto con el equipo de seguridad/negocio, el nivel de exposición aceptable para este modelo (equivalente al de un link de factura o de cotización compartido por correo) antes de pasar a producción.

## 9. Integración con HubSpot

- **Trigger:** workflow de deal en el pipeline de Solicitudes, en creación y en cambios de stage/propiedades relevantes.
- **Acción del workflow:** paso de Custom code que llama al endpoint HTTPS de la Cloud Function de sincronización.
- **Escritura de vuelta:** Cloud Function usa el API de HubSpot (Files + Properties) para reflejar cotización y comprobante de entrega en el deal.
- **Notificación:** workflow adicional que envía la URL de la página al contacto del concesionario cuando el documento en Firestore se crea por primera vez.
