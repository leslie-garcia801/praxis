# 0062 — Horas de libreta (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | Mejora posterior al MVP |
| Specs | RF-17a, RN-19, RN-04, RN-11, RN-15, RF-21, RF-22 |
| Proyecto | frontend |

## Descripción

Pantallas para las rutas de la tarea 0061: el alumno captura los turnos que ya tenía firmados en su libreta de papel y, si el supervisor rechaza la semana, los reemplaza y la reenvía. El frontend no calcula horas acreditables ni decide reglas: la vista previa solo suma lo escrito y el servidor aplica RN-04, RN-09 y RN-19.

- **Captura** (`/alumno/libreta`, enlace "Agregar horas" en el inicio cuando el expediente está `EN_PROCESO`). Filas de turno (fecha, hora de entrada, hora de salida; de 1 a 200, agregar y quitar), vista previa por semana con total por día y por semana (hora de Monterrey, RN-15) y aviso del tope diario. "Revisar y enviar" valida en el cliente (campos vacíos, salida posterior a la entrada, solo semanas anteriores a la actual), pide confirmación y envía `POST /api/semanas/libreta` con un UUID por turno. Muestra las semanas enviadas, el error general del servidor o, en un 409 con `details`, el mensaje de cada fila junto a su turno.
- **Corrección** (`/alumno/libreta?corregir=<lunes>`): para una semana de libreta rechazada con `puedeCorregirLibreta`, el mismo formulario precargado con los turnos de la semana (conservan su `id`), fechas limitadas a esa semana y `PUT /api/semanas/:id/libreta`. Si la semana ya no se puede corregir, lo dice.
- **Historial del alumno**: etiqueta "Libreta" en la semana y en cada turno de libreta; sin "Solicitar corrección" en turnos de libreta (RN-19); en lugar de la bitácora, un panel con el comentario del rechazo y el enlace "Corregir turnos".
- **Pendientes**: una semana de libreta rechazada dice "Corrige las horas de la semana del…" y enlaza a la corrección.
- **Supervisor** (`/validar/:token`) y **detalle de la oficina**: etiqueta "Libreta" en la semana y los turnos, y aviso de que la semana no lleva bitácora en lugar de "Sin bitácora". Las acciones de validar y rechazar (RF-21, RF-22) no cambian.

## Checklist

- [x] Pruebas primero (en rojo) y luego implementación
- [x] Captura: texto explicativo, expediente no en proceso, filas, validación en el cliente, RN-19 (semana en curso), vista previa, confirmación, cuerpo del POST, éxito con invalidación de historial, pendientes y avance, errores por fila y general
- [x] Corrección: precarga, cuerpo del PUT con ids, fechas limitadas a la semana, semana no corregible, error 409
- [x] Etiqueta y sin solicitud de corrección en el historial; turno de QR sin cambios; pendientes; supervisor; detalle de la oficina; enlace del inicio
- [x] MSW: `buildSemanaLibreta` y campos `deLibreta`, `puedeCorregirLibreta`, `origen`
- [x] `pnpm test`, `pnpm typecheck` y `pnpm lint` en verde

## Fuera de alcance

- Subir una foto de la libreta (descartado en 0061).
- Horas de libreta de la semana en curso: se registran con QR.
- Aviso al salir con filas sin enviar.

## Notas

- El texto de confirmación dice que los turnos se envían por correo en el resumen semanal del lunes, según la nota de 0061 (no hay correo inmediato).
- El aviso de tope diario usa `TOPE_DIARIO_TEXTO` (solo informativo).
