# 0014 — Registro de asistencia por escaneo (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 3 (specs §14) |
| Specs | RF-14, RF-15, RN-04, RN-07, RN-08, RN-09, RN-10, RN-13, RN-14, RN-15 |
| Proyecto | backend |

## Descripción

El alumno registra su entrada o salida escaneando el QR de su institución o escribiendo el código corto. Sin turno abierto se registra la entrada; con turno abierto, la salida, y se recalculan los minutos acreditables del día. El endpoint es idempotente por el `id` generado en el cliente, para soportar reintentos del registro sin conexión.

## Checklist

### Endpoint (RF-14, RF-15, specs §9)
- [x] `POST /api/asistencias/escaneo`, solo rol `ALUMNO`, cuerpo `{ id (uuid), token | codigoCorto, hora?, sinConexion }` (exactamente uno de `token` o `codigoCorto`)
- [x] El token se compara por hash contra `qrTokenHash`; el código corto contra `codigoCorto`. QR desconocido → 404
- [x] RN-10: el QR debe ser de la institución del expediente activo del alumno; si no, 409 con aviso
- [x] El expediente debe estar `EN_PROCESO`; RN-13: `SUSPENDIDO` → 409 con aviso específico; sin expediente activo o `PENDIENTE` → 409
- [x] La fecha local del escaneo anterior a `fechaInicio` del expediente → 409 con aviso; no se guarda nada
- [x] Idempotencia: el mismo `id` del mismo alumno responde 200 con el registro existente; un `id` que pertenece a otro alumno → 409
- [x] Idempotencia de la salida: columna `salida_id` (migración nueva); el reenvío de una salida con el mismo `id` responde 200 `tipo: SALIDA` sin crear una entrada nueva

### Hora (RN-14, RN-15)
- [x] Con conexión se usa la hora del servidor y se ignora `hora`
- [x] Con `sinConexion: true` se usa `hora` del dispositivo; se rechaza (409) si tiene más de 72 horas o está en el futuro (tolerancia de 5 minutos por desfase de reloj)
- [x] `sinConexion` se guarda en la asistencia

### Entrada y salida (RN-04, RN-07, RN-08, RN-09)
- [x] Sin turno abierto → crea la asistencia `ABIERTA` con `entrada` (201, `tipo: ENTRADA`)
- [x] Con turno abierto del mismo día local → registra `salida`, estado `CERRADA` (200, `tipo: SALIDA`)
- [x] Al cerrar, se recalculan los `minutosAcreditables` de los turnos del día con `calcularMinutosAcreditables` (RN-04 tope de 300, RN-09 mínimo 15)
- [x] Con turno abierto de un día anterior → se cierra con `cerrarTurnoAbierto` (`INCOMPLETA`, 0 minutos) y el escaneo registra una entrada nueva
- [x] Todo en una transacción; las violaciones de `un_turno_abierto` y `asistencia_sin_traslape` responden 409 en lugar de 500
- [x] Respuesta: `{ tipo, asistencia, minutosDia, minutosAcreditablesDia, excedente }` para la confirmación y el aviso de RN-04

### Pruebas
- [x] Una prueba por regla con su ID en el nombre: RN-04, RN-07, RN-08, RN-09, RN-10, RN-13, RN-14
- [x] Caso feliz (entrada y salida, por token y por código corto), validación inválida (400), sin sesión (401), rol incorrecto (403)
- [x] Idempotencia (mismo `id` dos veces) y `id` de otro alumno
- [x] Escaneo antes de `fechaInicio` rechazado; escaneo después de `fechaTermino` aceptado
- [x] `pnpm test`, `pnpm typecheck` y `pnpm lint` en verde en `backend/`

## Fuera de alcance

- Marca de turno fuera del horario pactado (RN-06b): se calcula al leer, en la iteración 4 con la validación del supervisor.
- Solicitud de corrección (RF-17), pantalla de avance (RF-18, RF-19), escáner y cola sin conexión en el frontend (RF-16).
- Cierre de turnos abiertos que nadie vuelve a escanear: se resuelve al leer (panel, RF-24), no con una tarea programada.
- Asignación de la asistencia a su `SemanaBitacora` (iteración 4).

## Notas

