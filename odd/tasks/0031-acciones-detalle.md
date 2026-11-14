# 0031 — Acciones en el detalle del alumno (backend + frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (specs §14) |
| Specs | RF-12, RF-22, RF-29, RN-03b, RN-12 |
| Proyecto | backend y frontend |

## Descripción

Las acciones de la oficina de vinculación sobre un expediente, dentro de `/vinculacion/expedientes/:id`: confirmar, suspender, reactivar, cancelar y transferir (RF-12, RN-12), validar o rechazar una semana en nombre del supervisor (RF-22) y editar al supervisor. Todo reutiliza endpoints existentes salvo la validación en nombre del supervisor, que es el único endpoint nuevo.

## Checklist

### Backend
- [x] `POST /api/semanas/:id/validacion` (`VINCULACION`, `ADMIN`). Alcance como `cargar` (RN-03b): otra oficina → 403; otro plantel o inexistente → 404; alumno → 403
- [x] Cuerpo `{ accion: 'VALIDAR' | 'RECHAZAR', motivo, comentario? }` (estricto). `motivo` obligatorio (1..500, mismos mensajes que RF-12). `comentario` obligatorio al rechazar (mínimo 5, máximo 1000, igual que el enlace del supervisor) y no permitido al validar
- [x] Solo semanas `ENVIADA`; cualquier otro estado → 409 `SEMANA_NO_ENVIADA`. El UPDATE lleva `estado = ENVIADA` como condición (sin carreras contra el enlace del supervisor)
- [x] Mismos efectos que el enlace (lógica compartida `datosDeResolucion` en `validacion.service.ts`): VALIDADA con `validadoEn` y `validadoPor` = id del usuario de vinculación; RECHAZADA con `comentario` y `rechazadaEn`
- [x] Auditoría en la misma transacción: `VALIDAR_SEMANA_VINCULACION` / `RECHAZAR_SEMANA_VINCULACION`, `antes { estado }`, `despues { estado, motivo, comentario?, enNombreDelSupervisor: true }`
- [x] Respuesta `200 { semana }` con `id, semanaInicio, estado, actividades, enviadaEn, bitacoraActualizadaEn, comentario, validadoEn, rechazadaEn`
- [x] Pruebas: validar, rechazar, 400 (sin motivo, rechazo sin comentario, validar con comentario), 401, 403 alumno, `RN-03b` otra oficina, 404 otro plantel, 409 por estado, auditoría y enlace del supervisor mostrando la semana ya resuelta (`YA_RESUELTA`)

### Frontend
- [x] Acciones por estado: PENDIENTE (Confirmar, Cancelar), EN_PROCESO (Suspender, Cancelar, Transferir), SUSPENDIDO (Reactivar, Cancelar, Transferir), FINALIZADO y CANCELADO sin acciones
- [x] Formularios en panel en línea (`PanelAccion`) con motivo obligatorio; invalidan detalle, avance, auditoría, panel y supervisores; muestran el error de la API
- [x] Cancelar y Transferir piden confirmación con `alert-dialog`
- [x] Confirmar muestra los `faltantes` del 409 `EXPEDIENTE_INCOMPLETO`
- [x] Transferir (RN-12): selector de institución existente filtrado por tipo, "Conservar horas validadas" y motivo; navega al expediente nuevo
- [x] Historial: en semanas `ENVIADA`, "Validar en nombre del supervisor" y "Rechazar" (comentario obligatorio) con motivo
- [x] Supervisor: "Editar supervisor" con `PATCH /api/supervisores/:id`
- [x] Auditoría: etiquetas en español de las acciones nuevas
- [x] Pruebas con MSW

## Decisiones
- Solo se resuelven semanas `ENVIADA` (decisión del usuario).
- "Confirmar" no pide motivo: `POST /api/expedientes/:id/confirmar` no recibe cuerpo ni lo audita con motivo.
- Rechazar una semana no pide confirmación adicional (ya exige comentario y motivo); cancelar y transferir sí.

## Brecha en las specs
- `docs/specs.md` §9 no lista `POST /api/semanas/:id/validacion`. No se modificó el archivo; hay que agregarlo.
