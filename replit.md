# MDM Platform - Mobile Device Management para Android TV

## Overview

Plataforma MDM (Mobile Device Management) completa tipo SaaS multiempresa para gestión de dispositivos Android TV. Arquitectura multi-tenant con aislamiento completo por empresa.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 + HTTP Server
- **Database**: PostgreSQL + Drizzle ORM
- **Validación**: Zod (v3), drizzle-zod
- **Auth**: JWT (jsonwebtoken + bcryptjs)
- **WebSockets**: Socket.io
- **Rate limiting**: express-rate-limit
- **Cron jobs**: node-cron
- **Build**: esbuild (CJS bundle)
- **API codegen**: Orval (from OpenAPI spec)

## Artifacts

- **API Server** (`artifacts/api-server`) — Backend Express con WebSockets, ADB, multi-tenant
- **MDM Dashboard** (`artifacts/dashboard`) — React+Vite web dashboard (previewPath `/`, port 23183)
- **MDM Mobile** (`artifacts/mobile`) — Expo React Native app (previewPath `/mobile/`, port 18115)
- **Canvas** (`artifacts/mockup-sandbox`) — Sandbox para prototipos UI

## Dashboard (Web Frontend)

Stack: React + Vite + Tailwind CSS + Radix UI + TanStack Query + wouter

- **Auth**: `setAuthTokenGetter(() => localStorage.getItem("mdm_token"))` in `main.tsx` wires auth token to all API hooks
- **API hooks**: imported from `@workspace/api-client-react` (Orval-generated from OpenAPI spec)
- **WebSocket**: `src/lib/socket.ts` — connects to `window.location.origin` with path `/socket.io`
- **Routing**: wouter with `base={import.meta.env.BASE_URL}`
- **Pages**: `/login`, `/register`, `/dashboard`, `/devices`, `/devices/:id`, `/logs`, `/users` (admin), `/schedule`
- **Theme**: dark control-room aesthetic (cyan/teal accent, dark navy background)

### Dashboard Pages
- `/login` & `/register` — JWT auth flows
- `/dashboard` — fleet overview with device stats, recent logs
- `/devices` — searchable device list, CRUD modals
- `/devices/:id` — device detail, ADB command panel, real-time logs via WebSocket
- `/logs` — tenant-wide audit log table
- `/users` — user management (admin only)
- `/schedule` — cron-based scheduled tasks CRUD

## Mobile App (Expo React Native)

Stack: Expo SDK 54 + expo-router + TanStack Query + socket.io-client + AsyncStorage

- **Auth**: JWT stored in `AsyncStorage` (key `mdm_token`). `setAuthTokenGetter` and `setBaseUrl` configured at module level in `app/_layout.tsx`. Token getter supports async (returns Promise).
- **Routing**: expo-router file-based routing. Auth redirect in `AuthRedirect` component using `useSegments` + `router.replace`.
  - `/(auth)/login` — Login screen (unauthenticated)
  - `/(tabs)/` — Device list with live WebSocket status
  - `/(tabs)/device/[id]` — Physical-remote-style control screen
- **WebSocket**: `socket.io-client` connects to `https://${EXPO_PUBLIC_DOMAIN}` path `/socket.io`, auth `{ token }`, `transports: ['websocket']`. Listens to `device:status` events.
- **Remote control keycodes**: UP=19, DOWN=20, LEFT=21, RIGHT=22, OK=23, Vol+=24, Vol-=25, Menu=82
- **Theme**: Dark navy matching dashboard — background `#0d1319`, primary teal `#22c3b5`, card `#121e2c`
- **Key files**:
  - `contexts/AuthContext.tsx` — JWT auth provider
  - `app/_layout.tsx` — Root layout with setBaseUrl, setAuthTokenGetter, AuthProvider
  - `app/(tabs)/index.tsx` — Device list + socket.io live status
  - `app/(tabs)/device/[id].tsx` — Remote control (D-pad, volume, power, apps)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `cd artifacts/api-server && node --enable-source-maps ./dist/seed.mjs` — seed demo data

## Database Schema

Tablas principales con `tenant_id` en todas las entidades de negocio:
- `tenants` — empresas/organizaciones
- `users` — usuarios con roles admin/operator
- `devices` — dispositivos Android TV con status online/offline
- `commands` — historial de comandos ADB ejecutados
- `apps` — apps instaladas por dispositivo
- `logs` — logs de auditoría en tiempo real
- `scheduled_tasks` — tareas cron programadas

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes (auto-provisioned by Replit) |
| `PORT` | Server port (dev server only) | Yes (auto-assigned by Replit) |
| `JWT_SECRET` | JWT signing secret — must be a long random string in production | Yes |
| `ADB_SIMULATION` | Set `true` for mock ADB (no real TV needed), `false` for real devices | Default: `true` in dev |
| `ADB_TIMEOUT_MS` | ADB command timeout in milliseconds | Default: `10000` |

## API Endpoints

### Auth
- `POST /api/auth/login` — Login con email/password → JWT
- `POST /api/auth/register` — Registro + creación de tenant
- `GET /api/auth/me` — Perfil del usuario autenticado

### Devices
- `GET /api/devices` — Listar dispositivos del tenant
- `POST /api/devices` — Registrar dispositivo
- `GET /api/devices/:id` — Detalle del dispositivo
- `PUT /api/devices/:id` — Actualizar dispositivo
- `DELETE /api/devices/:id` — Eliminar dispositivo
- `POST /api/devices/:id/ping` — Verificar conectividad ADB

### Commands (ADB)
- `POST /api/devices/:id/command` — Enviar comando ADB
  - Acciones: `screen_toggle`, `home`, `back`, `reboot`, `open_app`, `install_apk`, `uninstall_app`, `sync_apps`, `keyevent`, `kiosk_enable`
