# 0012 — Supervisores y completar expediente (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 3 (specs §14) |
| Specs | RF-09, RF-10, RF-11, RF-29, RN-01, RN-02, RN-03, RN-03b, RN-06 |
| Proyecto | backend |

## Descripción

El expediente ya existe en estado `PENDIENTE` desde la importación de alumnos (0004), con el tipo asignado. En esta tarea el alumno lo completa: institución, departamento, supervisor (jefe inmediato), fecha de inicio y, en prácticas, fecha de término y horario pactado. Si su supervisor no está en el catálogo, el alumno lo da de alta y queda pendiente. Vinculación revisa y confirma: el expediente pasa a `EN_PROCESO` y el supervisor nuevo queda confirmado en la misma acción.

## Checklist

### Supervisores (RF-09)
- [x] `GET /api/instituciones/:id/supervisores`: vinculación y admin ven todos los campos; el alumno ve solo los confirmados con título, nombre, apellidos, puesto y departamento (más el supervisor de su propio expediente aunque esté pendiente)
- [x] `POST /api/instituciones/:id/supervisores`: el alumno lo crea pendiente (`confirmado = false`); vinculación y admin lo crean confirmado
- [x] `PATCH /api/supervisores/:id`: vinculación y admin
- [x] Auditoría (`CREAR_SUPERVISOR`, `EDITAR_SUPERVISOR`) (RF-29)

### Completar expediente (RF-10)
- [x] `GET /api/expedientes/:id`: el alumno dueño o vinculación de la oficina del tipo (RN-03b)
- [x] `GET /api/expedientes?estado=`: vinculación ve los de su oficina (para saber qué confirmar)
- [x] `PATCH /api/expedientes/:id`: el alumno dueño solo mientras está `PENDIENTE`; vinculación de su oficina en cualquier estado activo
- [x] Validaciones: semestre 5 o mayor (RN-01); institución activa, del plantel y que acepte el tipo; supervisor de esa institución; en prácticas, fecha de término posterior al inicio y horario pactado (días, entrada antes de salida) (RN-06)
- [x] La fecha de inicio acepta cualquier fecha, pasada o futura
- [x] Auditoría `EDITAR_EXPEDIENTE`

### Confirmar (RF-10, RF-11)
- [x] `POST /api/expedientes/:id/confirmar`: vinculación de la oficina del tipo; solo desde `PENDIENTE` y con los datos obligatorios completos
- [x] Pasa a `EN_PROCESO` y marca al supervisor como confirmado en la misma transacción
- [x] Auditoría `CONFIRMAR_EXPEDIENTE`

### Pruebas
- [x] Pruebas que nombran las reglas (`it('RN-01: ...')`, `it('RN-03b: ...')`, etc.)
- [x] Cada ruta: caso feliz, validación inválida, 401 y 403 (incluido alumno ajeno y vinculación de otra oficina)
- [x] `pnpm test` y `pnpm typecheck` en verde

## Fuera de alcance

- Suspender, reactivar, cancelar, transferir y "asignar siguiente programa" (RN-03a): tarea 0013.
- Registro de asistencia: tarea 0014.
- Pantallas del frontend: tarea 0016.
- Avisos de riesgo (RN-06a) y marca de turnos fuera de horario (RN-06b).

## Notas

- Confirmar el expediente confirma también al supervisor nuevo; no hay revisión de supervisores por separado (decisión del usuario, 2026-11-10).
- La fecha de inicio no tiene ventana; vinculación la revisa al confirmar (decisión del usuario, 2026-11-10). Si se puede registrar asistencia antes de esa fecha se decide en la 0014.
- El alumno edita solo mientras el expediente está `PENDIENTE`; cambiar de institución después de confirmar es una transferencia (RN-12, 0013) (decisión del usuario, 2026-11-10).
- El alumno no ve correo, teléfono ni extensión de los supervisores (decisión del usuario, 2026-11-10).
- Las restricciones SQL del §8.3 ya están en la migración inicial; esta tarea no necesita migración salvo que aparezca un hueco. No apareció ninguno: no hay migración nueva.

### Contrato de la API (para la tarea 0016)

Todas las rutas piden sesión (401 `UNAUTHORIZED`). Los errores usan `{ error: { code, message, details? } }`. Un `:id` que no es uuid responde 400 `VALIDATION_ERROR`. Lo que no existe o es de otro plantel responde 404 `NOT_FOUND`; un recurso del plantel al que el usuario no puede entrar (alumno ajeno, oficina distinta) responde 403 `FORBIDDEN`.

**Supervisores.** La respuesta `supervisor` para el alumno trae solo `id, institucionId, titulo, nombre, apellidoPaterno, apellidoMaterno, puesto, departamento, confirmado`; vinculación y admin reciben además `correo, telefono, extension`.

