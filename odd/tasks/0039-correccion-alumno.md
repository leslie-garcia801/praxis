# 0039 — Solicitud de corrección en la app del alumno (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (pendientes) |
| Specs | RF-17, RF-18, RF-19, RN-08, RN-15 |
| Proyecto | frontend |

## Descripción

Tercera de cuatro tareas de RF-17 (backend en [0037](0037-solicitar-correccion.md) y [0038](0038-resolver-correccion.md)).

- **Historial (RF-19):** un turno `INCOMPLETA` muestra "Sin salida registrada" en lugar de la hora del cierre automático (RN-08). Si la API lo permite (`puedeSolicitarCorreccion`), el turno ofrece "Solicitar corrección": un formulario con hora de entrada, hora de salida, "La salida fue al día siguiente" y motivo. Las horas se escriben en hora de Monterrey y se envían como instantes (RN-15). Los errores de reglas del servidor (409) se muestran tal cual.
- Cada turno muestra el estado de su última solicitud: en revisión (con las horas propuestas), rechazada (con el comentario de la oficina; se puede volver a solicitar) o "Turno corregido por tu oficina".
- **Pendientes del inicio (RF-18, punto 5):** además de las bitácoras, aparecen las correcciones en revisión y las rechazadas en los últimos 7 días, con enlace a la semana del turno. Solo cuenta la última solicitud de cada turno.

## Checklist
- [x] `lib/tiempo`: `instanteMonterrey` (fecha y hora de Monterrey → instante ISO) y `lunesDeSemana`, con pruebas
- [x] `features/correcciones`: `api.ts` (`useSolicitarCorreccion`, `useMisCorrecciones`), `schemas.ts` y `CorreccionTurno`
- [x] `DiaHistorial` muestra la corrección y el formulario; tipo `Turno` con `correccion` y `puedeSolicitarCorreccion`
- [x] `PendientesAlumno` incluye las correcciones
- [x] MSW: `buildCorreccion` y respuesta por defecto de `GET /api/correcciones`
- [x] Pruebas: turno incompleto, sin permiso, envío con horas convertidas, salida al día siguiente, validación, error del servidor, cancelar, estados rechazada y aprobada, pendientes (en revisión, rechazada reciente, solo la última por turno)

## Notas
- Los 7 días que una corrección rechazada sigue visible en Pendientes son una decisión de interfaz (constante `DIAS_RECHAZO_VISIBLE`); el rechazo siempre queda visible en el turno del historial.
