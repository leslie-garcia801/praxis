# 0042 — Cola de registros sin conexión (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 6 (registro sin conexión) |
| Specs | RF-16, RN-14 |
| Proyecto | frontend |

## Descripción

Primera tarea del registro sin conexión. El backend ya acepta `sinConexion` con la hora del dispositivo, rechaza registros de más de 72 h (RN-14) y es idempotente por `id`. Aquí se construye, sin pantallas, la cola de `RegistroPendiente` en el dispositivo y su sincronización, en `frontend/src/offline/`.

- **Cola:** puerto `ColaPendientes` (agregar, listar por `creadoEn`, eliminar, marcar rechazado) con dos adaptadores: memoria (pruebas y respaldo) e IndexedDB nativo (una base, un almacén por `id`, índice `creadoEn`). `crearColaPendientes()` elige uno según exista `indexedDB`.
- **`encolarRegistro`:** UUID nuevo, `sinConexion: true` y `hora` del dispositivo en ISO con desfase (`isoConOffset` en `lib/tiempo.ts`).
- **`sincronizarPendientes(cola, enviar)`:** del más antiguo al más nuevo, de uno en uno (una salida depende de su entrada). 2xx (201 o 200 por repetición idempotente) lo quita; 4xx definitivo (todos salvo 401, 408 y 429) lo marca rechazado con `code` y `message` de la API y sigue; error de red, 5xx, 401, 408 y 429 lo conservan y detienen la corrida. Llamadas simultáneas sobre la misma cola comparten una sola corrida. Devuelve `{ enviados, rechazados, restantes, detenidoPor }`.
- **`descartarRechazado`:** quita un registro rechazado.
- `registrarEscaneo(request)` extraído de `useRegistrarEscaneo` para reutilizar el envío.

## Checklist

- [x] Tipos y puerto de la cola
- [x] Adaptadores de memoria e IndexedDB y fábrica
- [x] Pruebas del adaptador de IndexedDB con `fake-indexeddb`
- [x] `encolarRegistro` e `isoConOffset`
- [x] `sincronizarPendientes` con clasificación de errores y bloqueo de concurrencia
- [x] `descartarRechazado`
- [x] Pruebas (`RF-16`, `RN-14`) con el adaptador de memoria
- [x] `pnpm test`, `pnpm typecheck` y `pnpm lint` en verde

## Fuera de alcance

- Interfaz (indicadores, lista de pendientes y rechazados): 0043.
- Eventos de conectividad (`online`, apertura de la app) que disparan la sincronización: 0043.
- Inicio de sesión sin conexión.
- Prueba de punta a punta con el IndexedDB real del navegador: 0044, con Playwright.

## Notas

- El adaptador de IndexedDB se prueba con `fake-indexeddb` (dependencia de desarrollo, como indica `frontend/CLAUDE.md`), con el mismo contrato que el adaptador de memoria (`src/offline/almacenamiento.test.ts`).
- Un `401` conserva el registro: se reintenta tras iniciar sesión.
