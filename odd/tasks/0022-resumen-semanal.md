# 0022 — Resumen semanal al supervisor (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 4 (specs §14) |
| Specs | RF-20, RF-21, RF-21a, RF-22, RN-17, RN-18, RF-29 |
| Proyecto | backend |

## Descripción

Script que corre cada **lunes a las 8:00 (America/Monterrey)** y manda a cada supervisor **un solo correo** con todas las semanas pendientes de sus alumnos (RF-21a), usando `enviarEnlaceValidacion` de la tarea 0021. Antes de agrupar, pasa a `ENVIADA` las semanas cerradas que el alumno no envió pero que tienen bitácora válida (decisión 2 de la iteración, RF-21 + RN-17). Lo dispara un cron de Railway. Las decisiones de la iteración están en `odd/tasks/0020-semanas-bitacora.md`.

## Checklist

### Fecha de rechazo
- [x] `SemanaBitacora.rechazadaEn` (timestamptz, nula), migración nueva. `POST /api/validacion/:token` la llena al rechazar (0021). Sirve para saber si el alumno corrigió la bitácora después del rechazo

### Paso 1: envío automático (`ejecutarResumenSemanal(ahora)`)
- [x] Semanas **cerradas** (su domingo ya pasó en Monterrey) de expedientes `EN_PROCESO` o `SUSPENDIDO` (mismo criterio que `POST /api/semanas/:id/enviar`)
- [x] `BORRADOR` con bitácora de 50 caracteres o más (sin contar espacios al inicio y al final, RN-17) → `ENVIADA`
- [x] `RECHAZADA` cuya bitácora se editó después del rechazo (`bitacoraActualizadaEn > rechazadaEn`) y cumple RN-17 → `ENVIADA`. Si no la corrigió, se queda `RECHAZADA` (RF-22: le toca al alumno)
- [x] Sin bitácora válida → se queda en `BORRADOR` y no se manda
- [x] `enviadaEn = ahora`; auditoría `ENVIAR_SEMANA_AUTOMATICO` con `usuarioId` nulo, en la misma transacción que el cambio de estado (RF-29). Guarda contra concurrencia con `updateMany` y el estado en el `where`

### Paso 2: un correo por supervisor
- [x] Agrupar **todas** las semanas `ENVIADA` (las nuevas y las que siguen pendientes de lunes anteriores, decisión 3) por el supervisor **actual** del expediente
- [x] Se excluyen las semanas de expedientes `CANCELADO` (un expediente transferido o dado de baja ya no se valida por enlace) y las de expedientes sin supervisor (se reportan en el resumen del script)
- [x] Por cada supervisor: `enviarEnlaceValidacion(supervisorId, semanaIds, ahora)`. Si falla, se registra el error y se sigue con el siguiente (un correo rebotado no detiene a los demás)
- [x] Protección contra doble ejecución (por ejemplo, si Railway reintenta): se omite al supervisor que ya recibió un enlace en las últimas 12 horas. Opción `--forzar` para pruebas en desarrollo

### Script y despliegue
- [x] `src/scripts/resumenSemanal.ts` que llama a `ejecutarResumenSemanal(new Date())`, imprime el resumen (semanas enviadas automáticamente, supervisores notificados, omitidos, fallidos, semanas sin supervisor) y termina con código distinto de 0 si algún envío falló
- [x] `pnpm job:resumen-semanal` (desarrollo, con `tsx`) y `node dist/scripts/resumenSemanal.js` (producción, tras `pnpm build`)
- [x] Documentar en Notas la configuración de Railway: servicio cron con el mismo repositorio y Root Directory `backend`, horario `0 14 * * 1` (UTC; Monterrey es UTC−6 todo el año desde 2022, así que son las 8:00), comando de inicio `node dist/scripts/resumenSemanal.js`, mismas variables de entorno que la API

### Pruebas (con `ahora` fijo)
- [x] `RN-17: el resumen no envía una semana sin bitácora de 50 caracteres`
- [x] Envío automático de una semana cerrada con bitácora; la semana en curso no se toca
- [x] `RF-22: una semana rechazada solo se reenvía si el alumno corrigió la bitácora`
- [x] `RF-21a: un solo correo por supervisor con las semanas de todos sus alumnos`, incluidas las pendientes de un lunes anterior
- [x] Una semana ya `VALIDADA` no vuelve a aparecer
- [x] Expediente cancelado y expediente sin supervisor: excluidos y reportados
- [x] Falla el envío a un supervisor → los demás reciben su correo y el resultado reporta el fallo
- [x] Segunda ejecución inmediata → no duplica correos; con `forzar` sí
- [x] Auditoría `ENVIAR_SEMANA_AUTOMATICO`

## Fuera de alcance
- Configurar el servicio en Railway (lo hace la usuaria al desplegar, con la guía de Notas).
- Recordatorio al alumno el domingo (RF-28, push): iteración 6.
- Alerta de semanas sin validar en 7 días para vinculación (RN-18, RF-24): panel de la iteración 5.

## Notas

### Decisiones técnicas
- El horario vive en el cron de Railway, no en el código: cambiar el día o la hora no requiere desplegar.
- El script no expone ninguna ruta HTTP: no hay un endpoint que alguien pueda llamar desde fuera para mandar correos.
- `rechazadaEn` está en la migración `20261113000000_semana_rechazada_en`. Una semana `RECHAZADA` sin `rechazadaEn` (rechazada antes de la migración) se considera no corregida y queda al alumno.
- `ejecutarResumenSemanal({ ahora, forzar?, enviar? })` acepta un `enviar` opcional (por defecto `enviarEnlaceValidacion`) para probar el fallo de un supervisor sin mocks globales. Devuelve `{ enviadasAutomaticamente, notificados, omitidos, fallidos, sinSupervisor }`.
- La regla RN-17 se comparte con `semanas.service` mediante `bitacoraValida`.

### Despliegue en Railway (cron)
1. En el proyecto de Railway, crea un servicio nuevo desde el **mismo repositorio** con Root Directory `backend`.
2. Build: el mismo que la API (`pnpm install` y `pnpm build`).
3. Settings > Cron Schedule: `0 14 * * 1` (UTC). Monterrey es UTC−6 todo el año desde 2022, así que son las 8:00 de los lunes.
4. Custom Start Command: `node dist/scripts/resumenSemanal.js`.
5. Variables de entorno: las mismas que la API (`DATABASE_URL`, `RESEND_API_KEY`, `MAIL_FROM`, `FRONTEND_ORIGIN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_TIMEZONE`). Usa referencias a las variables del servicio de la API para no duplicarlas.
6. El servicio no debe migrar la base: las migraciones las corre el servicio de la API. Despliega primero la API para que exista la columna `rechazada_en`.
7. El proceso termina con código distinto de 0 si algún envío falló; Railway lo marca como fallido en el historial de ejecuciones.

### Prueba manual
1. Con la base de desarrollo migrada (`pnpm prisma migrate deploy`), deja en la base una semana cerrada con bitácora de 50 caracteres o más (o una `ENVIADA`) de un alumno con supervisor.
2. En `backend`: `pnpm job:resumen-semanal`. Sin `RESEND_API_KEY`, el correo se imprime en la consola (bloque `--- Correo (modo desarrollo, no se envió) ---`) con el enlace `/validar/<token>`.
3. Una segunda ejecución inmediata omite al supervisor (protección de 12 horas). Para repetir en pruebas: `pnpm job:resumen-semanal --forzar`.
