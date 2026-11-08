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
- [ ] Activación: verificar matrícula → confirmar nombre → crear contraseña (RF-02); matrícula no precargada → "Tu matrícula no está registrada; acude a vinculación"
- [ ] `GET /api/me`: perfil y expediente activo
- [ ] Restablecer contraseña: vinculación genera una temporal y el alumno debe cambiarla al entrar (RF-04)
- [ ] Administrador crea usuarios de vinculación con su oficina (RN-03b)

### Middlewares
- [ ] `requireSession` (401), `requireRol` (403), `requireOficina` (RN-03b)

### Pruebas
- [ ] `test/setup.ts` limpia tablas; `test/factories.ts`
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
