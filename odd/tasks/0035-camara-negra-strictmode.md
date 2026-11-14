# 0035 — Cámara en negro en desarrollo (StrictMode)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (pendientes) |
| Specs | RF-14 |
| Proyecto | frontend |

## Descripción

Al probar el escáner desde el celular (`pnpm dev:lan`), el permiso de cámara se concedía pero la vista quedaba en negro y sin error.

Causa: en desarrollo, `StrictMode` monta, desmonta y vuelve a montar los componentes, así que `useQrScanner` pedía la cámara dos veces sobre el mismo `<video>`. Al resolverse la primera petición ya cancelada, `ctrl.stop()` de `@zxing/browser` también limpia `video.srcObject` (`cleanVideoSource`) y borraba la imagen de la segunda cámara, la activa.

Arreglo: la petición de cámara se difiere un tick (`setTimeout(…, 0)`) y la limpieza del efecto cancela ese timer, así el montaje descartado nunca abre la cámara.

## Checklist
- [x] `useQrScanner`: petición diferida y `clearTimeout` en la limpieza
- [x] Pruebas del hook (`useQrScanner.test.tsx`): una sola petición con StrictMode y sin detener la cámara activa; primer resultado una sola vez; se detiene al desmontar; no abre la cámara si se desmonta enseguida; permiso denegado → `permiso`
- [x] Prueba manual en el celular con `pnpm dev:lan`: la vista de la cámara se ve y lee el QR

## Notas
- En producción no hay doble montaje, pero el arreglo no cambia su comportamiento.
