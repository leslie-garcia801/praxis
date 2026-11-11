# 0021 — Mailer y validación por enlace (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 4 (specs §14) |
| Specs | RF-21, RF-21a, RF-22, RN-06b, RN-11, RNF-06, RF-29, specs §9 |
| Proyecto | backend |

## Descripción

Construye el envío de correo (Resend) y la validación de semanas por enlace sin cuenta (RF-21). Un **enlace de validación** pertenece a un supervisor, agrupa varias semanas de sus alumnos (RF-21a) y vence a los 14 días. El supervisor abre el enlace, ve los turnos y la bitácora de cada semana, y valida o rechaza (con comentario obligatorio), todas a la vez o una por una. Esta tarea deja lista la función que crea un enlace y manda el correo; la tarea 0022 la llama cada lunes. Las decisiones de la iteración están en `odd/tasks/0020-semanas-bitacora.md`.

## Checklist

### Mailer (`src/lib/mailer.ts`)
- [x] Instalar `resend` (está en la lista del stack de CLAUDE.md)
- [x] `enviarCorreo({ para, asunto, html, texto })`. Tres modos según el entorno:
  - `production`: Resend. `RESEND_API_KEY` y `MAIL_FROM` pasan a ser obligatorias en producción: si faltan, el backend no arranca (validación en `env.schema.ts`)
  - `development` sin `RESEND_API_KEY`: escribe el correo en la consola (destinatario, asunto, texto con el enlace)
  - `test`: guarda los correos en memoria; `correosEnviados()` y `limpiarCorreos()` para las pruebas
- [x] Un fallo de Resend se propaga como error (lo maneja quien llama; en 0022, el script sigue con el siguiente supervisor)

### Enlaces de validación (modelo y migración)
- [x] Tabla `enlaces_validacion`: `id`, `supervisorId`, `tokenHash` (único), `expiraEn`, `creadoEn`
- [x] Tabla puente `enlaces_validacion_semanas` (`enlaceId`, `semanaId`): las semanas que se incluyeron en ese correo
- [x] Quitar `token_hash` y `token_expira` de `semanas_bitacora` (el token ahora es por enlace)
- [x] Token aleatorio de 32 bytes (`base64url`), guardado solo como hash SHA-256 (RNF-06). Utilidad común en `src/domain/tokens.ts`; `hashTokenQr` la reutiliza

### Crear y enviar un enlace
- [x] `enviarEnlaceValidacion(supervisorId, semanaIds, ahora)`: crea el enlace (vence en 14 días), manda el correo al `correo` actual del supervisor y devuelve el id del enlace. Si falla el envío, no queda el enlace creado
- [x] Correo en español: saludo con el nombre del supervisor, lista de alumnos con la semana ("Ana López — semana del 9 al 15 de noviembre"), botón/enlace `{FRONTEND_ORIGIN}/validar/{token}`, aviso de que vence en 14 días y que no necesita cuenta. Versión HTML y texto

### `GET /api/validacion/:token` (público)
- [x] Token desconocido → 404 `ENLACE_NO_VALIDO` ("Este enlace no es válido."). Vencido → 410 `ENLACE_VENCIDO` ("Este enlace venció. Usa el del correo más reciente.")
- [x] Respuesta: nombre del supervisor, `expiraEn` y las semanas del enlace, cada una con: `id`, alumno (nombre completo y carrera; sin matrícula ni otros datos), institución, `semanaInicio`, `semanaFin`, `estado` actual, `actividades`, turnos (`entrada`, `salida`, `estado`, `minutosAcreditables`, `fueraDeHorario`) y total de minutos acreditables
- [x] Una semana ya resuelta aparece con su estado (`VALIDADA` → "Ya validada"; `RECHAZADA`), sin botones en el frontend
- [x] RN-06b: en prácticas con horario pactado, `fueraDeHorario = true` si el turno cae en un día no pactado o si **no se cruza en ningún momento** con `horaEntrada`–`horaSalida` (hora de Monterrey). Llegar antes o salir después **no** marca el turno mientras se cruce con el horario (decisión de la usuaria, 2026-11-11: lo que se quiere detectar es, por ejemplo, un registro en la madrugada). Un turno abierto se evalúa con su entrada. En servicio social o sin horario, siempre `false`. Función pura en `src/domain/`

