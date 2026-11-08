# 0002 — Dominio: cálculo de horas

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 1 (specs §14) — base del cálculo que usa la iteración 3 |
| Specs | §8.4, RN-04, RN-05, RN-08, RN-09, RN-15, RN-16 |
| Proyecto | backend |

## Descripción

Escribir `backend/src/domain/horas.ts` con **TDD** (primero las pruebas): funciones puras, sin Express ni Prisma, que calculan los minutos acreditables de cada turno y de cada día, y la fecha estimada de término. Es el corazón del conteo de horas, así que sus pruebas deben ser exhaustivas.

## Checklist

- [x] `horas.test.ts` escrito antes que la implementación
- [x] RN-09: un turno de menos de 15 minutos acredita 0
- [x] RN-04: tope de 300 minutos por día con varios turnos; el excedente se descuenta del último turno del día
- [x] RN-05: sábados y domingos cuentan igual
- [x] Turno que cruza medianoche (en hora de Monterrey)
- [x] RN-08: turno abierto cerrado a las 23:59 queda `INCOMPLETA` con 0 minutos
- [x] RN-15: los días se agrupan en `America/Monterrey`, no en la zona del servidor
- [x] RN-16: fecha estimada = hoy + faltantes ÷ promedio diario de los últimos 28 días
- [x] RN-16: con menos de 5 días registrados devuelve "aún sin datos suficientes"
- [x] Solo minutos enteros; las horas se calculan solo para mostrar
- [x] `pnpm test` y `pnpm typecheck` en verde

## Fuera de alcance

- Persistencia, rutas de la API y pantallas.
- Validación semanal (RN-11, RN-17).

## Notas

- **Decisión (opción A):** un turno que cruza la medianoche se parte en la medianoche de Monterrey; cada parte cuenta para el tope de 300 min de su propio día. RN-09 se evalúa sobre el turno completo, antes de partirlo. Dentro de un día los minutos se acreditan en orden cronológico, así el excedente cae en el último turno.
- **RN-08:** si la entrada fue después de las 23:59, la salida automática queda 1 s después de la entrada para respetar `salida > entrada`.
- Utilidades de zona horaria en `backend/src/lib/tiempo.ts` (Intl, sin dependencias); las pruebas pasan con el reloj del sistema en UTC, Tokio, Kiritimati y Los Ángeles.
- **Decisión RN-16 (opción C):** promedio diario = minutos acreditables de los últimos 28 días locales (incluido hoy) ÷ min(28, días de calendario desde el primer registro). El mínimo de 5 días cuenta días con minutos acreditables dentro de la ventana. Los días posteriores a hoy se ignoran. El cálculo de días usa aritmética entera para evitar errores de redondeo.
- `estimarFechaTermino` recibe `minutosFaltantes`: el servicio decide si parte de horas validadas o registradas (RN-11) en la iteración 3.
- Resultado: 43 pruebas del backend en verde; typecheck, lint y build OK.
