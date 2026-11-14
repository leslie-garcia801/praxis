# 0032 — Debounce en la búsqueda de institución (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (pendientes) |
| Specs | RF-10 |
| Proyecto | frontend |

## Descripción

El buscador de institución del expediente (`SelectorInstitucion`) llamaba a `GET /api/instituciones` en cada tecla. Ahora espera 300 ms sin cambios antes de consultar.

## Checklist
- [x] Hook genérico `useDebouncedValue` en `src/lib/` con su prueba (temporizadores falsos)
- [x] `SelectorInstitucion` consulta con el valor con debounce
- [x] La prueba del buscador verifica que solo sale la consulta final (`q=beta`)

## Notas
- El catálogo de instituciones y los filtros del panel no lo necesitan: aplican al enviar el formulario o con Enter/blur.
