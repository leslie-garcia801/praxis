# 0047 — Recordatorios push en la app del alumno (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 6 |
| Specs | RF-28, RF-18, RNF-02, RNF-09 |
| Proyecto | frontend |

## Descripción

Tercera tarea de recordatorios (RF-28): la parte de la app. El alumno activa las notificaciones en su celular, el service worker las muestra y el inicio avisa dentro de la app cuando parece que olvidó la salida.

- **Service worker**: `public/push-sw.js` se carga con `workbox.importScripts` (la estrategia `generateSW` no cambia). En `push` muestra la notificación con `{ titulo, cuerpo, url }` (si la carga no es JSON, usa el texto como cuerpo y «Praxis» como título). En `notificationclick` cierra la notificación, enfoca una ventana de la app y la lleva a `url`, o abre una ventana nueva. Solo acepta URL del mismo origen; otra cosa abre `/alumno`.
- **Módulo** `features/recordatorios/`: `api.ts` (`/api/push/clave-publica`, `POST` y `DELETE /api/push/suscripciones`, conversión de la clave VAPID de base64url a bytes) y `push.ts` (detección, activar, desactivar y baja al cerrar sesión).
- **Tarjeta «Recordatorios»** en el inicio del alumno (debajo de los pendientes), con estos estados:

| Estado | Cómo se detecta | Qué se ve |
| --- | --- | --- |
| Oculta | sin `serviceWorker`/`PushManager`/`Notification`; sin registro de service worker (`getRegistration()` vacío, como en `pnpm dev`); o `503 PUSH_NO_CONFIGURADO`; mientras carga | nada |
| Instalar (iPhone/iPad) | `userAgent` de iOS (o iPad con `MacIntel` y pantalla táctil) y ni `navigator.standalone` ni `display-mode: standalone`; el servidor tiene claves | instrucciones para agregar la app a la pantalla de inicio (iOS 16.4 o posterior) |
| Inactiva | permiso `default`, o `granted` sin suscripción en este dispositivo | botón «Activar recordatorios» |
| Activa | permiso `granted` y suscripción en este dispositivo | «Recordatorios activados» y botón «Desactivar» |
| Bloqueada | permiso `denied` | explica que hay que activarlas en los ajustes del navegador o del teléfono |
| Error | falla la revisión, activar o desactivar | mensaje en español con «Reintentar» |

- **Activar**: el permiso se pide solo al tocar el botón (iOS exige un gesto) y solo si está en `default`; luego `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` y `POST` con `subscription.toJSON()`.
- **Cerrar sesión**: antes de cerrar, si el dispositivo tiene suscripción, se hace `DELETE` en el servidor y se cancela en el dispositivo. Es de mejor esfuerzo: si falla, igual se cierra la sesión.
- **Aviso dentro de la app**: `turnoAbierto.recordarSalida` (el servidor decide la regla de 6 h) muestra «¿Olvidaste registrar tu salida?» con un botón «Registrar salida» al inicio del avance.

## Checklist

- [x] `push-sw.js` con pruebas del manejador (push con datos, carga inválida, sin datos, clic: abrir, enfocar y navegar, ventanas y URL de otro origen)
- [x] `vite.config.ts`: `importScripts`; `dist/sw.js` llama a `push-sw.js` y `dist/push-sw.js` existe
- [x] Módulo `recordatorios` (api, detección, activar, desactivar, baja al cerrar sesión)
- [x] Tarjeta en el inicio con todos los estados
- [x] Baja de la suscripción al cerrar sesión, sin bloquear el cierre si falla
- [x] Aviso `recordarSalida` en el inicio y campo en el tipo `Avance` y en las pruebas
- [x] Pruebas con nombres `RF-28: ...` (estados, activación, 503, denegado, desactivar, iOS sin instalar, desarrollo sin service worker, cierre de sesión, aviso)
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` en verde

## Fuera de alcance

- Claves VAPID y programación de los trabajos en Railway: tarea 0048.
- Probar en un iPhone y un Android reales (manual, tarea 0048).
- Notificaciones para el personal de vinculación.

## Notas

### Decisiones
- **Tarjeta oculta, no un aviso**: si no hay soporte, no hay service worker o el servidor no tiene claves, no se muestra nada; una línea de «no disponible» solo confundiría al alumno en escritorio o en desarrollo.
- **iPhone**: la revisión de iOS va antes de la de soporte porque Safari solo expone `PushManager` a las apps instaladas. Las instrucciones solo salen si el servidor tiene las claves.
- **Sin `serviceWorker.ready`**: en `pnpm dev` no hay service worker y nunca resolvería; se usa `getRegistration()`.
- **Fallo al guardar la suscripción**: si el `POST` falla, se cancela la suscripción recién creada para que la próxima visita no diga «activados» cuando el servidor no la conoce.
- **Cierre de sesión**: el dispositivo se da de baja localmente aunque el `DELETE` falle: el servicio push responderá 410 para ese `endpoint` y el backend lo borra. Si el cierre de sesión falla después, se invalida la tarjeta para que ofrezca activar otra vez.
- **URL de otro origen** en la notificación: se ignora y se abre `/alumno`.
- **Íconos**: la notificación usa `/icon.svg`; no hay `badge` porque no existe un ícono monocromático en PNG.
