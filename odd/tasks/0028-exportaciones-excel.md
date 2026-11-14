# 0028 — Exportaciones a Excel del panel (backend + frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (specs §14) |
| Specs | RF-26, RN-03b, RN-15, RNF-07, specs §9 |
| Proyecto | backend y frontend |

## Descripción

Dos descargas desde el panel (RF-26): la **tabla filtrada** para los informes a dirección y la exportación **"para Edumedia"** con los datos que hoy quedan vacíos en los formatos. Ambas respetan la oficina del usuario (RN-03b) y los mismos filtros del panel, y reutilizan la consulta de la tarea 0026, así que las horas son las mismas que se ven en pantalla. No se exporta CURP, edad, sexo ni ningún dato que la app no guarda (RNF-07).

## Checklist

### Backend
- [x] Mover `construirXlsx` a `src/lib/xlsx.ts` (lo usan importaciones y panel) y permitir celdas numéricas y anchos de columna; el número de control siempre como texto (14 dígitos exactos)
- [x] `GET /api/panel/alumnos.xlsx` (`VINCULACION`, `ADMIN`; mismos filtros y validación que `GET /api/panel/alumnos`; el filtro local de alerta del frontend no se envía). Hoja "Alumnos" con columnas: Número de control, Alumno, Carrera, Semestre, Grupo, Turno, Programa, Estado, Institución, Horas validadas, Meta (h), Porcentaje, Horas registradas sin validar, Último registro (fecha y hora de Monterrey), Semanas pendientes, Fecha estimada, Riesgo, Límite. Horas como número con un decimal
- [x] `GET /api/panel/edumedia.xlsx` (mismos roles y filtros). Columnas en Notas; la fecha de término de servicio social se calcula con la misma función del límite de la 0026 (prueba que lo compruebe)
- [x] Nombre de archivo con la fecha: `alumnos-2026-11-12.xlsx`, `edumedia-2026-11-12.xlsx`; `Content-Disposition: attachment` y `Cache-Control: no-store`
- [x] Pruebas: cabeceras y filas (leyendo el archivo generado), filtros aplicados, `RN-03b` (otra oficina no aparece), número de control como texto, 401, 403 (alumno y `tipo` fuera del alcance), 400

### Frontend
- [x] En el panel, botones **Exportar tabla** y **Exportar para Edumedia** que descargan con los filtros activos de la URL (`downloadFile`). Mientras descarga: botón deshabilitado con "Descargando…"; error con el mensaje de la API
- [x] Si hay un filtro de alerta activo (local), se avisa que la exportación usa los filtros de la tabla pero no el de la alerta
- [x] Pruebas: la URL de descarga lleva los filtros; estados de descarga y error

## Fuera de alcance
- PDF de horas y actividades (0029).
- Integración automática con Edumedia (fuera del alcance del proyecto, specs §3).

## Notas

### Columnas de Edumedia (confirmadas por la usuaria, 2026-11-12)
Número de control, Nombre(s), Apellido paterno, Apellido materno, Carrera, Semestre, Grupo, Programa (Servicio social / Prácticas), Institución, RFC de la institución, Departamento o área, Fecha de inicio, Fecha de término (prácticas: la del expediente; **servicio social: fecha de inicio + 6 meses**, el mismo límite del "en riesgo" (`limiteExpediente` / `MESES_SERVICIO_SOCIAL` de la 0026), vacía si no hay fecha de inicio), Días pactados (por ejemplo "Lunes a viernes" o "Lun, Mié, Vie"), Hora de entrada, Hora de salida, Programa y subprograma (servicio social), Supervisor (título y nombre completo), Puesto del supervisor, Correo del supervisor, Teléfono y extensión del supervisor.

### Prueba manual
1. Entrar como vinculación de servicio social, abrir el panel y aplicar un filtro (por ejemplo semestre o "Solo en riesgo").
2. Tocar **Exportar tabla**: se descarga `alumnos-AAAA-MM-DD.xlsx` con la hoja "Alumnos"; las horas coinciden con la pantalla y el número de control queda como texto de 14 dígitos.
3. Tocar **Exportar para Edumedia**: se descarga `edumedia-AAAA-MM-DD.xlsx`; en servicio social la fecha de término es inicio + 6 meses y los datos del supervisor aparecen completos.
4. Activar una tarjeta de alerta: aparece el aviso de que la exportación no usa ese filtro.
5. Con otra oficina o como admin con `tipo` distinto, comprobar que solo salen los expedientes del alcance.
