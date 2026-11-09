# ODD — Organic Driven Development

Cada unidad de trabajo vive en `odd/tasks/` como un archivo Markdown con su descripción y un checklist que se va marcando conforme avanza.

## Convenciones

| Tema | Regla |
| --- | --- |
| Nombre | `NNNN-titulo-corto.md`, numerado en orden (`0001-andamiaje.md`) |
| Estado | `Pendiente` · `En progreso` · `Terminada` en la cabecera de la tarea |
| Alcance | Una tarea = un entregable verificable, dentro de una iteración de `docs/specs.md` (sección 14) |
| Trazabilidad | Cita los IDs que aplica (`RF-xx`, `RN-xx`, `RNF-xx`) |
| Terminada | Todo el checklist marcado, y `pnpm test` y `pnpm typecheck` pasan en el proyecto tocado |

## Plantilla

```markdown
# NNNN — Título de la tarea

| Campo | Valor |
| --- | --- |
| Estado | Pendiente |
| Iteración | N (specs §14) |
| Specs | RF-xx, RN-xx |
| Proyecto | backend / frontend / ambos |

## Descripción

Qué se construye y por qué, en uno o dos párrafos.

## Checklist

- [ ] Paso verificable
- [ ] Pruebas que nombran la regla (`it('RN-xx: ...')`)
- [ ] `pnpm test` y `pnpm typecheck` en verde

## Fuera de alcance

- Lo que explícitamente no entra en esta tarea.

## Notas

Decisiones tomadas y pendientes.
```

## Tareas

| # | Tarea | Estado |
| --- | --- | --- |
| 0001 | [Andamiaje del proyecto](tasks/0001-andamiaje.md) | Terminada |
| 0002 | [Dominio: cálculo de horas](tasks/0002-dominio-horas.md) | Terminada |
| 0003 | [Autenticación y usuarios por oficina](tasks/0003-autenticacion.md) | Terminada |
| 0004 | [Importación de alumnos](tasks/0004-importacion-alumnos.md) | Terminada |
| 0005 | [Pantallas de acceso](tasks/0005-pantallas-acceso.md) | Terminada |
