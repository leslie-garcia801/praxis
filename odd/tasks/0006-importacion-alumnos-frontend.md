# 0006 — Pantalla de importación de alumnos (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 1 (specs §14) |
| Specs | F-02, RF-01, RN-03, RN-03b, specs §9 (importaciones) |
| Proyecto | frontend |

## Descripción

Pantalla para que vinculación importe alumnos con su tipo asignado: descarga la plantilla, sube un `.xlsx` o `.csv`, revisa la vista previa con todas las filas (válidas y con errores) y confirma. Consume las rutas de la tarea 0004; el frontend no valida reglas de negocio, solo muestra lo que devuelve la API.

## Checklist

- [x] Ruta `/vinculacion/importar/alumnos` bajo `RequireRole(['VINCULACION','ADMIN'])` y enlace "Importar alumnos" en el panel
- [x] `features/importaciones/api.ts`: preview y confirmar con el archivo crudo como cuerpo y `Content-Type` explícito
- [x] Paso subir: descargar plantilla, elegir archivo `.xlsx`/`.csv`, aviso si pasa de 2 MB
- [x] Paso vista previa: resumen y **todas** las filas en orden (acción Crear/Actualizar o errores por campo); tarjetas en celular, tabla en escritorio; "Confirmar" deshabilitado si hay errores
- [x] Paso resultado: creados, actualizados, expedientes creados; "Importar otro archivo"
- [x] Errores de la API con su `message` (400, 413, 409); 422 al confirmar regresa a la vista previa con el reporte
- [x] Pruebas Vitest + RTL + MSW por estado, incluida `RN-03b` (error de oficina visible por fila)
- [x] `pnpm test`, `pnpm typecheck` y `pnpm lint` en verde

## Fuera de alcance

- Importación de instituciones (RF-07, iteración 2).
- Panel real de vinculación.
- Prueba Playwright (no es flujo crítico según `frontend/CLAUDE.md`).

## Notas

- El backend usa `express.raw` (sin multer): el archivo es el cuerpo de la petición, límite 2 MB y 2000 filas.
- Decisión del usuario (2026-11-08): la vista previa muestra también las filas válidas, no solo las que tienen errores.
- Probada a mano el 2026-11-08 contra el backend local: vista previa con filas válidas y con errores, e importación exitosa.
- Una corrida de `pnpm test` con la máquina cargada (107 s) tuvo 1 prueba fallida no identificada; las 4 corridas siguientes pasaron completas. Posible prueba sensible a tiempos de espera: vigilar.
