# 0013 — Acciones de vinculación sobre el expediente (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 3 (specs §14) |
| Specs | RF-01, RF-11, RF-12, RF-29, RN-03, RN-03a, RN-03b, RN-12, RN-13 |
| Proyecto | backend |

## Descripción

Vinculación gestiona el ciclo de vida del expediente: suspender, reactivar, dar de baja, transferir de institución conservando o no las horas, y asignar el siguiente programa (el tipo contrario) a los alumnos que finalizaron el primero. Toda acción pide un motivo y queda en la auditoría.

## Checklist

### Cambiar estado (RF-11, RF-12)
- [x] `PATCH /api/expedientes/:id/estado` con `{ accion, motivo }`; `accion`: `SUSPENDER`, `REACTIVAR`, `CANCELAR`; `motivo` obligatorio
- [x] Transiciones permitidas: `EN_PROCESO → SUSPENDIDO`, `SUSPENDIDO → EN_PROCESO`, `PENDIENTE`/`EN_PROCESO`/`SUSPENDIDO → CANCELADO`; cualquier otra responde 409
- [x] La transición se aplica con `UPDATE ... WHERE estado = <estado esperado>` para que dos acciones simultáneas no ganen las dos
- [x] Auditoría `SUSPENDER_EXPEDIENTE`, `REACTIVAR_EXPEDIENTE`, `CANCELAR_EXPEDIENTE` con el motivo (RF-29)

### Transferir (RN-12)
- [x] `POST /api/expedientes/:id/transferir` con `{ institucionId, conservarHoras, motivo }`; solo desde `EN_PROCESO` o `SUSPENDIDO`
- [x] En una transacción: el expediente actual pasa a `CANCELADO` (motivo: transferencia) y se crea uno nuevo `PENDIENTE` del mismo tipo, semestre y meta, con la institución nueva y sin supervisor
- [x] `minutosTransferidos` del nuevo = minutos validados del actual (semanas `VALIDADA` + sus `minutosTransferidos`, specs 8.4) si `conservarHoras`; si no, 0. `motivoTransferencia` = motivo
- [x] La institución nueva debe estar activa, ser del plantel y aceptar el tipo
- [x] El nuevo se confirma con el flujo de la 0012 (el alumno completa supervisor y datos; vinculación confirma)
- [x] Auditoría `TRANSFERIR_EXPEDIENTE` (expediente anterior, nuevo, horas conservadas, motivo)

### Asignar siguiente programa (RF-01, RN-03a)
- [x] `POST /api/expedientes/asignar` con `{ alumnoIds: [...] }` (uno o varios)
- [x] Crea el expediente `PENDIENTE` del tipo contrario solo si el alumno tiene su primer expediente `FINALIZADO` y está en 6.º semestre
- [x] Salta y reporta con motivo: primero no finalizado, expediente activo (RN-03), ya tiene expediente del tipo contrario, semestre menor a 6, alumno inexistente o de otro plantel
- [x] Vinculación solo asigna el tipo de su oficina (RN-03b); el admin, ambos
- [x] Respuesta `{ asignados, omitidos: [{ alumnoId, motivo }] }`; auditoría `ASIGNAR_PROGRAMA` por expediente creado

### Pruebas
- [x] Pruebas que nombran las reglas (`it('RN-12: ...')`, `it('RN-03a: ...')`, `it('RN-03: ...')`)
- [x] Cada ruta: caso feliz, validación inválida, 401 y 403 (alumno y vinculación de otra oficina)
- [x] `pnpm test` y `pnpm typecheck` en verde

## Fuera de alcance

- Pasar a `FINALIZADO` (meta validada y duración mínima): se decide con el cálculo de avance.
- Bloquear la asistencia de un expediente `SUSPENDIDO` (RN-13): se aplica en el registro de asistencia (0014); aquí solo se deja el estado.
- Pantallas del frontend: tarea 0016.

## Notas

- El expediente nuevo de una transferencia arranca en `PENDIENTE` con la institución elegida por vinculación; el alumno completa el resto y vinculación confirma (decisión del usuario, 2026-11-10).
- La baja también se permite desde `PENDIENTE` (decisión del usuario, 2026-11-10). El diagrama de specs §11.2 solo la muestra desde `EN_PROCESO` y `SUSPENDIDO`: es un hueco de las specs, no se modifican.
- "Asignar siguiente programa" exige el primer expediente `FINALIZADO`, tal como dice RF-01 (decisión del usuario, 2026-11-10).
- Como el índice `un_expediente_activo` permite un solo expediente activo por alumno, la transferencia cancela el actual antes de crear el nuevo, dentro de la misma transacción.
- Supuesto: no se transfiere un expediente `PENDIENTE`; antes de confirmar, la institución se cambia con `PATCH /api/expedientes/:id` (0012).
- `AuditLog.accion` es texto libre (no un enum de Prisma): no hay migración nueva.

### Contrato de la API (para la tarea 0016)

Todas las rutas piden sesión (401 `UNAUTHORIZED`) y rol `VINCULACION` o `ADMIN` (alumno: 403 `FORBIDDEN`). Los errores usan `{ error: { code, message, details? } }`. Un `:id` que no es uuid responde 400 `VALIDATION_ERROR`; un expediente inexistente o de otro plantel, 404; uno de otra oficina, 403 (RN-03b). Los cuerpos son estrictos: un campo desconocido responde 400 `VALIDATION_ERROR`. `motivo` es obligatorio, se recorta y admite hasta 500 caracteres. La respuesta `expediente` es la misma de la 0012.

| Ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `PATCH /api/expedientes/:id/estado` | `{ accion: "SUSPENDER" \| "REACTIVAR" \| "CANCELAR", motivo }` | 200 `{ expediente }` con el estado nuevo. Auditoría `SUSPENDER_EXPEDIENTE`, `REACTIVAR_EXPEDIENTE` o `CANCELAR_EXPEDIENTE` con `antes: { estado }` y `despues: { estado, motivo }` |
| `POST /api/expedientes/:id/transferir` | `{ institucionId, conservarHoras, motivo }` | 201 `{ anterior, nuevo }`: `anterior` ya `CANCELADO`; `nuevo` `PENDIENTE`, mismo tipo, semestre y meta, sin supervisor, con `minutosTransferidos` y la institución elegida. Auditoría `TRANSFERIR_EXPEDIENTE` sobre el expediente anterior (`despues` trae `expedienteNuevoId`, `institucionId`, `conservarHoras`, `minutosTransferidos`, `motivo`) |
| `POST /api/expedientes/asignar` | `{ alumnoIds: uuid[] }` (1 a 500; los repetidos se procesan una vez) | 200 `{ asignados: [{ alumnoId, expedienteId, tipo }], omitidos: [{ alumnoId, motivo }] }`, en el orden recibido. Auditoría `ASIGNAR_PROGRAMA` por cada expediente creado |

| Estado | `code` | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Cuerpo inválido: falta o está vacío el `motivo`, acción desconocida, `conservarHoras` no booleano, lista de alumnos vacía o con más de 500 |
| 400 | `INSTITUCION_INVALIDA` | Transferir: la institución no existe, es de otro plantel o está inactiva |
| 400 | `INSTITUCION_NO_ACEPTA_TIPO` | Transferir: la institución no recibe ese tipo de programa |
| 400 | `INSTITUCION_IGUAL` | Transferir a la institución en la que ya está el expediente |
| 409 | `TRANSICION_NO_PERMITIDA` | La acción no aplica al estado actual (suspender solo `EN_PROCESO`, reactivar solo `SUSPENDIDO`, baja desde `PENDIENTE`/`EN_PROCESO`/`SUSPENDIDO`, transferir desde `EN_PROCESO`/`SUSPENDIDO`), o una acción simultánea ganó antes |
| 409 | `EXPEDIENTE_ACTIVO_EXISTENTE` | Red de seguridad: el índice único `un_expediente_activo` rechazó el expediente nuevo de una transferencia |

Motivos de `omitidos` (texto en español, para mostrar tal cual): el alumno no existe (también si es de otro plantel); el primer expediente no está finalizado; ya tiene un expediente activo; ya finalizó el otro programa; aún no está en 6.º semestre; el siguiente programa corresponde a la otra oficina.

### Decisiones tomadas en la implementación

- Baja, suspensión y reactivación usan `UPDATE ... WHERE estado = <estado leído>` dentro de la transacción; quien pierde la carrera recibe 409 y no deja auditoría. Lo mismo la transferencia: cancela el actual con ese `UPDATE` antes de crear el nuevo.
- Minutos validados (specs 8.4) = suma de `minutosAcreditables` de las asistencias de semanas `VALIDADA` más los `minutosTransferidos` del expediente actual. Las semanas `ENVIADA`, `BORRADOR` y `RECHAZADA` no cuentan.
- El motivo de la baja o transferencia no tiene columna: vive en la auditoría; solo la transferencia lo copia a `motivoTransferencia` del expediente nuevo.
- Transferir a la misma institución del expediente se rechaza con 400 `INSTITUCION_IGUAL` (decisión conservadora; no está en las specs).
- La transferencia no vuelve a exigir 5.º semestre ni datos completos: el nuevo nace `PENDIENTE` con el semestre del anterior y se valida al confirmar (flujo de la 0012).
- "Primer programa" = tipo del expediente más antiguo del alumno; basta con que exista un expediente de ese tipo `FINALIZADO`. Así un primer intento cancelado y repetido (o transferido) del mismo tipo cuenta. El tipo asignado es el contrario a ese.
- El semestre del expediente asignado es el del alumno (6 o más). La meta sale de `META_HORAS` (480 servicio social, 240 prácticas), igual que la importación.
- Un alumno se omite por "ya tiene un expediente del otro programa" solo si el del tipo contrario está activo (`PENDIENTE`, `EN_PROCESO`, `SUSPENDIDO`) o `FINALIZADO`; uno `CANCELADO` no bloquea y se crea un `PENDIENTE` nuevo de ese tipo (decisión del usuario, 2026-11-10). Un activo se reporta con el motivo de expediente activo (RN-03); el motivo de "otro programa" queda solo para el finalizado.
- Asignar procesa cada alumno en su propia transacción; un conflicto (`P2002` por una solicitud simultánea) lo omite como "expediente activo" sin deshacer a los demás. Máximo 500 alumnos por solicitud.
- Vinculación que pide un tipo de otra oficina no recibe 403: el alumno va a `omitidos` con el motivo (RN-03b); el admin asigna ambos.
- Pruebas: `test/factories.ts` ganó `crearSemana` (semana de bitácora con asistencias cerradas) y `borrarPlantel` borra asistencias y semanas.

### Implementación

- Dominio puro: `src/domain/expedientes.ts` (`transicionDeEstado`, `puedeTransferir`, `tipoContrario`, `decidirAsignacion`).
- Rutas, esquemas y servicio en `src/modules/expedientes/`; pruebas en `expedientes.acciones.test.ts` y `src/domain/expedientes.test.ts`.
