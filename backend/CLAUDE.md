# Backend — API REST

Node 22 + Express 5 + TypeScript + Prisma + PostgreSQL. Se despliega en Railway con Root Directory `backend`.

## Comandos

```bash
pnpm dev            # tsx watch src/server.ts
pnpm build          # tsc → dist/
pnpm start          # node dist/server.js (Railway)
pnpm test           # vitest run (usa DATABASE_URL de .env.test)
pnpm test:watch
pnpm typecheck      # tsc --noEmit
pnpm lint
pnpm prisma migrate dev --name <nombre>
pnpm prisma studio
```

En Railway, el comando de despliegue corre `pnpm prisma migrate deploy` antes de `pnpm start`.

## Estructura

```
backend/
├── prisma/
│   ├── schema.prisma
│   └── migrations/          # las restricciones SQL de specs 8.3 se agregan a mano en la migración
├── src/
│   ├── server.ts            # arranque (puerto)
│   ├── app.ts               # crea la app Express (sin listen) — lo importan las pruebas
│   ├── config/env.ts        # variables de entorno validadas con Zod al arrancar
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── auth.ts          # configuración de Better Auth
│   │   ├── mailer.ts        # Resend; en dev/test registra el correo en consola o en memoria
│   │   └── tiempo.ts        # utilidades de zona horaria America/Monterrey
│   ├── domain/              # lógica pura, sin Express ni Prisma
│   │   ├── horas.ts         # cálculo de minutos acreditables, tope diario, fecha estimada
│   │   └── horas.test.ts
│   ├── middleware/          # requireSession, requireRol, requireOficina, errorHandler
│   └── modules/
│       └── <modulo>/        # instituciones, expedientes, asistencias, semanas, validacion, panel, importaciones, reportes
│           ├── <modulo>.routes.ts
│           ├── <modulo>.service.ts
│           ├── <modulo>.schemas.ts
│           └── <modulo>.test.ts
└── test/
    ├── setup.ts             # limpia tablas entre pruebas
    └── factories.ts         # crearAlumno(), crearExpediente(), etc.
```

Las rutas solo validan entrada (Zod) y llaman al servicio. La lógica de negocio vive en servicios y en `domain/`.

## Better Auth

- Adaptador de Prisma. Mantén los modelos que Better Auth necesita (`User`, `Session`, `Account`, `Verification`); el adaptador usa el nombre del modelo, así que las tablas siguen nuestra convención (`users`, `sessions`, `accounts`, `verifications`). El `Usuario` de las specs se mapea a la tabla `users` con campos adicionales (`rol`, `oficina`, `plantelId`, `debeCambiar`).
- Plugin `username` para que el alumno inicie sesión con su **número de control**; vinculación entra con correo.
- Plugin de administración o lógica propia para que vinculación restablezca contraseñas (RF-04).
- Monta el manejador con `toNodeHandler(auth)` en `/api/auth/*` **antes** de `express.json()`.
- Cookies httpOnly, `secure` en producción, sesión de 30 días (RF-03). Configura `trustedOrigins` con el dominio de Vercel.
- La activación de cuenta (RF-02) solo funciona para números de control ya importados; no hay registro abierto.

## Correo (Resend)

- Solo se usa para los enlaces de validación del supervisor (RF-21, RF-21a).
- Todo envío pasa por `lib/mailer.ts`. En pruebas, el mailer guarda los correos en memoria para poder verificarlos.
- Los tokens de los enlaces se guardan con hash y expiran a los 14 días.

## Base de datos

- Convención de nombres en PostgreSQL: minúsculas y snake_case para todo identificador (tablas, columnas, tipos enum, índices, restricciones); tablas en plural. Los modelos de Prisma conservan su nombre y se mapean con `@map` / `@@map`. En `$queryRaw` usa los nombres de la base (`users`, `plantel_id`), no los del modelo.
- El esquema parte de specs 8.2. Las restricciones de 8.3 (`EXCLUDE` contra traslapes, `CHECK`, índices parciales) se agregan editando el SQL de la migración; no se pueden declarar en `schema.prisma`.
- Para consultas de totales o reportes complejos usa `prisma.$queryRaw` o TypedSQL.
- Toda escritura importante registra un `AuditLog` (RF-29), dentro de la misma transacción.

## Pruebas

- `domain/horas.ts` se escribe **primero** y con pruebas exhaustivas: turno menor a 15 min (RN-09), tope de 390 min (6 h 30 min) por día con varios turnos (RN-04), turno que cruza medianoche, turno abierto cerrado a las 23:59 (RN-08), fecha estimada con menos de 5 días de datos (RN-16).
- Las pruebas de rutas usan Supertest sobre `app.ts` y una base real de prueba (`app_test`), no mocks de Prisma. Así se prueban también las restricciones SQL.
- Fija la hora con `vi.useFakeTimers()` / `vi.setSystemTime()` en pruebas que dependen de la fecha.
- Cada prueba crea sus propios datos con `test/factories.ts`.

## Variables de entorno (`.env.example`)

```
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=            # URL pública por donde entra el navegador (dominio de Vercel)
FRONTEND_ORIGIN=
RESEND_API_KEY=
MAIL_FROM=
APP_TIMEZONE=America/Monterrey
PORT=3000
```
