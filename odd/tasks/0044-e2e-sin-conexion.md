# 0044 — Prueba e2e del registro sin conexión

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 6 (registro sin conexión) |
| Specs | RF-16, RN-14 |
| Proyecto | frontend |

## Descripción

Prueba de Playwright, en los proyectos móviles (iPhone 13 → WebKit, Pixel 7 → Chromium), del registro sin conexión con el IndexedDB real. Usa `seedAlumnoListoParaEscanear()` (0041) y el código corto.

`pnpm test:e2e` corre contra el servidor de Vite, que no tiene service worker: con `context.setOffline(true)` el navegador no puede cargar páginas ni módulos nuevos. Por eso cada prueba abre la app y llega a la pantalla necesaria en línea, se pone sin conexión y desde entonces solo navega con enlaces y botones (nunca `goto` ni recarga). Las rutas no son perezosas, así que no hay fragmentos por cargar.

## Checklist

- [x] `e2e/sinConexion.spec.ts`: `RF-16: sin conexión el registro queda pendiente y se envía al volver la red` (aviso "Sin conexión", contador, envío en el evento `online`, turno en el historial)
- [x] `e2e/sinConexion.spec.ts`: `RF-16: el registro pendiente sobrevive a cerrar la app y se envía al abrirla` (mismo contexto del navegador, página nueva)
- [x] `e2e/sinConexion.spec.ts`: `RN-14: un código inexistente registrado sin conexión aparece como rechazado y se puede descartar`
- [x] Las pruebas se omiten con mensaje si falta la configuración o el backend
- [x] `pnpm exec playwright test escaneo sinConexion` corrido con el backend, la base y Vite levantados: 10 pasan (iPhone 13 y Pixel 7)

## Fuera de alcance

- Abrir la app sin conexión desde un arranque en frío: requiere el service worker de un build de producción (`pnpm build && pnpm preview`). Comprobación manual en un celular real: instalar la app, abrirla con red, activar modo avión, cerrarla y volver a abrirla, registrar con el código corto y recuperar la red.
- Escaneo real con la cámara.

## Notas

- Variables: las mismas de la 0005 (`E2E_STAFF_EMAIL`, `E2E_STAFF_PASSWORD`).
- El backend permite 10 inicios de sesión por minuto (RNF-06). Para no chocar con ese límite, la sesión de staff se comparte por worker, la del alumno se abre por la API y se pasa al navegador (`e2e/helpers/alumno.ts`), y un 429 se reintenta tras el tiempo que indica `X-Retry-After`.
- `irAlCodigoCorto` se comparte con `escaneo.spec.ts` y ya no compite con el cambio automático de la página al código corto.
