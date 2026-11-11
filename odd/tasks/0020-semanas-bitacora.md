# 0020 — Semanas y bitácora (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 4 (specs §14) |
| Specs | RF-19, RF-20, RN-11, RN-15, RN-17, RF-29, specs §8.2, §8.4, §9 |
| Proyecto | backend |

## Descripción

Primera tarea de la iteración 4. Materializa las semanas (`SemanaBitacora`), asigna cada asistencia a su semana, y permite al alumno escribir la bitácora y enviar una semana cerrada a validación (RF-20, RN-17). Con esto las horas validadas (§8.4) empiezan a depender de semanas reales. El correo al supervisor, el enlace de validación y el envío automático del lunes son las tareas 0021 y 0022.

## Decisiones de la iteración 4 (usuaria, 2026-11-11)

1. **Un solo correo semanal por supervisor** (RF-21a): "Enviar" marca la semana `ENVIADA` sin mandar correo; el resumen sale una vez por semana con todas las semanas pendientes de sus alumnos y un enlace válido 14 días. El token es por correo (tabla nueva en 0021), no por semana.
2. **Envío automático al cierre:** una semana cerrada con bitácora válida entra al resumen aunque el alumno no haya tocado "Enviar"; sin bitácora queda en `BORRADOR` (RF-21, RN-17).
3. **Cada resumen incluye todas las semanas pendientes**, con enlace nuevo. Enlace vencido → "usa el del correo más reciente"; semana validada → sale de los resúmenes; rechazada → vuelve al alumno con el comentario y, al corregirla, entra al siguiente resumen. Sin recordatorios aparte; RN-18 sin cambios.
4. **Resumen: lunes 8:00, America/Monterrey**, configurable; lo dispara un cron de Railway que ejecuta un script del backend.
5. **Solo se envían semanas cerradas** (después del domingo, hora de Monterrey). Durante la semana el alumno escribe y edita su bitácora.

## Checklist

### Modelo y migración
- [x] `SemanaBitacora`: agregar `enviadaEn` (timestamptz, nula) y `bitacoraActualizadaEn` (timestamptz, nula; la usa 0022 para reenviar automáticamente una semana rechazada solo si se corrigió). `tokenHash` y `tokenExpira` se quitan en 0021, cuando exista la tabla de enlaces
- [x] Migración de datos: crear las semanas que falten y llenar `asistencias.semana_id` de las asistencias existentes, con el lunes local de la entrada (`date_trunc('week', entrada AT TIME ZONE 'America/Monterrey')`)

### Asignación de asistencias a semanas
- [x] Una asistencia pertenece a la semana del **día local de su entrada** (lunes a domingo, RN-15). Un turno que cruza de domingo a lunes queda en la semana de su entrada
- [x] Al registrar una entrada (escaneo, 0014), se crea la semana si no existe (`upsert` por `expedienteId + semanaInicio`) y se asigna `semanaId`, en la misma transacción
- [x] El historial (0015) agrega a la respuesta de la semana: `id` de la `SemanaBitacora` (o `null` si no hay turnos esa semana), `actividades`, `comentario` (solo si está `RECHAZADA`), `enviadaEn`, `puedeEditar` y `puedeEnviar`

### Bitácora: `PUT /api/semanas/:id/bitacora` (RF-20)
- [x] Solo `ALUMNO` dueño del expediente (otro alumno → 403; otro plantel → 404)
- [x] Cuerpo `{ actividades }`, texto de hasta 5000 caracteres. Se guarda aunque tenga menos de 50 (borrador); el mínimo se exige al enviar
- [x] Editable solo en `BORRADOR` o `RECHAZADA`; en `ENVIADA` o `VALIDADA` → 409 `SEMANA_NO_EDITABLE`
- [x] Actualiza `bitacoraActualizadaEn`

### Envío: `POST /api/semanas/:id/enviar` (RF-20, RN-17)
- [x] Solo `ALUMNO` dueño; expediente `EN_PROCESO` o `SUSPENDIDO`
- [x] La semana debe estar cerrada (su domingo ya pasó en Monterrey) → si no, 409 `SEMANA_EN_CURSO`
- [x] Estado `BORRADOR` o `RECHAZADA` → si no, 409 `SEMANA_NO_EDITABLE`
- [x] RN-17: bitácora de al menos 50 caracteres sin contar espacios al inicio y al final → si no, 409 `BITACORA_INCOMPLETA`
- [x] Pasa a `ENVIADA` con `enviadaEn`; auditoría `ENVIAR_SEMANA` en la misma transacción (RF-29)

### Pruebas
- [x] `RN-17: no se envía una semana sin bitácora de 50 caracteres`
- [x] `RF-20: la bitácora no se edita después de enviarla`; se vuelve a editar tras `RECHAZADA`
- [x] Semana en curso → 409; semana cerrada → `ENVIADA` con auditoría
- [x] El escaneo crea la semana y asigna `semanaId`; turno del domingo que cruza al lunes queda en la semana del domingo
- [x] `RN-11: solo cuentan las horas de semanas validadas` sigue pasando con semanas reales
- [x] Migración: asistencias existentes quedan con su semana (prueba sobre la función o la consulta de relleno)
- [x] Cada ruta: caso feliz, 400, 401, 403 (rol y dueño), 404

## Fuera de alcance
- Mailer, tabla de enlaces y `GET/POST /api/validacion/:token` (0021).
- Script del resumen semanal y envío automático (0022).
- Pantallas de bitácora y de validación (0023, 0024).
- Validación por vinculación en nombre del supervisor (RF-22): iteración 5.

## Notas

