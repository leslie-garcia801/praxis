# 0005 — Pantallas de acceso (frontend)

| Campo | Valor |
| --- | --- |
| Estado | En curso |
| Iteración | 1 (specs §14) |
| Specs | F-01, RF-02, RF-03, RF-04, RN-03b, RNF-05, RNF-07, pantallas §10 (alumno 1 y 8) |
| Proyecto | frontend |

## Descripción

Pantallas para que el alumno active su cuenta e inicie sesión con su matrícula, que vinculación entre con su correo, que cualquier usuario cambie una contraseña temporal y cierre sesión, y guardas de ruta por rol sobre `GET /api/me`.

## Checklist

### Base
- [x] Instalar `better-auth` 1.7.18 (misma versión que el backend) y crear `lib/auth.ts`
- [x] Componentes de shadcn/ui necesarios (`input`, `label`, `card`)
- [x] `useMe()` con TanStack Query sobre `GET /api/me`

### Rutas y guardas
- [x] Sin sesión → `/entrar`; `ALUMNO` → `/alumno`; `VINCULACION`/`ADMIN` → `/vinculacion`
- [x] `debeCambiar` → `/cambiar-contrasena` obligatorio (RF-04)

### Pantallas
- [x] `/entrar`: "Matrícula o correo" + contraseña (RF-03)
- [x] `/activar`: verificar identidad y crear contraseña, con aviso de privacidad (RF-02, RNF-07)
- [x] `/cambiar-contrasena` (RF-04)
- [x] Cerrar sesión

### Pruebas
- [x] Vitest + React Testing Library + MSW por pantalla y guarda
- [ ] Playwright: activar cuenta en iPhone 13 y Pixel 7

## Notas

- El aviso de privacidad es **provisional** (specs §13, pregunta 7): vive en un solo componente para reemplazarlo cuando el plantel tenga el texto oficial.
- Playwright (`e2e/activar.spec.ts`, iPhone 13 y Pixel 7): escrito y listado con `playwright test --list`, **no ejecutado**: faltan los navegadores (`pnpm exec playwright install`) y las variables `E2E_STAFF_EMAIL` / `E2E_STAFF_PASSWORD` (usuario ADMIN/VINCULACION que ya cambió su contraseña temporal). Los datos se crean con la API real (`e2e/helpers/seedAlumno.ts`: inicia sesión como personal e importa un alumno por CSV, RF-01). Sin backend o sin variables, la prueba se omite con un mensaje.
- Las guardas viven en `features/auth/components/guards.tsx` y son la única fuente de redirecciones: después de iniciar sesión, activar o cambiar la contraseña solo se refresca `['me']` y la guarda lleva al usuario a su destino.
- `GET /api/me` con 401, o con 403 `CUENTA_INACTIVA`, se trata como "sin sesión". Otros errores muestran "Reintentar".
- `/cambiar-contrasena` solo es accesible con `debeCambiar = true` (no hay pantalla voluntaria de cambio); sin él redirige al inicio del rol.
- `POST /api/me/cambiar-contrasena` conserva la sesión actual, así que no hay nuevo inicio de sesión.
- Cerrar sesión: `signOut` de Better Auth, se eliminan las consultas en caché salvo `['me']`, que queda en `null`, y se navega a `/entrar`.
- `lib/auth.ts` resuelve `fetch` en cada llamada (`customFetchImpl`): Better Auth lo capturaba al importar y MSW no interceptaba (las pruebas llegaban al backend real).
- La matrícula "no registrada" usa el texto exacto de RF-02 (sin punto final), no el del backend.