- Antes de `fechaInicio` no se registra asistencia; se rechaza con aviso (decisión del usuario, 2026-11-10; pendiente que venía de la 0012).
- En prácticas, después de `fechaTermino` se acepta mientras falten horas (decisión del usuario, 2026-11-10). Se implementa con el estado: mientras el expediente siga `EN_PROCESO` se acepta; al llegar a `FINALIZADO` (meta validada, RN-11) ya no. No hay validación extra contra `fechaTermino`. Señala la pregunta abierta 2 de specs §13.
- RN-08 se aplica al escanear: un turno abierto de un día anterior ya debería estar cerrado a las 23:59, así que se cierra como `INCOMPLETA` antes de registrar la entrada nueva.

### Decisiones técnicas

- Lógica pura en `backend/src/domain/asistencias.ts` (`resolverInstante`, `decidirAccion`, `motivoRechazoExpediente`); el servicio orquesta y `registrarEscaneo` acepta un reloj inyectable. Las pruebas de ruta fijan solo `Date` con `vi.useFakeTimers({ toFake: ['Date'] })`.
- El expediente es el activo del alumno (`PENDIENTE`, `EN_PROCESO` o `SUSPENDIDO`). Se evalúa en este orden: idempotencia, estado del expediente, QR (404), RN-10, hora (RN-14), `fechaInicio`, decisión entrada/salida.
- Idempotencia: el `id` del cliente es la clave primaria de la asistencia, es decir, el `id` del escaneo de entrada. Una repetición responde 200 con `tipo: 'ENTRADA'` y el estado actual del registro, aunque el turno ya se haya cerrado.
- Recálculo: al cerrar (y también al registrar entrada) se recalculan los turnos del expediente que tocan los días locales afectados, con una ventana de un día extra por lado, y se guardan los `minutosAcreditables` de los turnos `CERRADA` que cambian.
- Un escaneo sin conexión con hora anterior o igual a la entrada del turno abierto se rechaza con 409 `ESCANEO_ANTERIOR_AL_TURNO`. Las violaciones de `un_turno_abierto`, `asistencia_sin_traslape`, `salida_despues_entrada` y de la clave primaria se traducen a 409.
- Idempotencia de la salida: columna `salida_id` (`salidaId`, única) en `asistencias`, migración `20261110000000_asistencia_salida_id`. Guarda el `id` del cliente del escaneo de salida al cerrar el turno, en la misma transacción. Un escaneo cuyo `id` coincide con `id` (entrada) o `salidaId` (salida) de una asistencia es una repetición: del mismo alumno responde 200 (`tipo: 'ENTRADA'` si coincide con `id`, `tipo: 'SALIDA'` si coincide con `salidaId`); de otro alumno, 409. Una carrera concurrente por `salida_id` responde 409 `ASISTENCIA_DUPLICADA`. El cierre automático de RN-08 no guarda `salidaId`.

### Contrato de la API (para el frontend)

`POST /api/asistencias/escaneo`, solo `ALUMNO`.

Cuerpo: `{ id: uuid, token?: string, codigoCorto?: string, hora?: ISO 8601 con zona, sinConexion?: boolean (default false) }`. Exactamente uno de `token` o `codigoCorto` (el código se normaliza a mayúsculas). Con `sinConexion: true`, `hora` es obligatoria. Cuerpo con campos extra: 400.

Respuesta (201 entrada nueva; 200 salida y repeticiones idempotentes). Una repetición responde `tipo: ENTRADA` si el `id` es el de la entrada y `tipo: SALIDA` si es el de la salida, con el estado actual del registro. El cliente debe generar un uuid distinto para cada escaneo (entrada y salida):

```json
{
  "tipo": "ENTRADA" | "SALIDA",
  "asistencia": { "id", "entrada", "salida", "estado", "minutosAcreditables", "sinConexion" },
  "minutosDia": 0,
  "minutosAcreditablesDia": 0,
  "excedente": 0
}
```

`minutosDia` incluye el excedente (turnos de 15 minutos o más); `excedente = minutosDia - minutosAcreditablesDia` (aviso de RN-04). El día es el día local (America/Monterrey) del escaneo.

Errores (`{ error: { code, message } }`): 400 `VALIDATION_ERROR`; 401 `UNAUTHORIZED`; 403 `FORBIDDEN`; 404 `QR_NO_ENCONTRADO`; 409 `EXPEDIENTE_SUSPENDIDO`, `EXPEDIENTE_NO_ACTIVO` (sin expediente activo, `PENDIENTE`; `FINALIZADO`/`CANCELADO` cuentan como sin expediente activo), `QR_DE_OTRA_INSTITUCION`, `ANTES_DE_FECHA_INICIO`, `HORA_ANTIGUA`, `HORA_FUTURA`, `ESCANEO_ANTERIOR_AL_TURNO`, `ASISTENCIA_TRASLAPADA`, `TURNO_ABIERTO_EXISTENTE`, `SALIDA_ANTERIOR_A_ENTRADA`, `ASISTENCIA_ID_EN_USO`, `ASISTENCIA_DUPLICADA`.