### Decisiones técnicas
- La bitácora se guarda como borrador sin mínimo para no perder lo que el alumno escribe; RN-17 se valida al enviar (y en el envío automático de 0022).
- Las semanas solo existen cuando hay turnos: sin turnos no hay nada que validar.
- La migración `20261111000000_semanas_bitacora` agrega las dos columnas y, entre los marcadores `-- BACKFILL START/END`, el relleno de datos (idempotente). La prueba `relleno-semanas.test.ts` ejecuta ese mismo bloque SQL sobre asistencias sin semana, así que prueba el SQL real de la migración.
- La asignación en el escaneo no usa `upsert` de Prisma: dos primeras entradas simultáneas chocaban con la restricción única y abortaban la transacción (500). Se usa `INSERT ... ON CONFLICT DO NOTHING` y una lectura, dentro de la misma transacción.
- `puedeEditar` y `puedeEnviar` del historial son siempre `false` para vinculación/admin: solo el alumno escribe la bitácora.
- En esta máquina la sesión de PostgreSQL usa `America/Mexico_City` y el adaptador de Prisma guarda los instantes desplazados respecto de lo que ve SQL crudo; por eso la prueba del relleno inserta las asistencias con SQL y horas UTC explícitas. En Railway (UTC) no hay diferencia.

### Contrato de la API (para el frontend)

Respuestas envueltas; fechas de calendario `AAAA-MM-DD` (America/Monterrey), instantes ISO 8601 en UTC. Ambas rutas son solo para `ALUMNO` (dueño de la semana).

`PUT /api/semanas/:id/bitacora` con cuerpo `{ "actividades": "texto de hasta 5000 caracteres" }`. Se guarda como borrador aunque tenga menos de 50 caracteres (cadena vacía permitida). Editable solo en `BORRADOR` o `RECHAZADA`; la semana conserva su estado.

`POST /api/semanas/:id/enviar` sin cuerpo. Pasa la semana a `ENVIADA`.

Ambas responden 200:

```json
{
  "semana": {
    "id": "uuid",
    "semanaInicio": "2026-11-02",
    "estado": "BORRADOR" | "ENVIADA" | "VALIDADA" | "RECHAZADA",
    "actividades": "texto" | null,
    "enviadaEn": "ISO" | null,
    "bitacoraActualizadaEn": "ISO" | null
  }
}
```

Errores:

- 400 `VALIDATION_ERROR`: `id` no uuid; `actividades` ausente, no texto o de más de 5000 caracteres; campos extra.
- 401 `UNAUTHORIZED`; 403 `FORBIDDEN` (rol distinto de alumno u otro alumno); 404 `NOT_FOUND` (semana inexistente o de otro plantel).
- 409 `SEMANA_NO_EDITABLE`: la semana está `ENVIADA` o `VALIDADA` (ambas rutas).
- 409 `EXPEDIENTE_NO_ACTIVO` (solo enviar): el expediente no está `EN_PROCESO` ni `SUSPENDIDO`.
- 409 `SEMANA_EN_CURSO` (solo enviar): el domingo de la semana todavía no pasa en Monterrey; desde el lunes 00:00 ya se puede.
- 409 `BITACORA_INCOMPLETA` (solo enviar, RN-17): menos de 50 caracteres sin contar espacios al inicio y al final.

`GET /api/asistencias` (historial) agrega estos campos al objeto `semana`; los existentes no cambian:

```json
{
  "semana": {
    "inicio": "2026-11-09",
    "fin": "2026-11-15",
    "estadoValidacion": "BORRADOR" | "ENVIADA" | "VALIDADA" | "RECHAZADA" | null,
    "id": "uuid" | null,
    "actividades": "texto" | null,
    "comentario": "texto" | null,
    "enviadaEn": "ISO" | null,
    "puedeEditar": true,
    "puedeEnviar": false,
    "dias": [],
    "totales": {}
  }
}
```

`id` es `null` mientras la semana no tenga turnos (la `SemanaBitacora` se crea con la primera entrada). `comentario` solo viene con valor cuando el estado es `RECHAZADA`. `puedeEditar`: existe la semana, está en `BORRADOR` o `RECHAZADA` y quien consulta es el alumno. `puedeEnviar`: `puedeEditar` y la semana ya cerró y el expediente está `EN_PROCESO` o `SUSPENDIDO`; no incluye el mínimo de 50 caracteres, que valida el frontend (y el servidor responde `BITACORA_INCOMPLETA`). Para vinculación y admin ambos son `false`.

### Zona horaria de la sesión de PostgreSQL (corregido en esta tarea)

- Hallazgo (2026-11-11): con un PostgreSQL local en `America/Mexico_City`, `@prisma/adapter-pg` 7.10.1 guardaba los instantes con 6 horas de más (manda las fechas sin zona y el servidor las interpretaba en la zona de la sesión). Prisma las leía con el mismo error, así que la app se veía bien, pero el SQL directo (relleno de semanas, reportes con `$queryRaw`) veía otra hora. Railway corre en UTC, por eso no afectaba producción.
- Arreglo: `src/lib/prisma.ts` fuerza `TimeZone=UTC` en cada conexión (`options: '-c TimeZone=UTC'`). Prueba de regresión: `src/lib/prisma.test.ts` (`RN-15: stores the real UTC instant regardless of the server time zone`), que falló antes del arreglo con `22:11` en lugar de `16:11`.
- Datos de `app_dev`: se restaron 6 horas a las 13 columnas `timestamptz` con datos, con un script de un solo uso (las asistencias de una en una, de la más antigua a la más nueva, por la restricción `asistencia_sin_traslape`). Verificado: la base y la API coinciden (`2026-11-11 16:11:59 UTC` para la asistencia `4e4151d6`).
