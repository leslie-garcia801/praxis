# 0046 — Trabajos de recordatorio (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 6 |
| Specs | RF-28, RF-18, RN-08, RN-15, RN-17 |
| Proyecto | backend |

## Descripción

Segunda tarea de recordatorios (RF-28): dos trabajos que mandan notificaciones push con `enviarPush` (tarea 0045) y la bandera que el servidor entrega al frontend para el aviso dentro de la app.

- **Dominio** `domain/recordatorios.ts`: `MINUTOS_RECORDAR_SALIDA` (6 h) y `necesitaRecordatorioSalida(entrada, ahora)`: verdadero con 6 h o más de turno abierto **y** el mismo día local en America/Monterrey.
- **Avance**: `GET /api/expedientes/:id/avance` agrega `turnoAbierto.recordarSalida` (la misma regla del dominio, evaluada en el momento de la petición). El servidor decide; el frontend solo lo muestra.
- **`recordatorio-salida`** (cada 15 minutos): turnos `ABIERTA` de expedientes `EN_PROCESO` con entrada de hoy (hora de Monterrey), 6 h o más antes de `ahora`, y sin recordatorio previo. Envía «¿Olvidaste registrar tu salida?» / «Tu turno sigue abierto desde las HH:mm.» (hora de Monterrey) con `url` `/alumno/registrar`.
- **`recordatorio-bitacora`** (domingo 18:00 Monterrey): semana actual (lunes a domingo, RN-15) de expedientes `EN_PROCESO` con asistencia esa semana, estado `BORRADOR`/`RECHAZADA` y bitácora sin cumplir RN-17 (`bitacoraValida`, no se duplica el umbral). Envía «Escribe tu bitácora de la semana» con `url` `/alumno/historial?semana=<lunes>` (la bitácora se escribe desde el historial por semana).
- **Migración** `recordatorios`: `asistencias.recordatorio_enviado_en` y `semanas_bitacora.recordatorio_bitacora_en` (timestamptz, nulas).
- **Scripts** `src/scripts/recordatorioSalida.ts` y `recordatorioBitacora.ts`; `pnpm job:recordatorio-salida`, `pnpm job:recordatorio-bitacora [--forzar]`; producción `node dist/scripts/<nombre>.js`. Imprimen resumen (recordados, enviadas, suscripciones eliminadas, errores) y terminan con código 1 si hubo errores.

## Checklist

- [x] Dominio con pruebas unitarias (5 h 59 min, entrada 08:00 a las 14:00, entrada 20:00 a las 02:00 del día siguiente, límite 23:59/00:00)
- [x] Bandera `recordarSalida` en el avance, con pruebas en el límite de 6 h
- [x] Servicio `ejecutarRecordatorioSalida` y `ejecutarRecordatorioBitacora` (`ahora`, `enviar` y `apagado` inyectables)
- [x] Migración aplicada a desarrollo y a la base de pruebas
- [x] Scripts y comandos de `package.json`
- [x] Pruebas: una sola vez, límite de 6 h, turnos cerrados/INCOMPLETA, expediente no `EN_PROCESO`, dos ejecuciones, ejecuciones simultáneas, hora de Monterrey, sin suscripciones, push apagado, turno de un día anterior y medianoche de Monterrey; bitácora válida/corta/vacía, semana enviada o validada, sin asistencia, semana anterior, doble ejecución y `--forzar`

## Fuera de alcance

- Frontend (permiso, suscripción, aviso dentro de la app): tarea 0047.
- Configuración en Railway: tarea 0048.

## Notas

### Decisiones
- **Marcar en la base antes de enviar**: un `UPDATE ... WHERE recordatorio_* IS NULL` que reclama la fila; solo quien afecta la fila envía. Dos ejecuciones simultáneas envían una vez. Si el envío falla, el recordatorio no se reintenta (a lo más una vez); los errores salen en el resumen.
- **Sin suscripciones** la fila se marca igual: el aviso dentro de la app sale por `recordarSalida`.
- **Push apagado** (producción sin claves VAPID): los trabajos no envían **ni marcan**, para que los recordatorios funcionen en cuanto se configuren las claves. Por eso, y por la regla del mismo día local, no llegan avisos por turnos viejos al activar las claves.
- **Doble ejecución de la bitácora**: columna `recordatorio_bitacora_en` en la fila de la semana (ya existe por expediente y semana); el patrón de 12 h de `resumenSemanal` no encaja porque no hay una tabla de envíos. `--forzar` ignora la marca (solo desarrollo).
- **Solo el mismo día local** (RN-08): el siguiente escaneo después de medianoche cierra el turno como `INCOMPLETA` y abre una entrada nueva, así que ya no se puede registrar la salida de ese turno. Preguntar «¿Olvidaste registrar tu salida?» después de medianoche no tiene sentido, y tampoco se manda un push de madrugada por un turno de la tarde. La consulta del trabajo se acota a las entradas desde las 00:00 de hoy y la elegibilidad la decide la función del dominio. El aviso `recordarSalida` del avance usa la misma regla.

### Horarios de Railway (UTC; Monterrey es UTC−6 todo el año)
- `recordatorio-salida`: `*/15 * * * *` (cada 15 minutos). Comando `node dist/scripts/recordatorioSalida.js`.
- `recordatorio-bitacora`: `0 0 * * 1` = lunes 00:00 UTC = domingo 18:00 en Monterrey. Comando `node dist/scripts/recordatorioBitacora.js`.
- Los detalles de la configuración en Railway van en la tarea 0048.
