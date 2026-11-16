# 0050 — Pantalla "Firmas de las oficinas" (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | Mejora posterior al MVP (backlog) |
| Specs | RF-27, RF-29 |
| Proyecto | frontend |

## Descripción

El administrador captura el nombre y el cargo de la jefa de cada oficina; aparecen en la firma del reporte PDF de horas (RF-27). Pantalla `/vinculacion/oficinas/firmas`, dentro de la rama solo para ADMIN, con enlace "Firmas de las oficinas" en el menú (solo ADMIN, junto a "Usuarios"). Usa `GET` y `PUT /api/oficinas/responsables` de la tarea 0049.

- Un formulario por oficina (título = `nombreOficina`) con "Nombre" y "Cargo" precargados, aviso "Sin capturar" si no hay datos y "Actualizado el <fecha>" (America/Monterrey) si existen.
- Zod en el cliente replica al servidor (obligatorio, sin espacios sobrantes, máximo 150). Al guardar muestra "Guardado" y actualiza solo la entrada de esa oficina en la caché; los errores del servidor muestran su mensaje.
- Cada formulario guarda por separado; el botón se deshabilita mientras guarda y mientras no haya cambios.
- Estados: cargando, error con "Reintentar" y datos (el vacío no existe: la API siempre devuelve dos oficinas).

## Checklist

- [x] Pruebas primero (en rojo) y luego implementación
- [x] Ruta solo ADMIN y enlace en el menú solo para ADMIN
- [x] Pruebas: cargando, error y reintento, datos y nulos, validación, guardado, error 400, formularios independientes, acceso por rol
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` en verde

## Fuera de alcance

- Imagen de firma escaneada y sello.

## Notas

- El enlace del menú se llama "Firmas de las oficinas"; el de la tarea 0049 en el menú sigue siendo "Usuarios".
