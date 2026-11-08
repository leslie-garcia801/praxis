# 0002 — Dominio: cálculo de horas

| Campo | Valor |
| --- | --- |
| Estado | Pendiente |
| Iteración | 1 (specs §14) — base del cálculo que usa la iteración 3 |
| Specs | §8.4, RN-04, RN-05, RN-08, RN-09, RN-15, RN-16 |
| Proyecto | backend |

## Descripción

Escribir `backend/src/domain/horas.ts` con **TDD** (primero las pruebas): funciones puras, sin Express ni Prisma, que calculan los minutos acreditables de cada turno y de cada día, y la fecha estimada de término. Es el corazón del conteo de horas, así que sus pruebas deben ser exhaustivas.

## Checklist

- [ ] `horas.test.ts` escrito antes que la implementación
- [ ] RN-09: un turno de menos de 15 minutos acredita 0
- [ ] RN-04: tope de 300 minutos por día con varios turnos; el excedente se descuenta del último turno del día
- [ ] RN-05: sábados y domingos cuentan igual
- [ ] Turno que cruza medianoche (en hora de Monterrey)
- [ ] RN-08: turno abierto cerrado a las 23:59 queda `INCOMPLETA` con 0 minutos
- [ ] RN-15: los días se agrupan en `America/Monterrey`, no en la zona del servidor
- [ ] RN-16: fecha estimada = hoy + faltantes ÷ promedio diario de los últimos 28 días
- [ ] RN-16: con menos de 5 días registrados devuelve "aún sin datos suficientes"
- [ ] Solo minutos enteros; las horas se calculan solo para mostrar
- [ ] `pnpm test` y `pnpm typecheck` en verde

## Fuera de alcance

- Persistencia, rutas de la API y pantallas.
- Validación semanal (RN-11, RN-17).

## Notas

- Definir cómo se reparte un turno que cruza medianoche entre los dos días antes de escribir la prueba.
