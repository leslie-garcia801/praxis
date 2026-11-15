# 0040 — Correcciones pendientes en la app de vinculación (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (pendientes) |
| Specs | RF-17, RF-25, RF-29, RN-03b; §10 vinculación, pantalla 5 |
| Proyecto | frontend |

## Descripción

Última de cuatro tareas de RF-17 ([0037](0037-solicitar-correccion.md), [0038](0038-resolver-correccion.md), [0039](0039-correccion-alumno.md)).

- **Pantalla "Correcciones pendientes"** (`/vinculacion/correcciones`, enlace "Correcciones" en el menú): la cola de solicitudes de la oficina (RN-03b en la API), las más antiguas primero. Cada tarjeta muestra al alumno (con enlace a su detalle), el día del turno, el turno como quedó registrado, las horas propuestas, el motivo y la fecha de la solicitud.
- **Resolver:** "Aprobar corrección" o "Rechazar" con un comentario para el alumno (5 a 1000 caracteres, la misma regla que el rechazo de una semana). Los errores de reglas del servidor (por ejemplo, semana ya enviada) se muestran tal cual. Al resolver se refrescan la cola, el detalle, el avance y el panel.
- **Detalle del alumno (RF-25):** el historial usa la vista de oficina: una solicitud pendiente se muestra en su turno con el motivo y se puede resolver ahí mismo; una rechazada muestra el comentario enviado al alumno. La oficina nunca ve "Solicitar corrección".
- **Auditoría (RF-29):** etiquetas legibles para `CORREGIR_ASISTENCIA` y `RECHAZAR_CORRECCION`, entidades "Turno" y "Solicitud de corrección", entrada y salida en hora de Monterrey y estados del turno; los identificadores internos (`solicitudId`, `asistenciaId`) no se muestran.

## Checklist
- [x] `correcciones/api.ts`: `useCorreccionesPendientes` y `useResolverCorreccion`
- [x] `ResolverCorreccion` y `CorreccionesPendientesPage`; ruta y enlace en el menú
- [x] `DiaHistorial` y `CorreccionTurno` con `vista` (`alumno` u `oficina`); `textoRango` movido a `historial/rangoTurno.ts`
- [x] `AuditoriaExpediente`: acciones, entidades, campos y formato de instantes
- [x] Pruebas: enlace del menú, cargando, vacío, error con reintento, contenido de la tarjeta, aprobar, rechazar con validación del comentario, error del servidor, resolver desde el detalle, rechazada en el detalle y auditoría
