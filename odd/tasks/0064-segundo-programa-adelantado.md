# 0064 — Adelantar el segundo programa en 5.º semestre

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | Mejora posterior al MVP |
| Specs | RN-01, RN-03, RN-03a, RN-03b, RF-01 |
| Proyecto | backend (y especificación) |

## Descripción

Con 240 h, un alumno puede terminar prácticas (o servicio social) mientras sigue en 5.º semestre. Antes, la acción "Asignar siguiente programa" (tareas 0013 y 0058) exigía 6.º semestre, así que el alumno tenía que esperar. La responsable del proyecto decidió el 2026-11-18 que el segundo programa puede asignarse en cuanto el primero esté `FINALIZADO`:

- `decidirAsignacion` ya no exige 6.º semestre; solo RN-01 (5.º o superior). Se elimina `SEMESTRE_SEGUNDO_PROGRAMA`.
- `GET /api/expedientes/candidatos` carga alumnos desde 5.º semestre.
- Sin cambios: RN-03 (nunca dos programas activos), RN-03b (cada oficina asigna su tipo) y la exigencia de que el primer programa esté finalizado.
- Specs: RN-03a, §2 (descripción), RF-01 y la fila de `/api/expedientes/candidatos`.
- Frontend: sin cambios; la pantalla de asignación muestra lo que devuelve la API.

## Checklist

- [x] Pruebas que nombran RN-03a: dominio, `POST /asignar` y `GET /candidatos` con un alumno de 5.º semestre
- [x] Prueba de RN-01: un alumno de 4.º semestre se omite
- [x] Regla de dominio y consulta de candidatos
- [x] Specs actualizadas
- [x] `pnpm test`, `pnpm typecheck` y `pnpm lint` en verde (backend)

## Fuera de alcance

- Cambiar la duración mínima de los programas (§13 #1 y #2).
- Validar que el alumno haya terminado el semestre o la fecha del periodo escolar.
