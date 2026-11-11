# 0019 — Historial semanal del alumno (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 3 (specs §14) |
| Specs | RF-19, RN-04, RN-08, RN-15, RNF-01, RNF-09, specs §10 (Alumno, pantalla 4) |
| Proyecto | frontend |

## Descripción

Reemplaza el marcador de `/alumno/historial` por el historial por semana (RF-19): los 7 días de lunes a domingo con sus entradas, salidas, horas y el estado de validación de la semana. Consume `GET /api/asistencias?semana=` (tarea 0015, ver "Contrato de la API" en `odd/tasks/0015-avance-historial.md`). El servidor agrupa, calcula minutos y aplica el tope diario; el frontend solo da formato.

## Checklist

### Base
- [x] `features/historial/api.ts`: `useHistorial(semana?)` (sin `expedienteId`: el backend usa el expediente del alumno)
- [x] `lib/tiempo.ts`: `sumarDias(fechaISO, n)` para navegar entre semanas, y formato de día (`"lunes 9"`) y de rango (`"9 al 15 de noviembre"`, con mes y año cuando la semana cruza de mes o de año); con pruebas

### Pantalla `/alumno/historial`
- [x] La semana va en la URL (`?semana=AAAA-MM-DD`); sin parámetro, la semana actual. Los botones del navegador funcionan
- [x] Encabezado: "Semana del 9 al 15 de noviembre" y el estado de validación: `null` o `BORRADOR` → "Sin enviar"; `ENVIADA` → "Enviada a tu supervisor"; `VALIDADA` → "Validada"; `RECHAZADA` → "Rechazada"
- [x] Botones "Semana anterior" y "Semana siguiente" (± 7 días desde `inicio`); "Semana siguiente" deshabilitado si la semana mostrada incluye hoy (hora de Monterrey)
- [x] Un bloque por día con su nombre y fecha. Cada turno: "10:11 – 16:18" y sus horas acreditadas (`minutosAcreditables`)
  - `ABIERTA` → "10:26 – en curso"
  - `INCOMPLETA` (RN-08) → "Sin salida registrada", 0 h
  - Salida en otro día (turno que cruza la medianoche) → la hora de salida lleva su día
  - `sinConexion` → etiqueta "Registrado sin conexión"
- [x] Total del día: horas acreditadas (`minutosAcreditablesDia`). RN-04: si `minutosDia > minutosAcreditablesDia`, aviso "X no se acreditan (tope de 5 h por día)"
- [x] Días sin turnos: "Sin registros" en un renglón compacto
- [x] Total de la semana (`totales.minutosAcreditables`)
- [x] Semana sin ningún turno: "No hay registros esta semana"
- [x] Sin expediente (404 `EXPEDIENTE_NO_ENCONTRADO`) → "No tienes un expediente. Acude a vinculación."; otros errores → mensaje con "Reintentar"; estado de carga
- [x] Enlace "Volver al inicio"

### Pruebas (Vitest + RTL + MSW)
- [x] Semana con turnos cerrados, abierto, incompleto y sin conexión; totales del día y de la semana
- [x] `RN-04: avisa los minutos del día que no se acreditan por el tope`
- [x] `RN-08: muestra el turno incompleto sin salida`
- [x] Navegación: "Semana anterior" pide `semana` = inicio − 7 días y cambia la URL; "Semana siguiente" deshabilitado en la semana actual (fecha fija con `vi.setSystemTime`)
- [x] Abrir `/alumno/historial?semana=2026-11-02` pide esa semana
- [x] Cada estado de validación; semana vacía; sin expediente; error y "Reintentar"; cargando
- [x] `lib/tiempo.ts`: `sumarDias` (cambio de mes y de año) y el formato del rango

## Fuera de alcance
- Bitácora de la semana y envío al supervisor (RF-20, RF-21): iteración 4.
- Solicitud de corrección de un turno incompleto (RF-17): tarea aparte.
- Historial desde el panel de vinculación (RF-25): iteración 5.

## Notas

### Decisiones técnicas
- `BORRADOR` y "sin semana" se muestran igual ("Sin enviar"), porque para el alumno significan lo mismo: aún no la manda a su supervisor.
- La semana en la URL permite volver con el botón del navegador y recargar sin perder la semana.
- "Semana siguiente" se deshabilita cuando el fin de la semana mostrada es hoy o posterior (en Monterrey), así tampoco se navega a semanas futuras vacías.
- `ErrorConReintento` se movió a `src/components/` para compartirlo entre `expediente` e `historial`.

### Prueba manual
Completada 2026-11-11 por la usuaria con Ana López: abrir `/alumno/historial`, navegar a semanas anteriores (la URL cambia a `?semana=`), recargar y comprobar que conserva la semana; verificar en 360 px.