### Prueba manual con curl (completada 2026-11-11)

Git Bash, con el backend corriendo (`pnpm dev` en `backend/`). Las respuestas vienen envueltas: `{ expedientes }`, `{ instituciones }`, `{ institucion }`, `{ supervisor }`. En JSON, una `ñ` se escribe `ñ`. Los archivos `vinc.txt`, `alumno.txt` y `login.json` no están en `.gitignore`: bórralos antes del commit.

```bash
cd /c/dev/praxis/backend
O=http://localhost:5173; A=http://localhost:3000/api
uuid() { node -e "console.log(crypto.randomUUID())"; }
curl -c vinc.txt -H "Origin: $O" -H "Content-Type: application/json" -d '{"email":"<correo admin>","password":"<contraseña>"}' $A/auth/sign-in/email

# Preparar un expediente EN_PROCESO a partir de uno PENDIENTE
curl -s -b vinc.txt "$A/expedientes"            # elegir uno PENDIENTE → EXP, MAT (alumno.matricula), tipo
curl -s -b vinc.txt "$A/instituciones"          # activa y que acepte el tipo → INST, COD (codigoCorto)
EXP=<id>; MAT=<matrícula>; INST=<id>; COD=<código>
curl -c alumno.txt -H "Origin: $O" -H "Content-Type: application/json" -d "{\"username\":\"$MAT\",\"password\":\"<contraseña>\"}" $A/auth/sign-in/username
SUP=$(curl -s -b alumno.txt -H "Origin: $O" -H "Content-Type: application/json" -d '{"nombre":"Laura","apellidoPaterno":"Mendoza","correo":"laura@empresa.mx"}' $A/instituciones/$INST/supervisores | node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>console.log(JSON.parse(t).supervisor?.id ?? t))')
# Servicio social (prácticas agrega fechaTermino, diasPactados, horaEntrada, horaSalida):
curl -s -b alumno.txt -H "Origin: $O" -H "Content-Type: application/json" -X PATCH -d "{\"institucionId\":\"$INST\",\"supervisorId\":\"$SUP\",\"fechaInicio\":\"2026-11-16\"}" $A/expedientes/$EXP
curl -s -b vinc.txt -H "Origin: $O" -X POST $A/expedientes/$EXP/confirmar      # → EN_PROCESO

# Escaneos
escanear() { curl -s -w "  [HTTP %{http_code}]\n" -b alumno.txt -H "Origin: $O" -H "Content-Type: application/json" -d "{\"id\":\"$1\",\"codigoCorto\":\"$COD\",\"sinConexion\":false}" $A/asistencias/escaneo; }
escanear $(uuid)                                 # 409 ANTES_DE_FECHA_INICIO (fechaInicio futura)
curl -s -b vinc.txt -H "Origin: $O" -H "Content-Type: application/json" -X PATCH -d '{"fechaInicio":"2026-11-01"}' $A/expedientes/$EXP
E=$(uuid); escanear $E                           # 201 ENTRADA, ABIERTA
S=$(uuid); escanear $S                           # 200 SALIDA, CERRADA, 0 min (RN-09)
escanear $S                                      # 200 SALIDA, mismo registro (salidaId)
escanear $E                                      # 200 ENTRADA, mismo registro
# codigoCorto "ZZZZZZ" → 404 QR_NO_ENCONTRADO
# PATCH $A/expedientes/$EXP/estado {"accion":"SUSPENDER","motivo":"..."} → escanear → 409 EXPEDIENTE_SUSPENDIDO; luego REACTIVAR
# Sin cookie → 401; con vinc.txt → 403
```

Verificado: expediente `CANCELADO` → 409 `EXPEDIENTE_NO_ACTIVO`; `ANTES_DE_FECHA_INICIO` → 409; entrada → 201 `ABIERTA`; salida a los 6 min → 200 `CERRADA` con 0 min (RN-09); reenvío de entrada y de salida → 200 con el mismo registro, sin cerrar el turno abierto; `codigoCorto` inexistente → 404 `QR_NO_ENCONTRADO`; expediente suspendido → 409 `EXPEDIENTE_SUSPENDIDO`; sin cookie → 401; vinculación → 403.
