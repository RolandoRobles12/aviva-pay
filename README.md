# Aviva Pay Desk

Portal para el concesionario (tienda de Construrama): entra con su código de tienda y NIP, ve a los clientes de su tienda con el avance de cada solicitud de crédito, y sube la cotización y el comprobante de entrega firmado. Los datos vienen de HubSpot y lo que captura la tienda se escribe de vuelta ahí.

Incluye un panel de administración para el equipo de Aviva: catálogo de tiendas (nombres, códigos, NIPs) y diccionario de campos de HubSpot.

Ver el requerimiento completo en [`docs/requerimiento.md`](docs/requerimiento.md) y las decisiones de arquitectura en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Estado

Scaffold del proyecto. **El diccionario de campos de HubSpot todavía no está listo** — todos los nombres de propiedades usados hoy son placeholders (`TODO_*`). Se pueden capturar desde el panel (`/admin/diccionario`) o en [`functions/src/config/fields.ts`](functions/src/config/fields.ts), que es el valor por defecto. El resto del código ya está conectado a ese mapa.

## Estructura

```
functions/   Cloud Functions (TypeScript) — sync con HubSpot, API de lectura, uploads
web/         Frontend React + Vite — portal de tiendas y panel /admin
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

Rutas:

- `/` — login de la tienda (código + NIP)
- `/solicitudes` — tabla de clientes de la tienda
- `/admin` — login del equipo de Aviva; `/admin/tiendas` y `/admin/diccionario`

Para probar en local hace falta al menos una tienda en el emulador (`paydesk_concesionarios`) con NIP generado, y una cuenta de admin con el claim `admin` — ver `docs/ARCHITECTURE.md`.

## Variables de entorno

Ver `functions/.env.example` y `web/.env.example`. Ninguna se commitea con valores reales.

## Deploy

```bash
firebase use <project-id>          # ver .firebaserc.example para los alias sugeridos
npm run build:web
firebase deploy --only hosting,functions,firestore:rules,storage
```

Pendiente antes de producción: private app de HubSpot dedicado, cuentas de admin, entrega de NIPs a las tiendas y dominio propio (`pay.avivacredito.com`) — ver "Pendientes conocidos" en `docs/ARCHITECTURE.md`.
