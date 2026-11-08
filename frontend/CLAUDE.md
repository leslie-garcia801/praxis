# Frontend — PWA

React + Vite + TypeScript. Se despliega en Vercel con Root Directory `frontend`. Diseñada primero para celular (360 px de ancho) y adaptable a escritorio para el panel de vinculación.

## Comandos

```bash
pnpm dev            # Vite en :5173, con proxy /api → http://localhost:3000
pnpm build          # tsc -b && vite build
pnpm preview        # prueba el build, incluido el service worker
pnpm test           # vitest run
pnpm test:watch
pnpm test:e2e       # playwright test (requiere backend corriendo)
pnpm typecheck
pnpm lint
```

## Estructura

```
frontend/
├── vercel.json              # rewrite /api → Railway y fallback a index.html
├── vite.config.ts           # vite-plugin-pwa y proxy de desarrollo
├── public/                  # íconos de la PWA y manifest
├── src/
│   ├── main.tsx
│   ├── router.tsx           # rutas por rol: /alumno, /vinculacion, /validar/:token
│   ├── lib/
│   │   ├── api.ts           # fetch con credentials: 'include' y manejo del formato { error }
│   │   ├── auth.ts          # cliente de Better Auth
│   │   └── tiempo.ts        # formato de fechas en America/Monterrey
│   ├── components/ui/       # componentes de shadcn/ui
│   ├── features/
│   │   └── <feature>/       # avance, escaneo, historial, bitacora, instituciones, expediente, panel, importaciones, validacion
│   │       ├── components/
│   │       ├── api.ts       # hooks de TanStack Query
│   │       ├── schemas.ts   # Zod para formularios
│   │       └── *.test.tsx
│   └── offline/             # cola de escaneos en IndexedDB y sincronización (RF-16)
├── test/
│   ├── setup.ts
│   └── msw/handlers.ts      # respuestas simuladas de la API
└── e2e/                     # pruebas de Playwright
```

## Reglas de la interfaz

- Pantalla de inicio del alumno = avance (RF-18). El botón "Registrar" es grande y siempre visible.
- Textos en español, claros y cortos; apóyate en las specs para los mensajes. Contraste y tamaño según WCAG 2.1 AA (RNF-09).
- El frontend **nunca** calcula horas acreditables ni decide reglas de negocio: muestra lo que devuelve la API. Solo formatea.
- Todas las llamadas usan rutas relativas (`/api/...`), nunca la URL de Railway.

## PWA y modo sin conexión

- `vite-plugin-pwa` con estrategia `generateSW`: precache del shell de la app; las respuestas de `/api` no se cachean salvo el último avance del alumno.
- Escaneo sin red (RF-16, RN-14): se guarda en IndexedDB con un UUID generado en el cliente y la hora local; se reenvía al evento `online` y al abrir la app (iOS no tiene Background Sync). El UUID hace la petición idempotente.
- En iPhone, explica cómo instalar la app en la pantalla de inicio; sin instalarla no hay notificaciones push (RF-28).
- El escáner usa `@zxing/browser` y pide permiso de cámara solo al tocar "Registrar". Siempre ofrece el código corto como alternativa (RF-15).

## Pruebas

- Vitest + React Testing Library para componentes y hooks, con MSW simulando la API (no se llama al backend real en pruebas unitarias).
- Prueba los estados de cada pantalla: cargando, error, vacío y con datos.
- La cola sin conexión se prueba con `fake-indexeddb`.
- Playwright cubre los flujos críticos: activar cuenta, escanear entrada y salida (con código corto), escribir bitácora y validar como supervisor. Ejecuta en viewport de celular (`iPhone 13` y `Pixel 7`).

## Variables de entorno

No se necesitan variables para llamar a la API (todo va por `/api`). La URL de Railway vive solo en `vercel.json`.
