# 0060 — La oficina finaliza un expediente (backend y frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | Mejora posterior al MVP |
| Specs | RF-11, RF-12, RF-29, RN-03a, RN-03b, §11.2 |
| Proyecto | ambos |

## Descripción

Hasta ahora ningún flujo pasaba un expediente a FINALIZADO, así que el siguiente programa (RF-01, RN-03a) nunca tenía candidatos. La oficina finaliza el expediente con una acción "Finalizar", permitida solo cuando las horas validadas alcanzan la meta.

**Backend**

- Migración `finalizado_en`: columna nullable `finalizadoEn` (`timestamptz`) en `Expediente`.
- Se agrega la acción `FINALIZAR` a `PATCH /api/expedientes/:id/estado` (en vez de una ruta nueva): es otra transición de estado, con el mismo rol (VINCULACION de su oficina por RN-03b, y ADMIN), el mismo motivo obligatorio y la misma auditoría. Cuerpo: `{ accion: 'FINALIZAR', motivo }`.
- Solo desde `EN_PROCESO` (un expediente SUSPENDIDO se reactiva primero); desde cualquier otro estado responde 409 `TRANSICION_NO_PERMITIDA`. La transición vive en `domain/expedientes.ts` (`transicionDeEstado`).
- Meta: se usa la misma función `minutosValidados` que calcula el avance (semanas VALIDADAS + `minutosTransferidos`, specs 8.4); si es menor que `metaHoras × 60` responde 409 `META_NO_ALCANZADA` con "Faltan 12 h 30 min validadas para la meta." (`formatearDuracion` en el dominio).
- `UPDATE ... WHERE estado = 'EN_PROCESO'` condicionado, `finalizadoEn = now()` y `AuditLog` `FINALIZAR_EXPEDIENTE` (con `minutosValidados` y `metaMinutos` en `despues`) en la misma transacción; dos solicitudes simultáneas: una gana, la otra 409.
- La respuesta del expediente incluye `finalizadoEn`.
- `GET /api/expedientes/candidatos`: `terminadoEn` usa `finalizadoEn` (día calendario en America/Monterrey) y conserva la aproximación anterior (última asistencia, luego `fechaTermino`) para datos finalizados antes de la columna.
- `GET /api/me` agrega `programasFinalizados` (tipos de programa con expediente FINALIZADO) para la pantalla de inicio del alumno.
- Para habilitar el botón el frontend reutiliza `GET /api/expedientes/:id/avance` (`minutosFaltantes`); no hay campo nuevo.

**Frontend**

- Detalle del alumno, expediente EN_PROCESO: botón "Finalizar" (panel "Finalizar expediente" con motivo y confirmación que explica que se cierra el expediente y que la otra oficina podrá asignar el siguiente programa). Deshabilitado mientras el avance carga o falten horas, con el motivo "Faltan X h Y min validadas para la meta.". Al éxito se refrescan detalle, avance, auditoría, panel y candidatos; se muestran los errores del servidor.
- Inicio del alumno: sin expediente activo y con programas terminados muestra "Terminaste tu servicio social." / "Terminaste tus prácticas profesionales." / "Terminaste tu servicio social y tus prácticas profesionales." en lugar de "No tienes un expediente activo".
- La auditoría muestra "Expediente finalizado".

## Checklist

- [x] Pruebas primero (en rojo) y luego implementación
- [x] Migración `finalizado_en` (aplicada a la base de prueba)
- [x] Backend: caso feliz con auditoría y `finalizadoEn`, 409 `META_NO_ALCANZADA` con lo que falta, 409 desde PENDIENTE/SUSPENDIDO/FINALIZADO/CANCELADO, minutos transferidos, 400, 401, 403 (alumno y otra oficina), 404 (otro plantel), concurrencia, candidato para la otra oficina tras finalizar
- [x] `terminadoEn` con `finalizadoEn` y con respaldo
- [x] Frontend: botón habilitado/deshabilitado con motivo, confirmación, cuerpo del PATCH, refresco, error del servidor, inicio del alumno con expediente finalizado
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` en verde

## Fuera de alcance

- Finalización automática al validar la última semana.
- Duración mínima: **no se aplica**. §11.2 pide "meta validada y duración mínima cumplida", pero la duración mínima es una pregunta abierta (§13 #1 y #2); hoy basta con la meta de horas. Hay que revisar esta regla cuando se resuelvan esas preguntas.
- Deshacer una finalización.

## Notas

- Pendiente en `docs/specs.md` (esta tarea no lo modifica): §9, la acción `FINALIZAR` de `PATCH /api/expedientes/:id/estado` y el campo `programasFinalizados` de `GET /api/me`; §8, la columna `finalizado_en` de `expedientes`; §11.2, el criterio vigente de finalización (solo meta de horas).
- El motivo es obligatorio también al finalizar, por consistencia con las demás acciones de estado.
