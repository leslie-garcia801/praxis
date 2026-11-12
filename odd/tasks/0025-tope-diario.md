# 0025 — Tope diario de 6 h 30 min (backend + frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (specs §14) |
| Specs | RN-04 (cambia), RN-16 |
| Proyecto | backend y frontend |

## Descripción

Decisión de la usuaria (2026-11-11): el tope de horas acreditables por día sube de **5 h (300 min) a 6 h 30 min (390 min)**. Lo que exceda el tope se sigue registrando pero no se acredita (el resto de RN-04 no cambia). Contradice el texto actual de RN-04 en `docs/specs.md` ("Máximo 5 horas acreditables por día"); las specs no se modifican en esta tarea salvo que la usuaria lo pida.

## Checklist
- [x] `TOPE_MINUTOS_DIA = 390` en `backend/src/domain/horas.ts` (y su comentario)
- [x] Pruebas del backend que fijan 300 → 390 (dominio, escaneo, historial), con nombres que mencionan RN-04 y el tope nuevo
- [x] Textos del frontend: "Solo se acreditan 6 h 30 min por día; …" (escaneo) y "… no se acreditan (tope de 6 h 30 min por día)" (historial), desde una sola constante del frontend para no repetir el número
- [x] Pruebas del frontend con los textos nuevos
- [x] `pnpm test`, `pnpm typecheck` y `pnpm lint` en ambos proyectos

## Notas
- Los turnos ya registrados guardan `minutosAcreditables` calculado con el tope anterior; se recalculan solos cuando otro escaneo toca ese día. En la base de desarrollo ningún día supera 5 h, así que no hay nada que recalcular. Si al desplegar hubiera datos reales, decidir si se recalculan.
- La fecha estimada (RN-16) usa los minutos acreditados, así que con el tope nuevo un alumno que hace jornadas largas termina antes.
