# 0026 — Panel de vinculación: tabla, alertas y "en riesgo" (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (specs §14) |
| Specs | RF-23, RF-24, RN-03b, RN-06, RN-06a, RN-11, RN-16, RN-18, RNF-04, specs §8.4, §9 |
| Proyecto | backend |

## Descripción

`GET /api/panel/alumnos`: la tabla de alumnos de la oficina del usuario con filtros, columnas de avance y las alertas de RF-24. Para soportar 400 alumnos (RNF-04) sin calcular el avance alumno por alumno (unas 6 consultas cada uno), las horas, el último registro y las semanas pendientes salen de **una consulta SQL agregada**, y la fecha estimada y "en riesgo" se calculan en memoria con `estimarFechaTermino` sobre los minutos por día de los últimos 28 días.

## Decisiones (usuaria, 2026-11-11)
- **En riesgo (RN-06a):** la fecha estimada de término (RN-16) cae después del límite, o el límite ya pasó y el alumno no terminó. Faltar algunos días no es riesgo en sí: esos días suman 0 y bajan el ritmo. Con menos de 5 días registrados es "sin datos suficientes", no "en riesgo".
- **Límite:** prácticas → `fechaTermino` del expediente (unos 3 meses, 240 h); servicio social → `fechaInicio` + 6 meses (constante configurable, pregunta abierta #1 de specs §13). Sin fecha de inicio (o, en prácticas, sin fecha de término) no se evalúa.
- **Tope diario:** 6 h 30 min (tarea 0025).

## Checklist

### Dominio
- [x] `src/domain/riesgo.ts`: `evaluarRiesgo({ tipo, fechaInicio, fechaTermino, estimacion, completado, hoy })` → `'EN_RIESGO' | 'EN_TIEMPO' | 'SIN_DATOS' | 'NO_EVALUABLE' | 'COMPLETADO'`; `limiteExpediente(...)`; constante `MESES_SERVICIO_SOCIAL = 6`. Pura y con pruebas

### Consulta agregada (`src/modules/panel/panel.service.ts`)
- [x] Una consulta (`$queryRaw`, nombres de la base) por expediente de la oficina (RN-03b con `alcanceOficina`) y del plantel: minutos validados (semanas `VALIDADA` + `minutosTransferidos`, §8.4), minutos registrados sin validar, último registro (`MAX(entrada)`), semanas `ENVIADA`, semanas `ENVIADA` con `enviadaEn` de hace más de 7 días (RN-18), turnos `INCOMPLETA`
- [x] Segunda consulta: minutos acreditables por expediente y día local (America/Monterrey) de los últimos 28 días y la fecha del primer registro, para `estimarFechaTermino`
- [x] Prueba de consistencia: para varios expedientes, los minutos validados y registrados del panel son iguales a los de `obtenerAvance` (0015)

### `GET /api/panel/alumnos` (`VINCULACION`, `ADMIN`)
- [x] Filtros opcionales: `carreraId`, `semestre`, `grupo`, `turno`, `estado` (por defecto `EN_PROCESO` y `SUSPENDIDO`; `TODOS` los incluye todos), `institucionId`, `tipo` (solo dentro del alcance del usuario), `riesgo` (`EN_RIESGO`)
- [x] Fila: expediente (`id`, `tipo`, `estado`), alumno (`id`, nombre completo, matrícula, carrera, semestre, grupo, turno), institución, `minutosValidados`, `metaMinutos`, `porcentaje`, `minutosRegistrados`, `ultimoRegistro`, `semanasPendientes`, `fechaEstimada`, `riesgo`
- [x] `alertas` (RF-24), contadas sobre la oficina completa (no sobre los filtros): alumnos `EN_PROCESO` sin registros en 7 días (incluye a los que nunca registraron después de su fecha de inicio), semanas `ENVIADA` hace más de 7 días (RN-18), turnos `INCOMPLETA`, supervisores sin confirmar (`confirmado = false`) de expedientes de la oficina. Cada alerta con el total y los `expedienteId` afectados (los supervisores, con su id e institución)
- [x] Orden: primero en riesgo, después por apellido. Sin paginación (400 filas caben en una respuesta); se revisa si crece
- [x] Índices nuevos: no hacen falta (400 expedientes; `asistencias (expediente_id, entrada)` y `semanas_bitacora (expediente_id, semana_inicio)` ya cubren los accesos). Sin migración

### Pruebas
- [x] `RN-06a: en riesgo si la fecha estimada pasa el límite`; `RN-06a: en riesgo si el límite ya pasó y no terminó`; servicio social con inicio + 6 meses; sin datos; no evaluable
- [x] `RN-03b: vinculación de prácticas no ve expedientes de servicio social`; admin ve ambos; otro plantel no aparece
- [x] Cada filtro; `RN-18: alerta de semanas sin validar en más de 7 días`; cada alerta de RF-24
- [x] Consistencia con `obtenerAvance`; 401, 403 (alumno), 400 (filtro inválido)

## Fuera de alcance
- Pantalla del panel (0027), exportaciones a Excel (0028), PDF (0029), detalle del alumno y validación en nombre del supervisor (0030).
- Días inhábiles (pregunta abierta #5): hoy todos los días cuentan.

## Notas

### Contrato de la API (para el frontend)

`GET /api/panel/alumnos` (sesión; roles `VINCULACION`, `ADMIN`; el alcance sale de la oficina del usuario, RN-03b).

**Query (todos opcionales; vacío = sin filtro)**
- `carreraId` (uuid), `semestre` (1-12), `grupo` (texto exacto), `turno` (`MATUTINO`|`VESPERTINO`), `institucionId` (uuid)
- `estado`: `PENDIENTE|EN_PROCESO|SUSPENDIDO|FINALIZADO|CANCELADO|TODOS`. Sin `estado`: `EN_PROCESO` y `SUSPENDIDO`
- `tipo`: `SERVICIO_SOCIAL|PRACTICAS`. Fuera del alcance del usuario: **403 FORBIDDEN**
- `riesgo`: solo `EN_RIESGO`

**Respuesta 200** `{ alumnos: Fila[], alertas: Alertas }`. Orden: primero `EN_RIESGO`, luego apellido paterno, materno y nombre (es). Sin paginación.

`Fila`:
```json
{
  "expediente": { "id": "uuid", "tipo": "SERVICIO_SOCIAL", "estado": "EN_PROCESO", "fechaInicio": "2026-03-02", "fechaTermino": null },
  "alumno": { "id": "uuid", "nombre": "Ana María López García", "matricula": "00000000000001", "carrera": "Programación", "semestre": 5, "grupo": "A", "turno": "MATUTINO" },
  "institucion": { "id": "uuid", "nombre": "..." },
  "minutosValidados": 1500, "metaMinutos": 28800, "porcentaje": 5, "minutosRegistrados": 120,
  "ultimoRegistro": "2026-05-15T14:00:00.000Z",
  "semanasPendientes": 2,
  "fechaEstimada": "2026-09-01",
  "limite": "2026-09-02",
  "riesgo": "EN_TIEMPO"
}
```
- `institucion`, `ultimoRegistro`, `fechaEstimada`, `limite`, `matricula`, `fechaInicio`, `fechaTermino` pueden ser `null`. Fechas de calendario `AAAA-MM-DD`; `ultimoRegistro` es un instante UTC (mostrar en America/Monterrey).
- `semanasPendientes` = semanas `ENVIADA` (esperan validación).
- `fechaEstimada` es `null` si hay menos de 5 días de datos o ya completó.
- `riesgo`: `EN_RIESGO` | `EN_TIEMPO` | `SIN_DATOS` | `NO_EVALUABLE` | `COMPLETADO`.

`Alertas` (siempre sobre la oficina completa, ignora los filtros):
```json
{
  "sinRegistros": { "total": 3, "expedienteIds": ["uuid"] },
  "semanasSinValidar": { "total": 4, "expedienteIds": ["uuid"] },
  "turnosIncompletos": { "total": 2, "expedienteIds": ["uuid"] },
  "supervisoresSinConfirmar": { "total": 1, "supervisores": [{ "id": "uuid", "nombre": "Marta Mendoza", "institucion": { "id": "uuid", "nombre": "..." }, "expedienteIds": ["uuid"] }] }
}
```
- `sinRegistros.total` cuenta alumnos; `semanasSinValidar.total` cuenta semanas; `turnosIncompletos.total` cuenta turnos; `supervisoresSinConfirmar.total` cuenta supervisores. `expedienteIds` son los expedientes afectados.

**Errores:** 401 `UNAUTHORIZED` sin sesión; 403 `FORBIDDEN` (alumno, o `tipo` fuera del alcance); 400 `VALIDATION_ERROR` (filtro inválido, `details: [{ path, message }]`).

### Decisiones que el plan no cubría
- `riesgo`: si el límite ya pasó y no terminó es `EN_RIESGO` aunque haya menos de 5 días de datos (gana sobre `SIN_DATOS`). El día del límite aún no cuenta como vencido (`hoy > limite`). Horas registradas que ya cubren la meta pero sin validar: `EN_TIEMPO`.
- Alertas: `sinRegistros` = `EN_PROCESO` con último registro (o, si nunca registró, `fechaInicio`) hace 7 días o más (día local). `semanasSinValidar` y `turnosIncompletos` solo expedientes `EN_PROCESO`/`SUSPENDIDO`. `supervisoresSinConfirmar` incluye expedientes `PENDIENTE`, `EN_PROCESO` y `SUSPENDIDO`.
- Fila extra `limite` (fecha límite usada para el riesgo) y `expediente.fechaInicio/fechaTermino`.
- Una sola consulta base (datos del alumno, institución, supervisor y totales) más la consulta de minutos por día; los filtros no temporales se aplican en memoria. Sin migración ni índices nuevos.

### Prueba manual
1. `docker compose up -d`, `cd backend && pnpm dev`, iniciar sesión como vinculación o admin (cookie de sesión).
2. `GET /api/panel/alumnos` devuelve alumnos EN_PROCESO/SUSPENDIDO de la oficina y `alertas`.
3. Probar `?estado=TODOS`, `?semestre=5&turno=MATUTINO`, `?riesgo=EN_RIESGO`, y `?tipo=PRACTICAS` con una oficina de servicio social (403).
4. Comparar `minutosValidados` y `minutosRegistrados` de un alumno con `GET /api/expedientes/:id/avance`.