| Ruta | Roles | Cuerpo | Respuesta y errores |
| --- | --- | --- | --- |
| `GET /api/instituciones/:id/supervisores` | ALUMNO, VINCULACION, ADMIN | — | 200 `{ supervisores }`. Alumno: solo `confirmado = true` más el supervisor del expediente activo propio aunque esté pendiente. 404 si la institución es de otro plantel o, para el alumno, está inactiva |
| `POST /api/instituciones/:id/supervisores` | ALUMNO, VINCULACION, ADMIN | `nombre`, `apellidoPaterno`, `correo` (obligatorios); `titulo`, `apellidoMaterno`, `puesto`, `departamento`, `telefono`, `extension` (opcionales) | 201 `{ supervisor }`. Alumno lo crea con `confirmado = false`; vinculación y admin con `true`. 400 `VALIDATION_ERROR`; 404 igual que el GET. Auditoría `CREAR_SUPERVISOR` |
| `PATCH /api/supervisores/:id` | VINCULACION, ADMIN | Cualquiera de los campos anteriores (los opcionales aceptan `null`); mínimo uno. `confirmado` e `institucionId` no se editan por aquí | 200 `{ supervisor }`. 403 alumno; 404 de otro plantel. Auditoría `EDITAR_SUPERVISOR` solo si algo cambió |

**Expedientes.** La respuesta `expediente` trae: `id, tipo, estado, semestre, metaHoras, minutosTransferidos, departamento, fechaInicio, fechaTermino` (fechas `"AAAA-MM-DD"`), `diasPactados` (1 = lunes … 7 = domingo), `horaEntrada`, `horaSalida` (`"HH:mm"`), `programa`, `subprograma`, `creadoEn`, `alumno { id, nombre, apellidoPaterno, apellidoMaterno, matricula, carrera, semestre, grupo, turno }`, `institucion { id, nombre } | null`, `supervisor | null` (campos limitados para el alumno, completos para vinculación, más `confirmado`) y `faltantes`: lista de campos que aún faltan para confirmar, vacía si ya se puede.

| Ruta | Roles | Cuerpo | Respuesta y errores |
| --- | --- | --- | --- |
| `GET /api/expedientes?estado=` | VINCULACION, ADMIN | `estado` opcional: `PENDIENTE`, `EN_PROCESO`, `SUSPENDIDO`, `FINALIZADO`, `CANCELADO` | 200 `{ expedientes }`, del plantel y de la oficina del usuario (RN-03b; admin ve ambas), más recientes primero. 400 si `estado` no es válido; 403 alumno |
| `GET /api/expedientes/:id` | ALUMNO dueño; VINCULACION de la oficina del tipo; ADMIN | — | 200 `{ expediente }`. 403 alumno ajeno u oficina distinta; 404 inexistente o de otro plantel |
| `PATCH /api/expedientes/:id` | ALUMNO dueño solo en `PENDIENTE`; VINCULACION de la oficina y ADMIN en `PENDIENTE`, `EN_PROCESO` o `SUSPENDIDO` | Parcial, mínimo un campo, no acepta campos desconocidos: `institucionId`, `supervisorId` (`null` lo quita), `departamento`, `fechaInicio`; prácticas: `fechaTermino`, `diasPactados` (arreglo 1–7, se ordena y quita repetidos), `horaEntrada`, `horaSalida`; servicio social: `programa`, `subprograma` | 200 `{ expediente }`. Errores en la tabla de abajo. Auditoría `EDITAR_EXPEDIENTE` solo si algo cambió |
| `POST /api/expedientes/:id/confirmar` | VINCULACION de la oficina, ADMIN (alumno: 403) | sin cuerpo | 200 `{ expediente }` ya `EN_PROCESO`, con el supervisor `confirmado = true`. Errores en la tabla de abajo. Auditoría `CONFIRMAR_EXPEDIENTE` |

| Estado | `code` | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Cuerpo inválido, vacío o con campos no editables (`tipo`, `estado`, `metaHoras`, `minutosTransferidos`...) |
| 400 | `CAMPOS_NO_APLICABLES` | Campos de prácticas en servicio social o al revés; `details: { campos }` |
| 400 | `INSTITUCION_INVALIDA` | La institución no existe, es de otro plantel o está inactiva |
| 400 | `INSTITUCION_NO_ACEPTA_TIPO` | No acepta servicio social / prácticas (`aceptaServicio`, `aceptaPracticas`) |
| 400 | `SUPERVISOR_INVALIDO` | El supervisor no existe (o es de otro plantel) |
| 400 | `SUPERVISOR_DE_OTRA_INSTITUCION` | El supervisor no es de la institución resultante (también al cambiar de institución sin quitar o cambiar el supervisor) |
| 400 | `PERIODO_INVALIDO` | `fechaTermino` no es posterior a `fechaInicio` (se compara contra lo ya guardado) |
| 400 | `HORARIO_INVALIDO` | `horaEntrada` no es anterior a `horaSalida` (se compara contra lo ya guardado) |
| 409 | `EXPEDIENTE_NO_EDITABLE` | El alumno edita fuera de `PENDIENTE`, o cualquiera edita un expediente `FINALIZADO` o `CANCELADO` |
| 409 | `SEMESTRE_INSUFICIENTE` | RN-01: el semestre del expediente o del alumno es menor a 5 (PATCH y confirmar) |
| 409 | `EXPEDIENTE_NO_PENDIENTE` | Confirmar un expediente que no está `PENDIENTE` |
| 409 | `EXPEDIENTE_INCOMPLETO` | Confirmar con datos faltantes; `details: { faltantes: [...] }` con los nombres de campo |
| 409 | `EXPEDIENTE_ACTIVO_EXISTENTE` | RN-03: el alumno ya tiene otro expediente `EN_PROCESO` |

