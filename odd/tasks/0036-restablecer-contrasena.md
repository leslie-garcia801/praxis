# 0036 — Restablecer contraseña del alumno desde el detalle (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (specs §14) |
| Specs | RF-04, RN-03b, RN-11 |
| Proyecto | frontend |

## Descripción

Agrega al encabezado del detalle del alumno (`/vinculacion/expedientes/:id`, tareas 0030 y 0031) el botón "Restablecer contraseña" para vinculación y administrador. Consume `POST /api/alumnos/:id/restablecer-contrasena` (tarea 0003); no hay cambios de backend.

## Checklist

- [x] `useRestablecerContrasena(alumnoId)` en `features/detalle/api.ts`; la contraseña temporal no se guarda en caché
- [x] Botón "Restablecer contraseña" que primero pide confirmación: la contraseña actual deja de funcionar y se cierran sus sesiones
- [x] Al confirmar, muestra la contraseña temporal una sola vez con "Copiar"; "Listo" la oculta
- [x] Un error de la API se muestra dentro del diálogo, que sigue abierto
- [x] El bloque de contraseña temporal se extrae a `components/PasswordTemporal.tsx` y lo reutiliza también `CrearUsuarioPage`
- [x] Pruebas con MSW: restablecer y copiar, cancelar sin llamar a la API, error dentro del diálogo, disponible para el administrador

## Fuera de alcance
- Cambios de backend: el endpoint ya existe.