- `GET /api/devices/:id/commands` — Historial de comandos

### Apps & Logs
- `GET /api/devices/:id/apps` — Apps instaladas
- `GET /api/devices/:id/logs` — Logs del dispositivo
- `GET /api/logs` — Todos los logs del tenant

### Users (Admin only)
- `GET /api/users` — Listar usuarios
- `POST /api/users` — Crear usuario
- `DELETE /api/users/:id` — Eliminar usuario

### Scheduled Tasks
- `GET /api/scheduled-tasks` — Listar tareas
- `POST /api/scheduled-tasks` — Crear tarea (cron expression)
- `PUT /api/scheduled-tasks/:id` — Actualizar tarea
- `DELETE /api/scheduled-tasks/:id` — Eliminar tarea

## WebSocket Events (Socket.io)

El cliente se conecta con `{ auth: { token: "<JWT>" } }` al path `/socket.io`.

Rooms:
- `tenant:<tenantId>` — Eventos de todo el tenant
- `device:<deviceId>` — Eventos específicos de un dispositivo

Eventos emitidos por el servidor:
- `device:status` — Cambio de estado online/offline `{ deviceId, status, lastSeen }`
- `device:log` — Nuevo log en tiempo real `{ deviceId, message, level, timestamp }`
- `command:result` — Resultado de comando ADB `{ commandId, deviceId, action, status, response }`
- `device:alert` — Alerta de dispositivo desconectado `{ deviceId, deviceName, message, timestamp }`

## Modo Simulación ADB

Para desarrollo sin TVs reales, establece `ADB_SIMULATION=true`. El servidor simulará respuestas ADB incluyendo una lista de apps de ejemplo (YouTube TV, Netflix, Disney+, etc.).

- **Separación dev/prod**: `ADB_SIMULATION=true` en development, `false` en production (vía env vars y `artifact.toml`).
- **Indicador visual**: El dashboard muestra un banner ámbar cuando el modo simulación está activo y un badge verde "ADB Real" en la barra lateral cuando está desactivado. El dato proviene de `GET /api/healthz` → campo `adbMode`.
- **URL de inscripción QR**: Generada dinámicamente con `req.protocol + req.get("host")` — funciona correctamente tanto en dev (`.replit.dev`) como en producción (`.replit.app`).

## Credenciales Demo

Tras ejecutar el seed:
- **Admin**: admin@demo.com / admin1234
- **Operador**: operador@demo.com / operator1234
- **Tenant**: Empresa Demo
- **Dispositivos**: 3 TVs simulados (192.168.1.100-102)

## Seguridad

- JWT con expiración de 7 días
- Middleware valida tenant_id en cada request (aislamiento multi-tenant)
- Express `trust proxy` habilitado — necesario detrás del reverse proxy de Replit para que express-rate-limit funcione correctamente
- Sanitización de IPs y package names antes de ejecutar ADB
- Rate limiting: 20 req/15min en auth, 200 req/min en API, 30 req/10s en comandos
- Roles: admin puede gestionar usuarios, operador solo puede controlar dispositivos
- CORS configurado con `credentials: true` (origin reflectivo) — seguridad via JWT Bearer token

## Activar ADB en Android TV

1. En el Android TV, ir a **Configuración → Acerca del dispositivo**
2. Pulsar **Build** 7 veces para activar opciones de desarrollador
3. Ir a **Opciones de desarrollador → Depuración ADB** → Activar
4. Anotar la IP del TV en **Configuración → Red**
5. Conectar con: `adb connect <IP_TV>`
6. Registrar el dispositivo en la plataforma con esa IP

## Deploy en Producción (Replit)

### Requisitos previos
1. **JWT_SECRET**: Crear un secreto en Replit Secrets con un valor aleatorio largo (mínimo 32 caracteres). El servidor lanzará un error al iniciar si falta.
2. **DATABASE_URL**: Automáticamente provisto por Replit al publicar.
3. **ADB_SIMULATION**: Mantener `true` hasta tener TVs reales conectadas. Cambiar a `false` y configurar las IPs reales de los dispositivos en la BD.

### Tipo de despliegue: VM (Always Running)
Esta plataforma **requiere** tipo de despliegue **VM** (no Autoscale) porque:
- Socket.io mantiene conexiones WebSocket persistentes que se pierden con Autoscale
- El heartbeat de dispositivos (cada 60s) necesita un proceso permanente
- Los cron jobs de tareas programadas viven en memoria y se perderían al escalar

Al publicar, en la sección **Advanced** del panel de publicación, seleccionar **VM (Always Running)**.

### Pasos para publicar
1. Verificar que todos los workflows estén corriendo sin errores
2. En el panel lateral, hacer clic en **Publish**
3. En la sección Advanced, seleccionar **VM** como tipo de despliegue
4. Confirmar que `JWT_SECRET` está configurado en Replit Secrets
5. Hacer clic en **Deploy**

La plataforma quedará disponible en `https://<nombre>.replit.app`.

### ADB en producción con TVs reales
1. `ADB_SIMULATION=false` ya está configurado automáticamente en el entorno de producción (env var + artifact.toml). No requiere acción adicional.
2. El dashboard mostrará el badge **"ADB Real"** en la barra lateral cuando el servidor esté en modo real.
3. Los TVs deben tener ADB habilitado (ver sección "Activar ADB en Android TV") y puerto 5555 accesible desde el servidor.
4. Para despliegues cloud: los TVs deben estar en la misma red que el servidor, o conectados por VPN.
5. El binario `adb` está instalado en el entorno Nix (`android-tools` v35.0.1).

### Endpoint de salud
`GET /api/healthz` → `{ status, adbMode: "simulation"|"real", version }` — usado por el dashboard para mostrar el indicador de modo.