### `POST /api/validacion/:token` (público)
- [x] Cuerpo `{ decisiones: [{ semanaId, accion: 'VALIDAR' | 'RECHAZAR', comentario? }] }`, al menos una
- [x] `RECHAZAR` exige `comentario` (mínimo 5 caracteres sin contar espacios al inicio y al final) → si no, 400
- [x] Una semana que no pertenece al enlace → 400 `SEMANA_FUERA_DEL_ENLACE`
- [x] Cada semana se resuelve solo si sigue `ENVIADA` (`updateMany` con el estado en el `where`). Respuesta por semana: `VALIDADA`, `RECHAZADA` o `YA_RESUELTA` (otra persona la resolvió antes)
- [x] Validar: estado `VALIDADA`, `validadoPor = 'SUPERVISOR'`, `validadoEn`. Rechazar: estado `RECHAZADA` con `comentario` (RF-22: vuelve al alumno). Auditoría `VALIDAR_SEMANA` / `RECHAZAR_SEMANA` con `usuarioId` nulo y el `supervisorId` y el `enlaceId` en `despues`, en la misma transacción (RF-29)
- [x] Enlace vencido o desconocido → mismos errores que el GET

### Pruebas
- [x] Mailer en modo prueba: guarda y limpia; producción sin variables → el esquema de entorno falla
- [x] `enviarEnlaceValidacion`: crea el enlace con las semanas, el correo lleva el enlace y los alumnos, el token no se guarda en claro
- [x] GET: válido, desconocido (404), vencido (410), semana ya validada
- [x] `RN-06b: marca los turnos fuera del horario pactado`: día no pactado → marcado; turno de madrugada (02:00–04:00 con horario 08:00–14:00) → marcado; llega 07:00 y sale 09:00 → no marcado; llega 13:00 y sale 16:00 → no marcado; dentro del horario → no marcado; servicio social → no marcado
- [x] POST: validar todas, una por una, rechazar con y sin comentario, semana ajena al enlace, `YA_RESUELTA`, auditoría
- [x] `RN-11: las horas de una semana validada por enlace cuentan como validadas` (el avance sube)
- [x] Rechazada → el historial del alumno muestra el comentario y vuelve a ser editable (0020)

## Fuera de alcance
- Script del resumen semanal y cron de Railway (0022).
- Página `/validar/:token` (0024).
- Validación por vinculación en nombre del supervisor (RF-22): iteración 5.
- Límite de intentos en las rutas públicas: el token de 32 bytes no se puede adivinar; se revisa al desplegar.

## Notas

### Decisiones técnicas
- Un enlace muestra las semanas que se incluyeron al enviarlo; las que se envíen después llegan en el correo siguiente.
- Un enlace nuevo no invalida los anteriores: cada uno vence a los 14 días. Si una semana ya se resolvió desde otro enlace, aparece como resuelta.
- RN-06b se calcula al leer, no se guarda (decisión de la 0014). Llegar temprano o salir tarde es normal; solo se marca un turno que no se cruza con el horario pactado o que cae en un día no pactado. Ver pregunta abierta 2c de specs §13 sobre los fines de semana.
- Un turno que cruza medianoche se evalúa contra el horario del día de entrada. Un turno abierto se evalúa solo con su entrada (debe caer dentro de la ventana). Sin días pactados solo se revisan las horas, y sin horas solo los días. Una ventana cuya salida no es posterior a la entrada termina al día siguiente. Función: `src/domain/horario.ts`.
- El correo se envía **dentro** de la transacción que crea el enlace: si Resend falla, la transacción se revierte y no queda enlace. El caso inverso (falla el commit tras enviar) es muy raro y deja un enlace que responde "no válido".
- `POST` público sin `requireTrustedOrigin`: ese middleware protege peticiones con cookie de sesión (CSRF) y estas rutas no leen cookies; el token es la credencial.
- `enviarEnlaceValidacion(supervisorId, semanaIds, ahora = () => new Date())`: `ahora` es una función, como en el resto del backend. Todas las semanas deben existir y ser de alumnos de ese supervisor (si no, lanza error y no crea nada).
- Un cuerpo con la misma semana dos veces → 400. `VALIDAR` limpia el `comentario` previo de la semana; `RECHAZAR` no toca `validadoPor` ni `validadoEn`.
- Utilidad de tokens en `src/domain/tokens.ts` (`generarToken`, `hashToken`); `hashTokenQr` es el mismo `hashToken`, así que los hashes guardados siguen siendo válidos.
- Migración `20261112000000_enlaces_validacion` (a mano): quita `token_hash` y `token_expira` de `semanas_bitacora` y crea `enlaces_validacion` y `enlaces_validacion_semanas`.

