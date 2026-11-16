# 0052 — Contraste de los bordes de los campos

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | Mejora posterior al MVP |
| Specs | RNF-09 |
| Proyecto | frontend |

## Descripción

El borde que identifica un campo de formulario (inputs, selects, textareas y botones con contorno usan el token `--input`) tenía 1.26:1 contra el fondo en modo claro y era translúcido en modo oscuro. WCAG 2.1, criterio 1.4.11, pide 3:1 para los límites de un control. Se cambió solo `--input`; `--border` (separadores y tarjetas, decorativo) queda igual.

## Checklist

- [x] Prueba `src/lib/contraste.test.ts` que lee los tokens de `index.css` y exige 3:1 de `--input` sobre `--background`, `--card` y `--muted` en los dos modos (fallaba antes del cambio)
- [x] `--input` claro: `oklch(0.62 0 0)` → 3.64:1 sobre fondo y tarjeta, 3.34:1 sobre `--muted`
- [x] `--input` oscuro, ahora opaco: `oklch(0.56 0 0)` → 4.25:1 sobre fondo, 3.85:1 sobre tarjeta, 3.25:1 sobre `--muted`
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` en verde

## Fuera de alcance

- `--border` de separadores y tarjetas (decorativo, no identifica controles).
- Casillas y botones de opción nativos (los dibuja el navegador).

## Notas

- En pruebas, Vitest ahora procesa solo `src/index.css` (`test.css.include`) para que la prueba pueda leerlo con `?raw`; el resto del CSS sigue sin procesarse.
- En grises neutros de oklch la luminancia relativa es L³, por eso la prueba calcula el contraste sin convertir a sRGB.
