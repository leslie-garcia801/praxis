# 0049 — Jefa de cada oficina en la firma del PDF (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | Mejora posterior al MVP (backlog) |
| Specs | RF-27, RF-29, RN-03b |
| Proyecto | backend |

## Descripción

El reporte de horas y actividades (RF-27) lo firma la jefa de la oficina dueña del expediente (Servicio Social y Titulación o Prácticas Profesionales), no una "Oficina de Vinculación" genérica. El administrador captura su nombre y cargo; la app los guarda por plantel y oficina.

- Modelo `ResponsableOficina` (tabla `responsables_oficina`): `plantelId`, `oficina`, `nombre`, `cargo`, `actualizadoEn`; único por (`plantelId`, `oficina`). No se siembran nombres reales.
- `GET /api/oficinas/responsables` (ADMIN y VINCULACION): siempre las dos oficinas del plantel, en orden `SERVICIO_SOCIAL`, `PRACTICAS`, con `{ oficina, nombreOficina, nombre, cargo, actualizadoEn }` (`null` si aún no se captura). Vinculación lee ambas: el nombre de la jefa no es dato personal sensible y RN-03b limita expedientes, no este catálogo.
- `PUT /api/oficinas/responsables/:oficina` (solo ADMIN): cuerpo `{ nombre, cargo }` (recortados, 1 a 150 caracteres, objeto estricto); upsert para el plantel del admin y `AuditLog` (`EDITAR_RESPONSABLE_OFICINA`, antes y después) en la misma transacción. `:oficina` inválida responde 400.
- PDF: el bloque de firma de oficina muestra el nombre de la oficina del expediente (`NOMBRE_OFICINA`) y, si está capturada, nombre y cargo; si no, queda la línea vacía con el rótulo. El PDF nunca falla por falta del dato.

## Checklist

- [x] Pruebas primero (en rojo) y luego implementación
- [x] Migración `responsables_oficina`
- [x] Rutas GET y PUT con pruebas: caso feliz, 400, 401, 403, upsert, auditoría, aislamiento por plantel
- [x] PDF con y sin responsable, y la oficina correcta según servicio social o prácticas
- [x] `pnpm test`, `pnpm typecheck` y `pnpm lint` en verde

## Fuera de alcance

- Pantalla del administrador para editar las jefas (tarea 0050).
- Imagen de firma escaneada y sello.

## Notas

- `docs/specs.md` no se modificó. Pendiente en las specs: agregar el endpoint a la sección 9 y la tabla `ResponsableOficina` a la sección 8.
- `borrarPlantel` de `test/factories.ts` ahora borra también estas filas y su bitácora de auditoría.
