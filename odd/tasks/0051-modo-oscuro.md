# 0051 — Modo oscuro (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | Mejora posterior al MVP |
| Specs | RNF-01, RNF-09 |
| Proyecto | frontend |

## Descripción

Selector de tema con tres opciones, **Claro / Oscuro / Sistema** (por defecto Sistema), en el encabezado del alumno y en el de vinculación. La elección se recuerda en el dispositivo (`localStorage`, clave `praxis.tema`) y no hay parpadeo al cargar: un script mínimo en `index.html` aplica la clase `dark` antes del primer pintado.

- Lógica en `src/lib/tema.ts` (preferencia, resolución con `prefers-color-scheme`, clase `dark`, `color-scheme` y `<meta name="theme-color">`) y hook `useTema`. Todo acceso a `localStorage` va en `try/catch`; un valor inválido equivale a Sistema. En Sistema reacciona en vivo al cambio del sistema.
- Selector `SelectorTema` (lista nativa con nombre accesible "Tema") para no apretar el encabezado de 360 px.
- Limpieza de colores: el texto neutro (`text-slate-*`) pasa a `text-foreground` / `text-muted-foreground`; los avisos y estados (verde, ámbar, rojo) tienen variantes `dark:` con contraste AA. `--muted-foreground` claro se oscurece (0.556 a 0.48) para cumplir AA también sobre `--muted`.

## Checklist

- [x] Pruebas primero (en rojo) y luego implementación
- [x] Selector en ambos encabezados
- [x] Script anti-parpadeo en `index.html`
- [x] Colores fijos reemplazados por tokens o con variante `dark:`
- [x] Pruebas: Sistema claro/oscuro, elegir y recordar, cambio en vivo del sistema, valor inválido, `localStorage` que falla, meta `theme-color`, selector en ambos encabezados
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` en verde

## Fuera de alcance

- El reporte PDF y los correos (se quedan en claro).

## Notas

- El borde de `--input` y `--border` es el de shadcn (decorativo); no se cambió.
