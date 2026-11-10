# 0011 — Pantallas de instituciones (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 2 (specs §14) |
| Specs | RF-05, RF-06, RF-07, RF-08, RF-13, RF-15 |
| Proyecto | ambos (frontend + `GET /api/carreras` en backend) |

## Descripción

Pantallas del panel de vinculación para el catálogo de instituciones: tabla con filtros, alta y edición, descarga del QR imprimible e importación desde Excel o CSV (specs §10, vinculación, puntos 3 y 4). Hoy todo eso solo se puede hacer con curl. Para poblar el filtro y el selector de carreras se agrega `GET /api/carreras` en el backend.

## Checklist

### Backend
- [x] `GET /api/carreras` (vinculación y admin): catálogo de carreras ordenado por nombre
- [x] Pruebas: caso feliz, 401 y 403 (alumno)

### Base del frontend
- [x] Helper en `lib/api.ts` para descargar archivos de una petición POST (blob + nombre desde `Content-Disposition`)
- [x] Mover a un módulo compartido los helpers de la importación de alumnos que se reutilizan (envío de archivo, tamaño máximo, piezas de la vista previa)
- [x] Agregar solo los componentes de shadcn/ui que se usen

### Catálogo (`/vinculacion/instituciones`)
- [x] Tabla con nombre, municipio, cupo, activa y código corto
- [x] Filtros: texto, municipio, carrera, turno, tipo y "con cupo" (RF-06), resueltos en el servidor
- [x] Estados de carga, error, vacío y con datos

### Alta y edición (`/vinculacion/instituciones/nueva` y `/:id/editar`)
- [x] Formulario con React Hook Form + Zod con los campos de la ficha (RF-05)
- [x] Marcar como inactiva y editar el cupo (RF-08)
- [x] 409 `RFC_DUPLICADO` se muestra en el campo RFC

### QR (RF-13, RF-15)
- [x] Botón "Descargar QR" con confirmación previa: genera un QR y un código corto nuevos, y el anterior deja de servir
- [x] Al terminar, se descarga el PDF y se actualiza el código corto en pantalla

### Importación (`/vinculacion/importar/instituciones`, RF-07)
- [x] Descargar plantilla, subir archivo, vista previa con CREAR/OMITIR y "coincide con", y confirmar
- [x] Errores de archivo (formato, columnas faltantes, tamaño) y 422 con el reporte actualizado

### Cierre
- [x] Enlaces nuevos en el panel `/vinculacion`
- [x] `pnpm test` y `pnpm typecheck` en verde en backend y frontend

## Fuera de alcance

- Catálogo para el alumno (buscador, filtros y ficha): iteración 3, porque depende del expediente (decisión del usuario, 2026-11-10).
- Supervisores (RF-09).
- Imprimir el QR de varias instituciones a la vez.
- Pruebas de Playwright: las pantallas de vinculación no son flujos críticos.

## Notas

- `cupo` en `null` significa "sin dato" y queda fuera del filtro "con cupo"; la interfaz debe dejarlo claro.
- Una institución recién creada no tiene QR imprimible hasta la primera descarga, porque el token no se devuelve al crearla.
- `GET /api/carreras` no recibe entrada, así que no hay prueba de validación; el catálogo no está acotado por plantel (el modelo `Carrera` no tiene `plantelId`).
- Decisiones de la interfaz: los filtros del catálogo se aplican con el botón "Aplicar filtros" (no en cada tecla) y se resuelven en el servidor; la tabla es única con desplazamiento horizontal en pantallas angostas; la ficha manda el formulario completo en el PATCH (los vacíos opcionales salen como `null`); el cupo vacío se envía como `null`.
- Al descargar el QR se confirma primero; si la API falla, el diálogo queda abierto con el mensaje. Después se invalidan todas las consultas `['instituciones']` para mostrar el código corto nuevo. En la pantalla de edición el formulario no se reinicia con ese refresco.
- Helpers compartidos de importación: `features/importaciones/archivo.ts` (envío de archivo, tamaño máximo, mensajes) y `components/piezas.tsx` (paso de subida, alertas, resumen y acciones de la vista previa). Se agregó el componente `alert-dialog` de shadcn/ui.
- Convención de claves de TanStack Query: `institucionesKeys` y `carrerasKey` en `features/instituciones/api.ts`.
