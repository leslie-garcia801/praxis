# 0061 — Horas de libreta (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | Mejora posterior al MVP |
| Specs | RF-17a, RN-19, RN-04, RN-09, RN-11, RN-17, RF-21, RF-22, RF-29 |
| Proyecto | backend |

## Descripción

Un alumno que ya tenía horas registradas y firmadas en una libreta de papel antes de usar la app puede capturar esos turnos. Van al supervisor por el enlace de validación semanal que ya existe (RF-21); si el supervisor rechaza, la semana vuelve al alumno, que reemplaza los turnos y la reenvía. El respaldo de la oficina (validar en nombre del supervisor al ver la libreta de papel) ya existe como RF-22 y no necesita código nuevo.

- Migración `horas_libreta`: enum `OrigenAsistencia { QR, LIBRETA }` (`origen_asistencia`) y columna `Asistencia.origen` (por omisión `QR`); columna `SemanaBitacora.deLibreta` (`de_libreta`, por omisión `false`).
- `POST /api/semanas/libreta` (solo ALUMNO): `{ turnos: [{ id, fecha, entrada, salida }] }`, de 1 a 200. En una transacción crea las semanas con `deLibreta = true`, `estado = ENVIADA`, `enviadaEn = ahora`, sin bitácora; crea los turnos `CERRADA` con origen `LIBRETA`; recalcula los minutos acreditables con `recalcularDias` (RN-04, RN-09) y registra `REGISTRAR_HORAS_LIBRETA` (entidad `Expediente`, solo conteos y minutos). Responde 201 con las semanas y sus turnos.
- Validaciones (409, con `details` por fila `{ index, code, message }`): expediente `EN_PROCESO` (`EXPEDIENTE_NO_ACTIVO`) con supervisor (`SIN_SUPERVISOR`); fecha desde `fechaInicio` (`ANTES_DE_FECHA_INICIO`); semana cerrada (`SEMANA_NO_CERRADA`); salida posterior a la entrada el mismo día (`HORARIO_INVALIDO`); sin traslapes entre los turnos enviados ni con los existentes (`ASISTENCIA_TRASLAPADA`, también desde la restricción `asistencia_sin_traslape`); sin mezclar orígenes (`SEMANA_CON_TURNOS_QR`) y sin repetir semana de libreta (`SEMANA_DE_LIBRETA_EXISTENTE`); `id` ya usado o repetido en el envío (`ASISTENCIA_ID_EN_USO`).
- `PUT /api/semanas/:id/libreta` (solo ALUMNO dueño): para una semana `deLibreta` en estado `RECHAZADA`. Todos los turnos deben caer en esa semana (`TURNO_FUERA_DE_SEMANA`). Pasa la semana a `ENVIADA` con `UPDATE ... WHERE estado = 'RECHAZADA'`, borra los turnos anteriores, crea los nuevos, recalcula y registra `CORREGIR_HORAS_LIBRETA`; conserva `comentario` y `rechazadaEn`. Otro estado: 409 `SEMANA_NO_EDITABLE`; una semana que no es de libreta: 409 `SEMANA_NO_DE_LIBRETA`.
- Integraciones: `enviarSemana` y `guardarBitacora` rechazan semanas de libreta (409 `SEMANA_DE_LIBRETA`, excepción a RN-17); el paso 1 del resumen semanal ignora semanas de libreta y el paso 2 las incluye en el correo al supervisor; el enlace de validación expone `deLibreta` (semana) y `origen` (turno); el historial (`GET /api/asistencias`) expone `deLibreta`, `origen`, `puedeCorregirLibreta` y `puedeEditar = false` en semanas de libreta; `GET /api/semanas/pendientes` expone `deLibreta`; `solicitarCorreccion` rechaza turnos de libreta (409 `TURNO_DE_LIBRETA`) y `puedeSolicitarCorreccion` es falso para ellos; un escaneo que caiga en una semana de libreta se rechaza (409 `SEMANA_DE_LIBRETA`); el reporte PDF marca los turnos de libreta con "(libreta)".

## Checklist

- [x] Pruebas primero (en rojo) y luego implementación
- [x] Migración `horas_libreta` (aplicada a la base de desarrollo y a la de prueba)
- [x] POST: caso feliz con auditoría, RN-04, RN-09, avance solo al validar, enlace del supervisor (validar y rechazar), resumen semanal, semana en curso, antes de `fechaInicio`, medianoche, traslapes (entre turnos y con existentes), semana con QR, semana de libreta repetida, ids repetidos, expediente sin proceso o sin supervisor, 400, 401, 403 (vinculación y administración)
- [x] PUT: reenvío tras rechazo con historial, 409 por estado y por semana que no es de libreta, turno fuera de la semana, tope diario, 400, 401, 403 (rol y otro alumno), 404
- [x] `enviarSemana` / `guardarBitacora` 409, corrección de turno de libreta 409, escaneo en semana de libreta 409, pendientes, historial
- [x] `docs/specs.md` v0.4: RF-17a, RN-19, §8.1, §8.2 y §9
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` en verde

## Fuera de alcance

- Pantallas del frontend: tarea 0062.
- Subir una foto de la libreta: se descartó.
- Correo inmediato al supervisor: lo envía el trabajo del lunes (`resumenSemanal`), no la captura.
- Horas de libreta de la semana en curso: se registran con QR.

## Notas

- Identificadores duplicados: se responde 409 `ASISTENCIA_ID_EN_USO` (no se devuelve el registro previo como en el escaneo), porque un envío de libreta es por lote y reintentarlo toparía de todos modos con `SEMANA_DE_LIBRETA_EXISTENTE`. En el PUT se pueden reutilizar los ids de los turnos de la propia semana, que se reemplazan.
- Cuando hay varios errores por fila, `code` y `message` de nivel superior son los del primero y `details` los lista todos.
