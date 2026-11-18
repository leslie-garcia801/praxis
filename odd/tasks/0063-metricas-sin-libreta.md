# 0063 — Métricas del piloto sin horas de libreta

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | Mejora posterior al MVP |
| Specs | §12, RF-17a, RN-19, RF-22 |
| Proyecto | backend (y documentación) |

## Descripción

Las horas de libreta (tareas 0061 y 0062) se copian del papel, no se escanean. El piloto mide adopción de la app y precisión del QR, así que esos turnos no deben inflar las métricas. El reporte de métricas del piloto (tarea 0053) cambia así:

- **Métrica 1** (registro de al menos 4 días por semana) y **métrica 3** (turnos incompletos): excluyen los turnos con `origen = LIBRETA`. Un día con solo turnos de libreta no es un día registrado.
- **Métrica 2** (semanas validadas en 7 días): sin cambios; las semanas de libreta cuentan porque miden la respuesta del supervisor.
- El texto del reporte indica siempre cuántos turnos de libreta se excluyeron (`turnosLibretaExcluidos`, también con 0).
- CSV: sin columnas nuevas. `Días registrados`, `Cumple 4 días`, `Turnos` y `Turnos incompletos` cuentan solo turnos de QR, para ser consistentes con las métricas; `Semanas enviadas` y `Validadas a tiempo` incluyen las semanas de libreta.
- Documentación: `docs/piloto.md` (aviso de privacidad aprobado, métricas, comparación con el papel solo en semanas de QR), guías de alumno, supervisor y vinculación, y `docs/flujo-app.md`.

## Checklist

- [x] Pruebas que nombran RN-19: libreta no cuenta como día registrado, no entra en la métrica 3, sí cuenta en la métrica 2 y el reporte informa los excluidos
- [x] Servicio y formato del reporte
- [x] Documentación del piloto y guías
- [x] `pnpm test`, `pnpm typecheck` y `pnpm lint` en verde (backend)

## Fuera de alcance

- Cambiar la definición de la métrica 2.
- Ocultar los turnos de libreta en las pantallas de oficina (siguen visibles con su etiqueta).

## Notas

- La comparación contra el papel (métrica 4) se hace a mano solo con semanas registradas con QR; las de libreta coinciden con el papel por construcción.
