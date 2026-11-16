# 0043 — Registro sin conexión en la app del alumno (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 6 (registro sin conexión) |
| Specs | RF-14, RF-16, RF-18, RN-14 |
| Proyecto | frontend |

## Descripción

Segunda tarea del registro sin conexión: conecta la cola de la 0042 con las pantallas del alumno. El servidor sigue decidiendo si es entrada o salida y si el registro se acepta; el frontend solo guarda, reenvía y muestra.

- **Registrar sin red:** si `navigator.onLine` es falso, o `registrarEscaneo` falla por red (no es un `ApiError`), el registro va a la cola y se muestra "Registro guardado. Pendiente de sincronizar." (no se dice si es entrada o salida). Si falló por red en línea, se reutiliza el mismo `id` y la hora del intento (`encolarRegistro` acepta un `id` opcional), así el envío posterior es idempotente. Un `ApiError` se muestra como hasta ahora y no se encola.
- **Cola compartida:** `obtenerCola()` crea una sola cola por app; `ColaContext` permite sustituirla en pruebas.
- **Sincronización:** `SincronizacionProvider` (montado en `AlumnoLayout`, solo para el alumno) ejecuta `sincronizarPendientes` al abrir la app y en el evento `online`; tras enviar al menos uno invalida `me`, `avance`, `historial`, `pendientes` y `correcciones`. Expone el número de pendientes, los rechazados y el motivo de detención (`SESION` muestra "Inicia sesión para enviar tus registros pendientes.").
- **Inicio:** aviso "Sin conexión", "N registro(s) pendiente(s) de sincronizar" y la lista de rechazados (fecha y hora de Monterrey, mensaje del servidor y botón "Descartar"). El botón "Registrar" siempre está visible.
- **Abrir la app sin conexión:** tras un `/api/me` correcto de un alumno se guarda en `localStorage` solo `{ rol, nombre, usuarioId }` (RNF-07); se borra al cerrar sesión y cuando `/api/me` responde 401 o no es un alumno. Si `/api/me` no se alcanza por red y hay una sesión conocida de alumno, las guardas abren las rutas del alumno en modo sin conexión; nunca abren rutas de vinculación. Inicio e Historial muestran un estado sin conexión en lugar de un "cargando" eterno; Registrar funciona completo, también con el código corto.

## Checklist

- [x] `encolarRegistro` con `id` opcional
- [x] Cola compartida y contexto para pruebas
- [x] `SincronizacionProvider` (al abrir, al evento `online`, invalidación de consultas)
- [x] Registrar: guardar en la cola sin red o con error de red, mensaje de pendiente
- [x] Inicio: aviso sin conexión, contador de pendientes y rechazados con "Descartar"
- [x] Última sesión conocida del alumno (`localStorage`) y guardas en modo sin conexión
- [x] Estados sin conexión en Inicio, Historial y Pendientes
- [x] Pruebas (`RF-16`, `RN-14`, `RN-03b`) con MSW
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` en verde

## Fuera de alcance

- Background Sync (iOS no lo tiene).
- Iniciar sesión por primera vez sin conexión.
- Cachear las respuestas de avance en el service worker.
- Prueba de punta a punta con Playwright: 0044.
- Notificaciones push (RF-28).

## Notas

- `useMe` y `useRegistrarEscaneo` usan `networkMode: 'always'`: sin red fallan de inmediato en lugar de quedarse en pausa, y la pantalla decide qué mostrar.
- La guarda se mantiene en modo sin conexión mientras reintenta `/api/me`, porque TanStack Query devuelve a "pendiente" una consulta sin datos en cada reintento y las rutas se desmontarían.
- Un registro de la cola solo se envía bajo la sesión de quien lo guardó: cada `RegistroPendiente` lleva `usuarioId` (de `/api/me` o de la última sesión conocida; sin usuario conocido no se encola y se pide iniciar sesión). `sincronizarPendientes(cola, enviar, usuarioId)` envía solo los de ese usuario y deja intactos los de otros hasta que inicien sesión; el contador y los rechazados también se filtran por usuario. Un registro sin `usuarioId` no se envía nunca y se descarta en la siguiente sincronización.
