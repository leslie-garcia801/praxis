# 0045 — Suscripciones push (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 6 |
| Specs | RF-28, RNF-06 |
| Proyecto | backend |

## Descripción

Primera de las tareas de recordatorios (RF-28): la base para enviar notificaciones push al celular del alumno. Esta tarea solo guarda las suscripciones del navegador y deja listo el envío; los recordatorios en sí se programan después.

- **Modelo `SuscripcionPush`** (`suscripciones_push`): `id`, `usuarioId` (borrado en cascada con el usuario), `endpoint` (único), `p256dh`, `auth`, `creadoEn`, `actualizadoEn`. Migración `suscripciones_push`.
- **Variables de entorno** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (`mailto:` o `https://`): las tres o ninguna, también en producción. **No son obligatorias en producción**: sin ellas la API arranca igual, el push queda apagado y se registra un aviso al arrancar y en el primer envío (decisión de la usuaria del 2026-11-15, para que un despliegue sin claves no tire toda la API). Se generan con `pnpm exec web-push generate-vapid-keys`.
- **Emisor** `lib/push.ts` con tres modos como el mailer: en pruebas guarda en memoria (`notificacionesEnviadas()` / `limpiarNotificaciones()`); en desarrollo sin claves VAPID imprime en consola; en producción sin claves no envía nada (push apagado); en los demás casos usa `web-push`. `enviarPush(usuarioId, { titulo, cuerpo, url })` envía a todas las suscripciones del usuario, borra las que el servicio push responde con 404 o 410, y junta los demás fallos en el resultado (`{ enviadas, eliminadas, errores }`) sin lanzar. La carga útil es el JSON `{ titulo, cuerpo, url }` con `url` relativa (por ejemplo `/alumno`).
- **Rutas** `/api/push`:
  - `GET /clave-publica`: cualquier rol con sesión; `{ clavePublica }`. Sin claves configuradas responde `503 PUSH_NO_CONFIGURADO`.
  - `POST /suscripciones`: solo ALUMNO; cuerpo = JSON de `PushSubscription` (`{ endpoint, keys: { p256dh, auth } }`, endpoint https de hasta 2048 caracteres). Crea (201) o actualiza (200) por `endpoint` y lo reasigna al usuario actual; responde `{ suscripcion: { id } }`.
  - `DELETE /suscripciones`: solo ALUMNO; cuerpo `{ endpoint }`; borra solo si es del usuario actual; siempre 204 (idempotente).

## Checklist

- [x] Modelo, migración y variables de entorno (con pruebas del esquema)
- [x] `lib/push.ts` con sus tres modos (pruebas: bandeja, todas las suscripciones, 404/410, otros errores)
- [x] Rutas, esquemas Zod y servicio; montadas en `app.ts`
- [x] Pruebas de rutas: caso feliz, 400, 401, 403, reasignación de endpoint y baja que no toca la suscripción ajena
- [x] `pnpm test` y `pnpm typecheck` en verde

## Fuera de alcance

- Los trabajos de recordatorio (turno abierto más de 6 horas, domingo a las 18:00): tarea 0046.
- Frontend: pedir permiso, suscribirse y el service worker: tarea 0047.
- Configuración en Railway (variables VAPID y programación): tarea 0048.

## Notas

- `docs/specs.md` §9 no lista estas rutas; no se editó. Conviene agregar `GET /api/push/clave-publica`, `POST /api/push/suscripciones` y `DELETE /api/push/suscripciones`.
- `PUSH_NO_CONFIGURADO` usa 503: el servidor funciona pero esta función opcional no está configurada. El frontend debe ocultar el aviso de notificaciones en ese caso.
- Las rutas no usan `requireTrustedOrigin`, igual que el resto de routers con sesión (solo `/api/auth` lo monta).
- Un mismo navegador que inicia sesión con otro usuario reasigna su suscripción (el `endpoint` es único), así no llegan avisos de una cuenta a otra persona.
- Pendiente a mano: agregar al `backend/.env.example` las tres variables VAPID comentadas, con el comando de generación.
