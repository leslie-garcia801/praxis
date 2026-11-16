# 0059 — Pantalla "Asignar programa" y "Cambiar supervisor" (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | Mejora posterior al MVP |
| Specs | RF-01, RF-12, RF-29, RN-03, RN-03a, RN-03b |
| Proyecto | frontend |

## Descripción

Pantalla de la oficina para asignar el siguiente programa con las rutas de la tarea 0058, y cambio de supervisor desde el detalle del alumno.

- **Asignar programa** (`/vinculacion/asignar`, VINCULACION y ADMIN; enlace "Asignar programa" en el menú). Lista de candidatos (`GET /api/expedientes/candidatos`): tabla en escritorio y tarjetas en celular con casilla, nombre, matrícula, carrera, semestre y grupo, programa terminado con su fecha ("—" si no se conoce) y programa a asignar. Casilla "Seleccionar todos". El botón "Asignar programa a N alumno(s)" se desactiva sin selección y abre una confirmación; luego envía `POST /api/expedientes/asignar` con los ids elegidos.
- **Resultado**: lista los asignados (con enlace al expediente nuevo) y los omitidos con el motivo del servidor. La lista de candidatos y el panel se refrescan; los asignados desaparecen de la lista. Estados: cargando, error con reintento, vacío y con datos.
- **Cambiar supervisor** (detalle del alumno, expedientes PENDIENTE, EN_PROCESO o SUSPENDIDO con institución): formulario con los supervisores activos de la institución, sin el actual, y enlace "Agregar un supervisor en la institución" (`/vinculacion/instituciones/:id/editar`). Envía `PATCH /api/expedientes/:id` con `{ supervisorId }`, muestra "Supervisor cambiado." y refresca el detalle y la auditoría. Muestra los errores del servidor (supervisor inactivo, de otra institución, expediente no editable). Si no hay otro supervisor activo, lo dice y deja el enlace.

## Checklist

- [x] Pruebas primero (en rojo) y luego implementación
- [x] Estados de la lista, etiquetas, fecha y "—"
- [x] Selección, "Seleccionar todos" y botón desactivado sin selección
- [x] Flujo de asignar: confirmación, ids enviados, asignados con enlace, omitidos con motivo y lista refrescada
- [x] Ruta y enlace del menú para VINCULACION y ADMIN; ALUMNO bloqueado
- [x] Cambiar supervisor: opciones sin inactivos ni el actual, cuerpo del PATCH, éxito, errores, oculto en FINALIZADO/CANCELADO, mensaje y enlace sin supervisores
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` en verde

## Fuera de alcance

- Asignar el primer programa (importación, RF-01).
- Terminar un expediente: hoy ningún flujo pasa un expediente a FINALIZADO (hueco conocido); sin esa transición la lista de candidatos solo se llena con expedientes finalizados por otra vía.
- Filtros de la lista de candidatos.

## Notas

- La fecha "Terminó" es la que calcula el backend (última asistencia o `fechaTermino`); puede venir vacía.
- El frontend no decide la elegibilidad ni el programa: muestra lo que devuelve la API.
- Se agregaron `NOMBRE_PROGRAMA` (`lib/oficinas.ts`) y `formatFechaLarga` (`lib/tiempo.ts`).
