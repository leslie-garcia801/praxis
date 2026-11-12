# 0030 — Detalle del alumno, solo lectura (backend + frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (specs §14) |
| Specs | RF-25, RF-29, RN-03b, RN-15 |
| Proyecto | backend y frontend |

## Descripción

Pantalla de vinculación con todo lo que la oficina necesita saber de un expediente: datos, avance, historial semana por semana con bitácora, reporte PDF y auditoría. Es **solo lectura**: las acciones (estado, transferir, confirmar, validar a nombre del supervisor, edición) son la tarea 0031 y el encabezado deja el lugar para ellas.

## Checklist

### Backend
- [x] `GET /api/expedientes/:id/auditoria` (`VINCULACION`, `ADMIN`; specs §3 "Ver la auditoría"). Permisos con `cargar` (RN-03b): otra oficina → 403; otro plantel o inexistente → 404; alumno → 403
- [x] Devuelve `{ limite, truncado, entradas[] }`, de la más reciente a la más antigua, con `id`, `fecha` (ISO UTC), `usuario` (nombre; sin usuario → "Sistema"), `accion`, `entidad`, `antes`, `despues`
- [x] `GET /api/expedientes/:id` ya devuelve todo lo que la pantalla necesita (alumno, carrera, grupo, turno, institución, departamento, supervisor con contacto para la oficina, periodo, horario, meta): sin cambios en su contrato
- [x] Pruebas: orden y contenido, no se filtran entradas de otro expediente ni de otra entidad, 401, 403 (alumno, `RN-03b`), 404, 400 por id inválido

### Frontend
- [x] Ruta `/vinculacion/expedientes/:id` dentro del layout de vinculación; página "Detalle del alumno"
- [x] Encabezado (nombre, matrícula, tipo, estado), Expediente, Avance (`useAvance`), Historial por semana (`GET /api/asistencias?semana=&expedienteId=`, reutiliza `DiaHistorial`, bitácora en solo lectura), Reporte (`DescargarReporte`) y Auditoría (tabla con acciones en español y cambios `antes → después`)
- [x] Estados de carga, error con reintento y 403/404 con el mensaje de la API
- [x] Tabla del panel: el nombre del alumno enlaza al detalle; se quita el botón "Reporte" por fila de la 0029
- [x] Pruebas con MSW

## Fuera de alcance
- Acciones de la oficina sobre el expediente (RF-12, RF-22, edición del supervisor): tarea 0031.

## Decisiones
- La auditoría incluye las entidades `Expediente` (su propio id) y `SemanaBitacora` (semanas del expediente). `Asistencia` y `SolicitudCorreccion` no se auditan hoy; `User` queda fuera a propósito (RNF-07).
- Límite de 200 entradas, sin paginación; si hay más, `truncado: true` y la pantalla lo avisa.
- Las semanas se navegan con `?semana=` en la URL del detalle.
