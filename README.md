# Aviva Pay Desk

Página de estatus sin login para el concesionario de una solicitud de crédito Aviva: muestra el avance del deal en HubSpot y permite subir la cotización y el comprobante de entrega, con escritura de vuelta hacia HubSpot.

Ver el requerimiento completo en [`docs/requerimiento.md`](docs/requerimiento.md) y las decisiones de arquitectura en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Estado

Scaffold inicial del proyecto. **El diccionario de campos de HubSpot todavía no está listo** — todos los nombres de propiedades usados hoy son placeholders (`TODO_*`) centralizados en [`functions/src/config/fields.ts`](functions/src/config/fields.ts). El resto del código (sync, lectura, escritura) ya está conectado a ese mapa, así que integrarlo debería ser cuestión de reemplazar esos valores.

## Estructura

```
functions/   Cloud Functions (TypeScript) — sync con HubSpot, API de lectura, uploads
web/         Frontend React + Vite — página /d/:dealId
docs/        Requerimiento y notas de arquitectura
firestore.rules, firestore.indexes.json, storage.rules, firebase.json
```

## Stack

React + Firebase Hosting · Cloud Functions · Firestore · Firebase Storage · HubSpot API (private app dedicado).

## Desarrollo local

Requiere Node 20 y el [Firebase CLI](https://firebase.google.com/docs/cli).

```bash
npm install                 # instala functions/ y web/ (workspaces)

# Backend
cp functions/.env.example functions/.env   # y llena las variables
npm run emulators                          # Firestore + Functions + Storage emulators

# Frontend
cp web/.env.example web/.env               # config del Firebase Web SDK
npm run dev:web
```

Abre `http://localhost:5173/d/<dealId>` con un `dealId` que ya exista en el emulador de Firestore (colección `paydesk_deals`).

## Variables de entorno

Ver `functions/.env.example` y `web/.env.example`. Ninguna se commitea con valores reales.

## Deploy

```bash
firebase use <project-id>          # ver .firebaserc.example para los alias sugeridos
npm run build:web
firebase deploy --only hosting,functions,firestore:rules,storage
```

Pendiente antes de producción: private app de HubSpot dedicado, dominio propio (`pay.avivacredito.com`) y validación de seguridad — ver la sección "Pendientes conocidos" en `docs/ARCHITECTURE.md`.
