# 0037 — El alumno solicita la corrección de un turno (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (pendientes) |
| Specs | RF-17, RN-08, RN-15, RF-19 |
| Proyecto | backend |

## Descripción

Primera de cuatro tareas de RF-17 (0037 a 0040). El alumno propone la hora correcta de entrada y salida de un turno con un motivo; la solicitud queda `PENDIENTE` y el turno no cambia hasta que vinculación la apruebe (0038).

`POST /api/asistencias/:id/correcciones` (solo `ALUMNO`), cuerpo `{ entradaNueva, salidaNueva, motivo }` con fechas ISO 8601 con zona; responde `201 { correccion }`.

## Decisiones del equipo (2026-11-15)

Las specs no detallan RF-17; la responsable del proyecto aprobó estas reglas:

1. Se corrigen turnos `INCOMPLETA` y `CERRADA`; los `ABIERTA` no (se cierran con el siguiente escaneo).
2. No se corrige un turno de una semana `ENVIADA` o `VALIDADA`, para no cambiar horas que el supervisor ya firmó. Sí en `BORRADOR` y `RECHAZADA`.
3. La entrada corregida queda en el mismo día local del turno (así no cambia de semana); la salida puede pasar la medianoche, debe ser posterior a la entrada y no estar en el futuro; el turno no puede traslaparse con otro.
4. La solicitud guarda `comentario` (motivo del rechazo) y `resueltoEn`.
5. Un turno olvidado por completo (sin entrada ni salida) queda fuera de RF-17.

Además: una sola solicitud `PENDIENTE` por turno (índice parcial `una_correccion_pendiente`) y solo con el expediente `EN_PROCESO` o `SUSPENDIDO`.

## Checklist
- [x] `domain/correcciones.ts`: `turnoCorregible` y `motivoRechazoCorreccion`, con pruebas
- [x] Migración `correccion_resolucion`: columnas `comentario`, `resuelto_en` e índice parcial
- [x] Módulo `correcciones`: esquema Zod, servicio y ruta montada en `/api/asistencias/:id/correcciones`
- [x] Historial (RF-19): cada turno trae `correccion` (la última solicitud) y `puedeSolicitarCorreccion`, calculado en el backend
- [x] Pruebas de ruta: caso feliz, reglas (409), validación (400), sin sesión (401), rol incorrecto y turno ajeno (403), inexistente u otro plantel (404)

## Huecos en specs (sin editar)
- §8.2: `SolicitudCorreccion` no tiene `comentario` ni `resueltoEn`.
- §9: no hay endpoint para listar correcciones (del alumno o pendientes de la oficina); se agrega en 0038.
