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

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `PORT` | Server port | Required |
| `JWT_SECRET` | JWT signing secret | dev-secret (change in prod!) |
| `ADB_SIMULATION` | Enable ADB mock mode | `false` |
| `ADB_TIMEOUT_MS` | Timeout for ADB commands | `10000` |

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

## Credenciales Demo

Tras ejecutar el seed:
- **Admin**: admin@demo.com / admin1234
- **Operador**: operador@demo.com / operator1234
- **Tenant**: Empresa Demo
- **Dispositivos**: 3 TVs simulados (192.168.1.100-102)

## Seguridad

- JWT con expiración de 7 días
- Middleware valida tenant_id en cada request (aislamiento multi-tenant)
- Sanitización de IPs y package names antes de ejecutar ADB
- Rate limiting: 20 req/15min en auth, 200 req/min en API, 30 req/10s en comandos
- Roles: admin puede gestionar usuarios, operador solo puede controlar dispositivos

## Activar ADB en Android TV

1. En el Android TV, ir a **Configuración → Acerca del dispositivo**
2. Pulsar **Build** 7 veces para activar opciones de desarrollador
3. Ir a **Opciones de desarrollador → Depuración ADB** → Activar
4. Anotar la IP del TV en **Configuración → Red**
5. Conectar con: `adb connect <IP_TV>`
6. Registrar el dispositivo en la plataforma con esa IP

## Deploy en Replit

El servidor usa `process.env.PORT` para el puerto y `process.env.DATABASE_URL` para la BD. Asegúrate de configurar `JWT_SECRET` en producción con un valor seguro y aleatorio.
