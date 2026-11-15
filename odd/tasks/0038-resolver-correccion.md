# 0038 — Vinculación aprueba o rechaza correcciones (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (pendientes) |
| Specs | RF-17, RN-03b, RN-04, RN-08, RF-29, RF-25 |
| Proyecto | backend |

## Descripción

Segunda de cuatro tareas de RF-17 (ver decisiones en [0037](0037-solicitar-correccion.md)).

- `GET /api/correcciones?estado=` (`ALUMNO`, `VINCULACION`, `ADMIN`): vinculación ve las solicitudes de su oficina en su plantel (RN-03b), por defecto solo `PENDIENTE` y las más antiguas primero (cola); el alumno ve todas las suyas, las más recientes primero (para sus pendientes, RF-18). Cada fila trae el turno actual, el expediente y el nombre y número de control del alumno.
- `PATCH /api/correcciones/:id` (`VINCULACION`, `ADMIN`), cuerpo `{ accion: 'APROBAR' }` o `{ accion: 'RECHAZAR', comentario }` (comentario de 5 a 1000 caracteres, igual que el rechazo de una semana).
  - **Aprobar:** el turno queda `CERRADA` con las horas propuestas y se recalculan los minutos de los días afectados (RN-04, RN-09), con su `AuditLog` `CORREGIR_ASISTENCIA` (antes y después del turno), todo en una transacción.
  - **Rechazar:** el turno no cambia; se guarda el comentario y se audita `RECHAZAR_CORRECCION`. El alumno puede volver a solicitar.
  - Al aprobar se revisa otra vez que la semana siga sin enviar y que no haya traslape con turnos registrados después de la solicitud. Rechazar siempre se puede mientras esté pendiente.
  - Una solicitud resuelta no se vuelve a resolver (`409 CORRECCION_NO_PENDIENTE`); el `UPDATE` está condicionado al estado para que dos resoluciones simultáneas no ganen ambas.
- Auditoría del expediente (RF-25): incluye las entradas de sus turnos corregidos y de sus solicitudes rechazadas.

## Checklist
- [x] Esquemas `resolverCorreccionSchema` y `listarCorreccionesQuerySchema`
- [x] Servicio: `listarCorrecciones` y `resolverCorreccion`; `recalcularDias` y `errorDeRestriccion` exportados desde asistencias
- [x] Rutas montadas en `/api/correcciones`
- [x] `listarAuditoria` incluye `Asistencia` y `SolicitudCorreccion`
- [x] Pruebas: aprobar (turno, minutos, auditoría), tope de 390 con otros turnos del día, rechazar, volver a solicitar, ya resuelta, semana enviada, traslape, 400, 401, 403 (alumno y otra oficina), 404 y listados por rol

## Huecos en specs (sin editar)
- §9 no tiene `GET /api/correcciones`.
