# 0016 — Pantalla de inicio del alumno (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 3 (specs §14) |
| Specs | RF-18, RN-11, RN-13, RN-15, RN-16, RNF-01, RNF-09, specs §10 (Alumno, pantalla 2) |
| Proyecto | frontend |

## Descripción

Reemplaza el marcador de `/alumno` por la pantalla de inicio del alumno: su avance (RF-18), que según las specs es la pantalla principal. Consume `GET /api/me` (expediente activo) y `GET /api/expedientes/:id/avance` (tarea 0015). El frontend no calcula horas ni reglas de negocio: solo da formato a lo que devuelve la API. Diseñada primero para celular (360 px, RNF-01) y con texto legible y contraste AA (RNF-09).

## Checklist

### Base
- [x] Ampliar el tipo `Me` de `features/auth/api.ts` con `alumno` y `expedienteActivo` (`id`, `tipo`, `estado`, `metaHoras`, `fechaInicio`, `fechaTermino`, `institucion`), igual a lo que devuelve el backend; actualizar `buildMe` de MSW
- [x] `src/lib/tiempo.ts` (RN-15, siempre `America/Monterrey` con `Intl`, nunca la zona del dispositivo): `formatHora(iso)` → `"10:11"`, `formatFecha(fechaISO)` → `"lunes 16 de noviembre"`, `formatHoras(minutos)` → `"12 h 30 min"` / `"480 h"`, `esHoy(iso)`; con pruebas
- [x] Componente `Progress` de shadcn/ui (usa `radix-ui`, ya instalado; no agrega dependencias)
- [x] `AlumnoLayout` como ruta de layout bajo `RequireRole ALUMNO`: encabezado con el nombre de la app y "Cerrar sesión", contenido `max-w-md` con margen de 16 px
- [x] Rutas `/alumno/registrar`, `/alumno/expediente` y `/alumno/historial` con `PlaceholderPage` (se implementan en 0017, 0018 y 0019), para que los enlaces funcionen

### Inicio: `/alumno` (RF-18, en este orden)
- [x] Hook `useAvance(expedienteId)` en `features/avance/api.ts` (TanStack Query, `apiFetch`)
- [x] 1. Barra de progreso con el **porcentaje validado** (`role="progressbar"` con valor accesible)
- [x] 2. Horas validadas / meta, horas registradas sin validar y horas faltantes (RN-11)
- [x] 3. Fecha estimada (RN-16): `ESTIMADA` → "Terminarías aproximadamente el lunes 16 de noviembre"; `SIN_DATOS` → "Aún sin datos suficientes"; `COMPLETADO` → "Ya registraste las horas de tu meta; falta que se validen"
- [x] 4. Turno de hoy: "Turno abierto desde las 10:11" (si el turno abierto es de otro día, se muestra también la fecha) o "Sin turno abierto"; botón grande **Registrar**, siempre visible, que lleva a `/alumno/registrar`
- [x] Enlace a "Historial"

### Estados del expediente
- [x] Sin expediente activo → "No tienes un expediente activo. Acude a vinculación."; sin avance ni botón Registrar
- [x] `PENDIENTE` → aviso "Completa tu expediente para empezar a registrar" con botón a `/alumno/expediente`; sin avance ni Registrar
- [x] `SUSPENDIDO` (RN-13) → se muestra el avance con el aviso "Tu expediente está suspendido; no puedes registrar asistencia. Acude a vinculación." y Registrar deshabilitado
- [x] `EN_PROCESO` → pantalla completa

### Pruebas (Vitest + RTL + MSW)
- [x] Cargando, error con "Reintentar", y cada estado del expediente (sin expediente, `PENDIENTE`, `SUSPENDIDO`, `EN_PROCESO`)
- [x] Cada variante de la fecha estimada (`ESTIMADA`, `SIN_DATOS`, `COMPLETADO`) y del turno (abierto hoy, abierto de otro día, sin turno)
- [x] Nombres con la regla cuando aplica: `RN-11: muestra horas validadas y registradas por separado`, `RN-13: con expediente suspendido no se puede registrar`, `RN-16: sin datos suficientes`
- [x] `lib/tiempo.ts`: hora y fecha en Monterrey aunque la zona del entorno sea otra (por ejemplo, un instante de las 23:30 en Monterrey que en UTC ya es el día siguiente)

## Fuera de alcance
- Escáner QR y código corto (0017), completar expediente (0018), historial (0019), perfil e instalación de la app.
- Pendientes de la pantalla de inicio (bitácora, correcciones): iteración 4.
- Avance en caché sin conexión y ruta `/s/:token`: iteración 6.

## Notas

### Decisiones técnicas
- El cerrar sesión pasa al encabezado del `AlumnoLayout` hasta que exista la pantalla de perfil.
- Las rutas marcador evitan enlaces rotos y se reemplazan en cada tarea siguiente.
- Formato de horas: `formatHoras` muestra horas y minutos (`"12 h 30 min"`), y solo horas cuando los minutos son 0.
