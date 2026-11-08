# App de Servicio Social y Prácticas — CBTIS 258

PWA para que los alumnos registren su asistencia de servicio social (480 h) y prácticas profesionales (240 h) escaneando un QR, con validación semanal del supervisor y un panel para las oficinas de vinculación.

**Fuente de verdad funcional:** `docs/specs.md` (v0.2). Antes de implementar algo, léelo y cita los IDs que aplican (RF-xx, RN-xx). Si este archivo y las specs se contradicen en algo técnico, manda este archivo; en reglas de negocio, mandan las specs. Si una regla no está clara o es una "pregunta abierta" (sección 13), pregunta antes de inventarla.

## Estructura

```
/
├── CLAUDE.md
├── docs/specs.md
├── docker-compose.yml     # PostgreSQL local (dev y test)
├── frontend/              # React + Vite + TypeScript → Vercel (Root Directory: frontend)
└── backend/               # Node + Express + TypeScript + Prisma → Railway (Root Directory: backend)
```

- `frontend/` y `backend/` son **proyectos independientes**: cada uno tiene su `package.json`, su `pnpm-lock.yaml`, su `tsconfig.json` y sus pruebas. No hay paquete compartido ni workspace en la raíz.
- Ninguno importa archivos del otro. El contrato entre ambos es la API REST (specs, sección 9).
- Consecuencia aceptada: los esquemas Zod se definen en el backend (fuente de verdad) y el frontend tiene sus propios esquemas para formularios. Si cambias un contrato de la API, actualiza ambos lados en el mismo cambio.

## Stack

| Capa | Herramienta |
| --- | --- |
| Lenguaje | TypeScript en modo `strict` en ambos proyectos |
| Runtime | Node 22 LTS |
| Gestor de paquetes | pnpm (dentro de cada carpeta) |
| Frontend | React, **Vite**, React Router, TanStack Query, React Hook Form + Zod, Tailwind CSS, shadcn/ui, vite-plugin-pwa, @zxing/browser (escáner QR) |
| Backend | Express 5, Zod, Prisma, PostgreSQL, Better Auth, Resend, pdfmake (PDF), SheetJS (Excel/CSV), qrcode |
| Pruebas backend | Vitest + Supertest contra una base PostgreSQL de prueba |
| Pruebas frontend | Vitest + React Testing Library + MSW; Playwright para flujos de punta a punta |

No agregues dependencias fuera de esta lista sin preguntar.

## Despliegue desacoplado

- **Vercel** despliega solo `frontend/`. **Railway** despliega solo `backend/` y la base de datos.
- El navegador **nunca** llama al dominio de Railway directamente. `frontend/vercel.json` redirige `/api/*` a Railway, así las cookies de sesión son del mismo origen y Safari en iPhone no las bloquea (RNF-05):

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://<servicio>.up.railway.app/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

- En desarrollo, el proxy de Vite (`server.proxy['/api']`) apunta a `http://localhost:3000`, para reproducir el mismo origen.
- Si más adelante hay dominio propio (`app.` y `api.`), se cambia la configuración de cookies de Better Auth; no cambia el código de las pantallas.

## Desarrollo local

```bash
docker compose up -d                  # PostgreSQL en 5432 con bases app_dev y app_test
cd backend  && pnpm install && pnpm prisma migrate dev && pnpm dev   # API en :3000
cd frontend && pnpm install && pnpm dev                              # Vite en :5173
```

Cada proyecto tiene `.env.example`; nunca subas `.env`.

## Convenciones

- **Idioma:** la interfaz, los mensajes de error para el usuario y los nombres del dominio van en español, igual que en las specs (`Expediente`, `Asistencia`, `SemanaBitacora`, `minutosAcreditables`). Los términos técnicos genéricos van en inglés (`useAuth`, `apiClient`, `parseCsv`).
- **Horas y fechas:** se guardan en UTC (`timestamptz`) y se muestran en `America/Monterrey` (RN-15). Nunca uses la zona horaria del servidor.
- **Minutos, no horas:** toda la lógica trabaja con minutos enteros; las horas solo se calculan para mostrar.
- **Totales calculados:** las horas acumuladas se calculan con consultas, nunca se guardan como columna (specs 8.4).
- **Errores de la API:** forma única `{ error: { code, message, details? } }`, con `message` en español.
- **Seguridad:** cada endpoint valida rol y propiedad del recurso; un usuario de vinculación solo ve expedientes de su oficina (RN-03b). Nunca guardes CURP, edad, sexo ni número de afiliación (RNF-07).

## Pruebas (obligatorias)

- Toda regla de negocio (RN-xx) tiene al menos una prueba que la menciona en su nombre, por ejemplo `it('RN-04: acredita máximo 300 minutos por día')`.
- Toda ruta nueva de la API tiene pruebas de: caso feliz, validación inválida, sin sesión (401) y rol incorrecto (403).
- Un cambio no está terminado si `pnpm test` y `pnpm typecheck` fallan en el proyecto que tocaste.

## Forma de trabajo

- Trabaja **una iteración a la vez** (specs, sección 14). Propón un plan antes de escribir código.
- Haz cambios pequeños y verificables; al terminar, resume qué RF/RN cubriste y qué quedó pendiente.
- No modifiques `docs/specs.md` salvo que se pida; si encuentras un hueco o contradicción, señálalo.
