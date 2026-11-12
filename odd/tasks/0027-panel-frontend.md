# 0027 — Panel de vinculación y layout de la oficina (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (specs §14) |
| Specs | RF-23, RF-24, RN-03b, RN-06a, RN-11, RN-15, RN-18, RNF-01, RNF-09, specs §10 (Vinculación, pantalla 1) |
| Proyecto | frontend |

## Descripción

Reemplaza el marcador de `/vinculacion` por el panel de la oficina: tarjetas de alertas (RF-24), filtros y la tabla de alumnos (RF-23) con su avance y estado de riesgo (RN-06a). Agrega un layout común para las pantallas de vinculación con menú de navegación, en lugar del "Volver al panel" de cada pantalla. Consume `GET /api/panel/alumnos` (tarea 0026, ver "Contrato de la API"). Pensado para escritorio (vinculación trabaja en computadora), pero usable en celular.

## Checklist

### Layout de vinculación
- [x] `VinculacionLayout` como ruta de layout bajo `RequireRole [VINCULACION, ADMIN]`: encabezado con el nombre de la app, menú (**Panel**, **Instituciones**, **Importar alumnos**, **Importar instituciones** y, solo para admin, **Usuarios**), indicador de la oficina del usuario ("Prácticas", "Servicio social" o "Ambas oficinas") y "Cerrar sesión"
- [x] El enlace activo se marca (`aria-current="page"`); en celular el menú se pliega
- [x] Las pantallas existentes de vinculación (instituciones, importaciones, usuarios) pasan a vivir dentro del layout; se quita su "Volver al panel" duplicado. Sus pruebas siguen pasando

### Panel `/vinculacion`
- [x] `features/panel/api.ts`: `usePanelAlumnos(filtros)` con `keepPreviousData`
- [x] **Alertas** (arriba): cuatro tarjetas con el total — "Sin registros en 7 días", "Semanas sin validar (más de 7 días)", "Turnos incompletos", "Supervisores por confirmar". Las tres primeras, al tocarlas, filtran la tabla a esos expedientes (filtro local por `expedienteIds`, con un aviso "Mostrando: …" y "Quitar"). La de supervisores despliega la lista (nombre e institución)
- [x] **Filtros** en la URL (`?estado=&carreraId=&semestre=&grupo=&turno=&institucionId=&tipo=&riesgo=`), para poder compartir el enlace y volver con el botón del navegador: estado (por defecto "En proceso y suspendidos"; opción "Todos"), carrera (`useCarreras`), semestre, grupo, turno, institución (`useInstituciones`), tipo (solo si el usuario ve ambas oficinas) y la casilla "Solo en riesgo". Botón "Limpiar filtros"
- [x] **Tabla**: alumno (nombre y matrícula), carrera/semestre/grupo, institución, horas validadas / meta con barra de porcentaje, horas registradas sin validar, último registro (fecha y hora de Monterrey, o "Sin registros"), semanas pendientes, fecha estimada (o "Sin datos suficientes") y estado de riesgo con etiqueta: **En riesgo** (destacada, con el límite: "Límite: 1 de mayo"), En tiempo, Sin datos, No evaluable, Completado
- [x] Contador "N alumnos" y estado vacío ("No hay alumnos con estos filtros")
- [x] Carga, error con "Reintentar"; un 403 por `tipo` fuera del alcance muestra el mensaje de la API
- [x] La fila no enlaza todavía: el detalle del alumno es la tarea 0030 (se deja preparado el lugar)

### Pruebas (Vitest + RTL + MSW)
- [x] Layout: menú con el enlace activo, enlace de Usuarios solo para admin, indicador de oficina, cerrar sesión; las pantallas existentes se ven dentro del layout
- [x] Panel: muestra filas, alertas y contador; `RN-06a: destaca a los alumnos en riesgo con su límite`
- [x] Filtros: cambian la URL y la consulta; abrir `/vinculacion?riesgo=EN_RIESGO` manda ese filtro; "Limpiar filtros"
- [x] Tocar una alerta filtra la tabla a sus expedientes y "Quitar" lo deshace; la lista de supervisores se despliega
- [x] Tipo visible solo con ambas oficinas; estados vacío, cargando, error y 403
- [x] `RN-15`: último registro en hora de Monterrey

## Fuera de alcance
- Exportaciones a Excel (0028), PDF (0029), detalle del alumno y validación en nombre del supervisor (0030).
- Correcciones pendientes (specs §10, pantalla 5): con RF-17.

## Notas

### Decisiones técnicas
- Los filtros van en la URL (como el historial del alumno, 0019) y no en estado local (como el catálogo de instituciones, 0011), porque vinculación comparte y vuelve a vistas filtradas.
- El filtro por alerta es local (sobre las filas ya cargadas) porque el backend ya devuelve los `expedienteIds`; no hace falta otro parámetro en la API.
- El filtro por alerta vive en el parámetro `alerta` de la URL (`sinRegistros`, `semanasSinValidar`, `turnosIncompletos`); no se envía a la API. Tocar de nuevo la tarjeta activa o "Quitar" lo elimina; "Limpiar filtros" borra todo.
- El grupo (texto libre) se aplica con Enter o al salir del campo, para no consultar en cada tecla. Semestre ofrece 1 a 6.
- Una tarjeta de alerta con total 0 queda deshabilitada (salvo que ya esté activa por la URL).
- El enlace "Usuarios" del menú (solo admin) sustituye a `AdminLink`, que se eliminó. Los marcadores `main` de las pantallas existentes se conservan; solo se quitó su "Volver al panel".
- "Fecha estimada" nula muestra "Sin datos suficientes", salvo en COMPLETADO ("—").
- La columna "Registradas sin validar" muestra `minutosRegistrados` tal cual lo devuelve la API.

### Prueba manual
1. `docker compose up -d`, backend (`pnpm dev`) y frontend (`pnpm dev`); iniciar sesión como vinculación (correo) y como admin.
2. `/vinculacion`: menú con Panel activo, indicador de oficina y "Cerrar sesión"; solo el admin ve "Usuarios". Navegar a Instituciones e Importar y confirmar que el menú persiste y no hay "Volver al panel".
3. Alertas: tocar una tarjeta filtra la tabla con "Mostrando: … · Quitar"; "Supervisores por confirmar" despliega la lista.
4. Filtros: cambiar estado/carrera/semestre/grupo/turno/institución y "Solo en riesgo"; la URL cambia, recargar y el botón Atrás conservan la vista; "Limpiar filtros" la restablece. `tipo` solo con ambas oficinas (o admin); con `?tipo=` fuera de alcance aparece el mensaje de la API.
5. Verificar que un alumno en riesgo muestra "En riesgo" y su límite, y que el último registro se ve en hora de Monterrey.
6. En celular (360 px): el menú se pliega con el botón "Menú" y la tabla se desplaza horizontalmente.
