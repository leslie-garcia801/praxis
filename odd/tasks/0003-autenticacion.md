# 0003 — Autenticación y usuarios por oficina (backend)

| Campo | Valor |
| --- | --- |
| Estado | En progreso |
| Iteración | 1 (specs §14) |
| Specs | F-01, RF-02, RF-03, RF-04, RN-03b, RNF-05, RNF-06, RNF-07 |
| Proyecto | backend |

## Descripción

Configurar Better Auth en la API para que los alumnos entren con su número de control y vinculación con su correo, activar cuentas de alumnos ya importados (sin registro abierto), restablecer contraseñas desde vinculación y dejar listos los middlewares de sesión, rol y oficina que usarán todas las rutas siguientes.

## Checklist

### Configuración
- [x] Instalar `better-auth` (1.7.18)
- [x] Decidir el correo de los alumnos sin email: `<matrícula>@alumno.praxis.invalid` sin verificar; se reemplaza si el alumno da uno real (opción A)
- [x] Decidir el hash de contraseñas: `argon2` 0.45 (argon2id) inyectado en `emailAndPassword.password` de Better Auth (RNF-06)
- [x] `lib/auth.ts`: adaptador de Prisma, plugin `username`, registro abierto desactivado
- [x] Sesión con cookie httpOnly de 30 días, `secure` en producción, `trustedOrigins` (RF-03, RNF-05)
- [x] Límite de intentos de inicio de sesión (RNF-06)
- [x] Manejador montado en `/api/auth/*` antes de `express.json()`
- [x] Variables `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `FRONTEND_ORIGIN` obligatorias en `env.ts`

### Datos base
- [x] Seed: plantel CBTIS 258 y primer usuario administrador (`pnpm db:seed`, variables `SEED_ADMIN_*`)

### Rutas
- [ ] Inicio de sesión con matrícula (alumno) o correo (vinculación) y cierre de sesión (RF-03)
- [x] Activación: verificar matrícula → confirmar nombre → crear contraseña (RF-02); matrícula no precargada → "Tu matrícula no está registrada; acude a vinculación" — `POST /api/auth/activar/verificar` y `POST /api/auth/activar`
- [x] `GET /api/me`: perfil y expediente activo
- [x] Restablecer contraseña: vinculación genera una temporal y el alumno debe cambiarla al entrar (RF-04) — `POST /api/alumnos/:id/restablecer-contrasena` y `POST /api/me/cambiar-contrasena`
- [ ] Administrador crea usuarios de vinculación con su oficina (RN-03b)

### Middlewares
- [x] `requireSession` (401), `requireRol` (403), `requireOficina` (RN-03b)

### Pruebas
- [ ] `test/setup.ts` limpia tablas (por ahora cada archivo borra su propio plantel con `borrarPlantel`)
- [x] `test/factories.ts`: `crearPlantel`, `crearUsuario`, `iniciarSesion`, `borrarPlantel`
- [ ] Cada ruta: caso feliz, validación inválida, sin sesión (401) y rol incorrecto (403)
- [ ] `pnpm test` y `pnpm typecheck` en verde

## Fuera de alcance

- Pantallas del frontend (activar cuenta e iniciar sesión): tarea siguiente.
- Importación de alumnos (RF-01): tarea propia.
- Aviso de privacidad (RNF-07): se muestra en la pantalla de activación del frontend.

## Notas

- Better Auth 1.7: `User.email` es obligatorio y único ("limitación de la arquitectura actual"). Su guía recomienda correos de relleno con el dominio reservado `.invalid`, sin verificar.
- Las rutas de inicio y cierre de sesión serán las de Better Auth (`/api/auth/sign-in/username`, `/api/auth/sign-in/email`, `/api/auth/sign-out`) en lugar de `/api/auth/login` y `/api/auth/logout` de specs §9: el manejador ocupa `/api/auth/*` (en lo técnico manda `CLAUDE.md`). El contrato funcional es el mismo.
- Better Auth omite la verificación de origen cuando `NODE_ENV=test`; `lib/auth.ts` la fuerza con `advanced.disableOriginCheck: false` para que las pruebas se parezcan a producción.
- El plugin `username` no revisa el origen en `/sign-in/username` si la petición no trae cookie (`/sign-in/email` sí lo hace). Por eso `middleware/requireTrustedOrigin.ts` va antes del manejador y rechaza con 403 `ORIGEN_NO_PERMITIDO`.
- Límite de intentos: 10 por minuto por IP y por ruta de inicio de sesión, guardado en memoria. Es corto a propósito porque los alumnos pueden compartir la IP de la escuela (NAT). Pendiente de confirmar con vinculación; si Railway escala a más de una instancia, hay que pasarlo a `storage: "database"`.
- En pruebas, `test/setup.ts` define valores no secretos para las variables de Better Auth si `.env.test` no las trae.
- El seed (`src/scripts/seedBase.ts`) se puede correr varias veces: si el plantel o el admin ya existen, no los toca y nunca reinicia la contraseña. El admin se crea con `debeCambiar = true` y queda registrado en `AuditLog` (`CREAR_ADMIN`), sin la contraseña.
- Middlewares en `src/middleware/auth.ts`. `requireSession` responde 403 `CUENTA_INACTIVA` si `activo = false` y 403 `DEBE_CAMBIAR_CONTRASENA` si `debeCambiar = true`, salvo en las rutas montadas con `requireSession({ permitirCambioPendiente: true })` (RF-04). `getAuth(req)` entrega el usuario ya tipado.
- La regla RN-03b es lógica pura en `src/domain/oficinas.ts`: `puedeAdministrarTipo` para un recurso y `alcanceOficina` para filtrar listas (RF-23).
- Pendiente: hoy un usuario inactivo todavía puede iniciar sesión, solo que no pasa ninguna ruta protegida. Conviene bloquearlo desde Better Auth (`databaseHooks.session.create.before`) al hacer las rutas.
- Activación (decisión del 2026-11-07): el alumno **escribe** su nombre y primer apellido, y el servidor los compara sin distinguir mayúsculas, acentos ni ñ/n (`domain/nombres.ts`). El servidor nunca devuelve el nombre guardado, para que la ruta pública no sirva para sacar nombres de alumnos menores (RNF-07). Se rechazó mostrar el nombre enmascarado.
- Orden de las validaciones: primero si la matrícula existe (404), después el nombre (400) y recién entonces si la cuenta está inactiva (403) o ya activada (409). Así, quien no conoce el nombre no puede saber si la cuenta ya está activada.
- "Activada" quiere decir que existe una cuenta `credential` con contraseña. Al activar se bloquea la fila con `SELECT … FOR UPDATE` para que dos activaciones al mismo tiempo no creen dos contraseñas.
- Las rutas de activación tienen su propio límite (`middleware/rateLimit.ts`, 10 por minuto por IP), porque Better Auth no las cubre. Pendiente: sumar un límite por matrícula contra intentos repartidos entre muchas IP.
- `POST /api/auth/activar` no inicia sesión: el frontend llama después a `/api/auth/sign-in/username`.
- Ojo para cuando se haga la importación (RF-01): cada alumno debe crearse con `User` (`username` = matrícula, correo de relleno) más `Alumno`, y **sin** cuenta `credential`.
- `GET /api/me` devuelve `{ usuario, alumno, expedienteActivo }`. El expediente activo es el que está en `PENDIENTE`, `EN_PROCESO` o `SUSPENDIDO` (índice `un_expediente_activo`, specs 8.3). El correo de relleno `.invalid` se devuelve como `null`. La ruta funciona aunque haya cambio de contraseña pendiente, para que la app pueda leer `debeCambiar`. Las horas acumuladas no van acá: van en el panel del alumno.
- `GET /api/me` no recibe datos ni restringe por rol, así que no le aplican las pruebas de "validación inválida" ni de "rol incorrecto (403)". En su lugar se prueban el 401 y el 403 por cuenta inactiva.
- Restablecer contraseña (decisión del 2026-11-07, opción 1): cualquier usuario de vinculación del plantel, o el admin, puede restablecer a cualquier alumno, sin importar la oficina. Es soporte, no administración del expediente, y RN-03b habla de expedientes. Un alumno de otro plantel recibe 404.
- Al restablecer: se genera una contraseña de 10 caracteres sin símbolos que se confundan (0/O/o, 1/I/l), se devuelve **una sola vez** con `Cache-Control: no-store`, se pone `debeCambiar = true`, se cierran todas las sesiones del alumno y queda en `AuditLog` (`RESTABLECER_CONTRASENA`, con quién lo hizo). Si el alumno nunca se activó, se le crea la cuenta: así vinculación resuelve en persona el caso "el nombre no coincide".
- Cambiar contraseña: ruta propia `POST /api/me/cambiar-contrasena` en lugar de `/change-password` de Better Auth, para apagar `debeCambiar` en la misma transacción. Mantiene la sesión actual, cierra las demás y queda en `AuditLog` (`CAMBIAR_CONTRASENA`).
- `disabledPaths` en `lib/auth.ts` apaga las rutas de Better Auth que no corresponden a este proyecto: registro, cambio y restablecimiento de contraseña por correo, `/update-user` (los nombres vienen de Edumedia), `/is-username-available` (revelaría qué matrículas existen), borrado de usuario y cuentas sociales.