### Decisiones tomadas en la implementación

- Un expediente de otro plantel o inexistente responde 404; uno del plantel pero ajeno al alumno o a otra oficina responde 403 (misma convención que `requireOficina` y que instituciones).
- Las reglas entre campos (periodo, horario, supervisor de la institución) se validan contra el estado resultante del expediente, no solo contra lo enviado. Cambiar de institución con un supervisor de la anterior es error; se resuelve mandando también un `supervisorId` nuevo o `null`.
- `institucionId` y `fechaInicio` no aceptan `null`. La institución solo se revisa (activa, plantel, acepta el tipo) cuando se envía `institucionId`, para que una institución que se desactiva después no bloquee otras correcciones.
- El alumno puede elegir como supervisor cualquiera de la institución, incluso uno pendiente que no ve en el listado (por ejemplo el que acaba de crear); no hay otra forma de enlazarlo a su expediente.
- Los campos que no aplican al tipo y los no editables se rechazan con 400 (el esquema del PATCH es estricto), no se ignoran en silencio.
- Confirmar usa `UPDATE ... WHERE estado = 'PENDIENTE'` dentro de la transacción para que dos confirmaciones simultáneas no ganen las dos. RN-03 se revisa antes y, como red de seguridad, un `P2002` del índice único `un_expediente_activo` se traduce a `EXPEDIENTE_ACTIVO_EXISTENTE`. Como ese índice cubre también `PENDIENTE`, la rama explícita no se alcanza con datos reales; la prueba de RN-03 verifica la restricción de la base.
- Al confirmar no se vuelve a revisar que la institución siga activa o acepte el tipo; la oficina la ve al confirmar.
- Cualquier usuario alumno puede dar de alta supervisores pendientes en instituciones activas de su plantel; no se pide que tenga expediente (la spec no lo exige).
- Pruebas: `test/factories.ts` ganó `crearSupervisor`, las opciones `semestre` y `datos` de `crearExpediente`, y `borrarPlantel` ahora borra supervisores, expedientes de las instituciones y sus auditorías.

### Implementación

- Dominio puro: `src/domain/expedientes.ts` (`semestreValido`, `periodoValido`, `horarioValido`, `faltantesParaConfirmar`).
- Módulos: `src/modules/supervisores/` y `src/modules/expedientes/` (routes, schemas, service, test), montados en `src/app.ts`.

### Prueba manual con curl

El inicio de sesión necesita el encabezado `Origin` igual a `FRONTEND_ORIGIN` y guarda la cookie en un archivo.

```bash
O=http://localhost:5173; A=http://localhost:3000/api
# Vinculación entra con correo; el alumno usa /auth/sign-in/username con {"username":"<matrícula>","password":"..."}
curl -c vinc.txt -H "Origin: $O" -H "Content-Type: application/json" -d '{"email":"<correo>","password":"<contraseña>"}' $A/auth/sign-in/email
curl -b vinc.txt "$A/expedientes?estado=PENDIENTE"          # qué falta confirmar
curl -b vinc.txt $A/expedientes/<expedienteId>
curl -b vinc.txt -H "Origin: $O" -H "Content-Type: application/json" -X POST -d '{"nombre":"Laura","apellidoPaterno":"Mendoza","correo":"laura@empresa.mx"}' $A/instituciones/<institucionId>/supervisores
curl -b vinc.txt -H "Origin: $O" -H "Content-Type: application/json" -X PATCH -d '{"puesto":"Gerente"}' $A/supervisores/<supervisorId>
# Alumno (cookie alumno.txt): ver supervisores sin correo ni teléfono y completar su expediente
curl -b alumno.txt $A/instituciones/<institucionId>/supervisores
curl -b alumno.txt -H "Origin: $O" -H "Content-Type: application/json" -X PATCH -d '{"institucionId":"<id>","supervisorId":"<id>","fechaInicio":"2026-11-16","departamento":"Sistemas"}' $A/expedientes/<expedienteId>
# Confirmar (vinculación de la oficina del tipo)
curl -b vinc.txt -H "Origin: $O" -X POST $A/expedientes/<expedienteId>/confirmar
```