### Contrato de la API (para el frontend)
Rutas públicas, sin sesión ni cookies. Errores con la forma `{ error: { code, message, details? } }`. Orden de errores: token desconocido, token vencido y después validación del cuerpo.

**`GET /api/validacion/:token`** → 200
```json
{
  "enlace": {
    "supervisor": { "nombre": "Laura Mendoza" },
    "expiraEn": "2026-11-25T18:00:00.000Z",
    "semanas": [
      {
        "id": "uuid",
        "alumno": { "nombre": "Ana María López García", "carrera": "Programación" },
        "institucion": "Empresa Demo",
        "semanaInicio": "2026-11-02",
        "semanaFin": "2026-11-08",
        "estado": "ENVIADA",
        "actividades": "texto o null",
        "turnos": [
          { "entrada": "ISO", "salida": "ISO o null", "estado": "CERRADA", "minutosAcreditables": 120, "fueraDeHorario": false }
        ],
        "minutosAcreditables": 180
      }
    ]
  }
}
```
`estado` es `ENVIADA`, `VALIDADA` o `RECHAZADA`; solo `ENVIADA` admite botones. Las semanas vienen ordenadas por alumno y fecha. `fueraDeHorario` solo puede ser `true` en prácticas.

**`POST /api/validacion/:token`** — cuerpo:
```json
{ "decisiones": [ { "semanaId": "uuid", "accion": "VALIDAR" }, { "semanaId": "uuid", "accion": "RECHAZAR", "comentario": "mínimo 5 caracteres" } ] }
```
→ 200 `{ "resultados": [ { "semanaId": "uuid", "resultado": "VALIDADA" | "RECHAZADA" | "YA_RESUELTA" } ] }` (en el orden enviado).

| Estado | `code` | Cuándo |
| --- | --- | --- |
| 404 | `ENLACE_NO_VALIDO` | token desconocido ("Este enlace no es válido.") |
| 410 | `ENLACE_VENCIDO` | enlace de más de 14 días ("Este enlace venció. Usa el del correo más reciente.") |
| 400 | `VALIDATION_ERROR` | sin decisiones, acción inválida, semana repetida, `RECHAZAR` sin comentario o con menos de 5 caracteres (`details[].path` indica el campo) |
| 400 | `SEMANA_FUERA_DEL_ENLACE` | alguna semana no pertenece al enlace; no se resuelve ninguna |

### Prueba manual
1. Levanta la base y la API (`docker compose up -d`, `pnpm prisma migrate deploy`, `pnpm dev` en `backend/`). No pongas `RESEND_API_KEY` en `.env`: así el correo sale por la consola.
2. Necesitas un supervisor con alumnos cuya semana esté `ENVIADA` (el alumno envía una semana cerrada desde la app, 0020). Copia el `id` del supervisor (`pnpm prisma studio`, tabla `supervisores`).
3. Corre `pnpm dev:enlace <supervisorId>` en `backend/`. Crea el enlace con todas las semanas `ENVIADA` de ese supervisor y el correo se imprime en la terminal con el enlace `{FRONTEND_ORIGIN}/validar/{token}`.
4. Con el token del enlace: `curl http://localhost:3000/api/validacion/<token>` y, para resolver, `curl -X POST http://localhost:3000/api/validacion/<token> -H "Content-Type: application/json" -d '{"decisiones":[{"semanaId":"<id>","accion":"VALIDAR"}]}'`. La página `/validar/:token` llega en la 0024.

> Prueba manual de punta a punta: pendiente por decisión de la usuaria (2026-11-11); se hará junto con la página `/validar/:token` (0024).
