# 0030 — Detalle del alumno y restablecer contraseña (frontend, primera parte)

| Campo | Valor |
| --- | --- |
| Estado | Primera parte terminada; la validación en nombre del supervisor sigue pendiente |
| Iteración | 5 (specs §14) |
| Specs | RF-04, RN-03b, RN-11, RN-15, specs §4 (roles y permisos) |
| Proyecto | frontend |

## Descripción

Agrega la pantalla de detalle del alumno para vinculación y administrador (`/vinculacion/expedientes/:id`), que se abre desde el nombre del alumno en el panel. Muestra los datos del alumno, su expediente y su avance, y permite restablecer su contraseña (RF-04). Consume endpoints que ya existen: `GET /api/expedientes/:id`, `GET /api/expedientes/:id/avance` y `POST /api/alumnos/:id/restablecer-contrasena` (tareas 0012, 0015 y 0003). No hay cambios de backend.

## Checklist

### Detalle `/vinculacion/expedientes/:id`
- [x] Ruta dentro de `VinculacionLayout`, bajo `RequireRole [VINCULACION, ADMIN]`
- [x] `features/detalle-alumno/api.ts`: `useExpedienteDetalle(id)` y `useRestablecerContrasena(alumnoId)`
- [x] Encabezado con nombre completo y matrícula; secciones **Alumno** (carrera, semestre, grupo, turno), **Expediente** (programa, estado, institución, departamento, supervisor con correo y "Por confirmar", inicio) y **Avance** (horas validadas vs meta, porcentaje, registradas, faltantes y fecha estimada; reutiliza `useAvance`)
- [x] Carga y error con "Reintentar" (expediente y avance por separado); "Volver al panel"

### Restablecer contraseña (RF-04)
- [x] Botón "Restablecer contraseña" que primero pide confirmación: la contraseña actual deja de funcionar y se cierran sus sesiones
- [x] Al confirmar, muestra la contraseña temporal una sola vez con "Copiar"; "Listo" la oculta
- [x] Un error de la API se muestra dentro del diálogo, que sigue abierto
- [x] El bloque de contraseña temporal se extrae a `components/PasswordTemporal.tsx` y lo reutiliza también `CrearUsuarioPage` (sus pruebas siguen pasando)

### Panel
- [x] El nombre del alumno en la tabla es un enlace al detalle (enlace real, accesible con teclado y lector de pantalla)

### Pruebas (Vitest + RTL + MSW)
- [x] Cargando, error con reintento y con datos
- [x] `RF-04`: confirmar, ver la temporal una vez y copiarla; cancelar no llama a la API; el error queda en el diálogo
- [x] El administrador también ve el botón
- [x] El nombre en el panel abre el detalle

## Fuera de alcance
- Confirmar, suspender, reactivar, cancelar o transferir el expediente (endpoints de la tarea 0013, sin pantalla todavía). Es el siguiente paso natural en esta misma pantalla.
- Validar semanas en nombre del supervisor (resto de la tarea 0030).
- Gestión de usuarios de vinculación (listar, desactivar, restablecer): necesita backend nuevo.

## Notas

### Decisiones técnicas
- Restablecer la contraseña no respeta el alcance de oficina (RN-03b): es soporte, no gestión del expediente (decisión del 2026-11-07, en `backend/src/modules/alumnos/alumnos.service.ts`). La pantalla solo lo expone.
- El detalle se direcciona por el id del expediente, que es lo que tiene la fila del panel; el id del alumno sale de la respuesta.

### Verificación
- `pnpm typecheck` y `pnpm lint`: limpios.
- `pnpm test`: 294 pasan y 4 fallan con `TypeError: object.stream is not a function` en `src/lib/api.test.ts`, `InstitucionesPage.test.tsx` e `InstitucionFormPage.test.tsx` (descarga de archivos). Fallan igual sin estos cambios: es un problema previo del entorno de pruebas, ajeno a esta tarea.
