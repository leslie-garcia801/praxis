# 0001 — Andamiaje del proyecto

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 1 (specs §14), primera parte |
| Specs | §8.2, §8.3, RN-03, RN-07, RN-15, RNF-05, RNF-10 |
| Proyecto | ambos |

## Descripción

Dejar los dos proyectos independientes (`backend/` y `frontend/`) arrancando, con TypeScript estricto, pruebas, lint y build en verde, y la base de datos local creada con el esquema inicial y las restricciones SQL de las specs.

## Checklist

### Entorno
- [x] pnpm 10 instalado
- [x] PostgreSQL 18 nativo con las bases `app_dev` y `app_test`
- [x] `docker-compose.yml` opcional para quien use Docker
- [x] `node-linker=hoisted` en `.npmrc` (el sandbox de Windows bloquea symlinks)

### Raíz
- [x] `git init`, `.gitignore`, `.gitattributes`, `.editorconfig`
- [x] PDFs de ejemplo de `docs/` fuera de git (datos personales)
- [x] Remoto `origin` en GitHub

### Backend
- [x] Express 5 con `app.ts` (sin listen) y `server.ts`
- [x] Variables de entorno validadas con Zod (`config/env.ts`)
- [x] Forma única de error `{ error: { code, message, details? } }` en español
- [x] `GET /api/health`
- [x] Esquema Prisma de specs §8.2 con las tablas de Better Auth y `plantelId` (RNF-10)
- [x] Migración inicial con las restricciones de §8.3 (sin traslapes, un turno abierto — RN-07, un expediente activo — RN-03)
- [x] Migración aplicada en `app_dev` y `app_test`, sin diferencias con el esquema
- [x] Vitest + Supertest, ESLint, `typecheck`, `build`

### Frontend
- [x] Vite + React + TypeScript
- [x] Tailwind 4 y shadcn/ui
- [x] vite-plugin-pwa (manifest + service worker `generateSW`)
- [x] React Router con rutas por rol (pantallas de relleno)
- [x] TanStack Query
- [x] `lib/api.ts`: rutas relativas `/api`, cookie de sesión, `ApiError`
- [x] Proxy de Vite `/api` → `:3000` y `vercel.json` (RNF-05)
- [x] Vitest + Testing Library + MSW, Playwright configurado
- [x] ESLint, `typecheck`, `build`

### Documentación
- [x] `README.md` con el stack y diagramas Mermaid
- [x] `backend/README-BACKEND.md`
- [x] `frontend/README-FRONTEND.md`
- [x] `odd/` con convenciones y plantilla de tareas

## Fuera de alcance

- Autenticación, importaciones y cualquier pantalla real.
- Descargar los navegadores de Playwright.

## Notas

- **Versiones:** TypeScript 6.0 (typescript-eslint aún no soporta la 7), Prisma 7.10 (la 8 está en RC), MSW 3 (`onUnhandledFrame`).
- **Pendiente para autenticación:** Better Auth exige `user.email` obligatorio y único; RF-02 dice que el correo del alumno es opcional.
- **Pendiente para despliegue:** reemplazar `REPLACE-WITH-RAILWAY-SERVICE` en `frontend/vercel.json`.
