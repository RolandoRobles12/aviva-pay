# Aviva Paydesk

El portal donde Aviva y las tiendas aliadas (hoy Construrama) siguen y comprueban cada crédito de mejora de vivienda, desde la aprobación hasta la entrega del material.

- **La tienda** ve a sus clientes y en qué etapa va cada crédito, sube la cotización y el comprobante de entrega firmado, y en caja valida el código de un solo uso del cliente antes de entregarle material.
- **Aviva** recibe cada documento verificado automáticamente con Claude; lo sospechoso queda en revisión para un administrador y se avisa en Slack. Todo se escribe de vuelta en HubSpot, que es la fuente de verdad.
- **El panel de administración** maneja tiendas y sus usuarios, revisión de documentos, vales, métricas por tienda y configuración sin desplegar (etapas, campos de HubSpot, verificación, notificaciones), con dos roles: super admin y operador.

Ver el requerimiento original en [`docs/requerimiento.md`](docs/requerimiento.md) y el diseño actual en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Estructura

```
functions/   Cloud Functions (TypeScript): sync con HubSpot, verificación de documentos,
             vales, avisos de Slack, tareas programadas, API de lectura y panel
  test/      Pruebas (Vitest)
  scripts/   calibrar.ts: mide la verificación contra documentos reales
web/         Frontend React + Vite: portal de tiendas, página del vale y panel /admin
  test/      Pruebas (Vitest)
docs/        Requerimiento y arquitectura
.github/     CI: tipos, pruebas y build en cada PR
firestore.rules, firestore.indexes.json, storage.rules, firebase.json
```

## Stack

React + Firebase Hosting · Cloud Functions · Firestore · Firebase Storage · Firebase Auth · HubSpot API · Claude (API de Anthropic) · Slack.

## Desarrollo local

Requiere Node 20 y el [Firebase CLI](https://firebase.google.com/docs/cli).

```bash
npm install                 # instala functions/ y web/ (workspaces)

# Backend
cp functions/.env.example functions/.env   # y llena las variables
npm run emulators                          # Firestore + Functions + Storage

# Frontend
cp web/.env.example web/.env               # config del Firebase Web SDK
npm run dev:web

# Antes de abrir un PR
npm run typecheck
npm test
```

Rutas:

- `/` — login de la tienda (correo y contraseña)
- `/solicitudes` — clientes de la tienda; `/solicitudes/validar` valida el vale en caja; `/solicitudes/canceladas` y `/solicitudes/reporte`
- `/vale/:token` — el vale del cliente final, sin sesión (le llega por WhatsApp)
- `/admin` — panel de Aviva, con menú lateral (en celular, botón "Menú"). Empieza en **Inicio** (`/admin/inicio`), que resume lo que hay que atender.
  - Día a día (todos los admins): Revisión de documentos, Tiendas, Vales (buscar un vale / reporte) y Métricas.
  - Configuración (solo super admin): Verificación de documentos, Avisos en Slack, Etapas del crédito (incluye de dónde sale la fecha de disposición), Conexión con HubSpot (campos, fechas de etapa, cancelaciones y nombres de columnas), Administradores y Estado del sistema (estado e historial de cambios).

Los componentes y estilos del panel están en `web/src/components/admin/ui.tsx` y `web/src/styles/admin.css`; las pantallas nuevas deben armarse con ellos.

Para probar en local hace falta una cuenta de admin con el claim `admin` (ver "Alta de administradores" en `docs/ARCHITECTURE.md`) y una tienda con al menos un correo invitado.

## Variables de entorno y secretos

Ver `functions/.env.example` y `web/.env.example`. Ninguna se commitea con valores reales. En producción, los secretos de funciones van con `firebase functions:secrets:set`: `HUBSPOT_PRIVATE_APP_TOKEN`, `HUBSPOT_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY` y `SLACK_BOT_TOKEN`. Si falta uno, el despliegue de funciones falla.

## Deploy

```bash
firebase use <project-id>          # ver .firebaserc.example para los alias sugeridos
npm run build:web
firebase deploy --only hosting,functions,firestore:rules,storage
```

Después del primer despliegue con esta versión: correr "Migrar ligas y verificaciones" en `/admin/estado`, y en `/admin/etapas` → "Fecha de disposición del crédito" dar "Guardar y recalcular" una vez. Pendientes antes y después de producción en "Pendientes conocidos" de `docs/ARCHITECTURE.md`.
