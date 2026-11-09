# 0004 — Importación de alumnos con tipo asignado (backend)

| Campo | Valor |
| --- | --- |
| Estado | Completada |
| Iteración | 1 (specs §14) |
| Specs | F-02, RF-01, RN-01, RN-02, RN-03, RN-03a, RN-03b, RF-29, RNF-07 |
| Proyecto | backend |

## Descripción

Vinculación sube un Excel o CSV con los alumnos y el tipo de programa asignado. La API valida el archivo y muestra los errores por fila antes de confirmar; al confirmar, crea o actualiza a cada alumno (sin duplicar matrículas) y le abre un expediente `PENDIENTE` del tipo asignado, listo para que active su cuenta (RF-02).

## Checklist

### Preparación
- [x] Instalar SheetJS (`xlsx` 0.20.3) desde el CDN oficial (`cdn.sheetjs.com`); el paquete de npm está abandonado en 0.18.5 con vulnerabilidades conocidas
- [x] Catálogo de carreras en el seed: Programación, Inteligencia Artificial, Ciberseguridad, Logística, Contabilidad, Hospedaje, Alimentos y Bebidas, Mecánica Industrial
- [x] Definir qué pasa con una matrícula que ya tiene expediente activo

### Lectura y validación
- [x] Leer `.xlsx` y `.csv` a filas con encabezados normalizados
- [x] Esquema Zod por fila: matrícula de 14 dígitos, nombre, apellidos, carrera, semestre, grupo, turno, tipo
- [x] Errores por fila: matrícula repetida en el archivo, carrera desconocida, semestre inválido (RN-01)
- [x] Filas de un tipo fuera de la oficina del usuario de vinculación (RN-03b)

### Rutas
- [x] `GET /api/importaciones/alumnos/plantilla` (plantilla `.xlsx`)
- [x] `POST /api/importaciones/alumnos/preview` (no escribe)
- [x] `POST /api/importaciones/alumnos/confirmar` (revalida y aplica en una transacción)
- [x] Crear usuario sin contraseña con correo `.invalid` y expediente `PENDIENTE` con meta 480/240 (RN-02)
- [x] Matrícula existente: actualizar sin duplicar (RF-01)
- [x] Registro en `AuditLog` (RF-29)

### Pruebas
- [x] Caso feliz, validación inválida, 401 y 403 por ruta; RN en el nombre de las pruebas

## Fuera de alcance

- Acción "Asignar siguiente programa" al pasar a 6.º semestre (RN-03a): tarea aparte.
- Pantalla de importación en el frontend: tarea aparte.

## Notas

- El archivo se recibe con `express.raw()` (límite 2 MB), sin `multer`, para no sumar dependencias.
- La confirmación vuelve a recibir y validar el archivo: no se guarda estado entre la vista previa y la confirmación.
- Los nombres de columna de Edumedia siguen sin confirmar (specs §13, pregunta 2b).
- Matrícula con expediente activo (PENDIENTE/EN_PROCESO/SUSPENDIDO): del mismo tipo se actualizan los datos del alumno y el expediente no se toca; de otro tipo es error de fila (RN-03). Sin expediente activo se actualizan los datos y se crea un expediente `PENDIENTE` nuevo. Matrícula de otro plantel o de una cuenta que no es alumno: error de fila.
- Contrato (roles VINCULACION y ADMIN, limitado al plantel de quien sube):
  - `GET /api/importaciones/alumnos/plantilla` devuelve `plantilla-alumnos.xlsx` con solo la fila de encabezados: Número de control, Nombre, Apellido paterno, Apellido materno, Carrera, Semestre, Grupo, Turno, Tipo.
  - `POST .../preview` y `POST .../confirmar`: cuerpo crudo del archivo (xlsx o csv con `,` o `;`, formato detectado por contenido). Máx. 2 MB: 413 `PAYLOAD_TOO_LARGE`. Máx. 2000 filas: 400 `ARCHIVO_DEMASIADO_GRANDE`. Otros errores: 400 `ARCHIVO_INVALIDO` o `COLUMNAS_FALTANTES` (`details.columnas`).
  - preview 200 y `details` del 422 `IMPORTACION_CON_ERRORES`: `{ resumen: { total, validas, conErrores, crear, actualizar }, filas: [{ fila, matricula, accion: 'CREAR'|'ACTUALIZAR'|null, errores: [{ campo, mensaje }] }] }`. `fila` es el número de fila de la hoja (el encabezado es la fila 1).
  - confirmar 201: `{ resumen: { creados, actualizados, expedientesCreados } }`. Todo o nada, en una transacción; 409 `IMPORTACION_CONFLICTO` si otra importación creó la misma matrícula en paralelo.
- Los alumnos nuevos se crean sin cuenta de credenciales (correo `<matrícula>@alumno.praxis.invalid`) y activan con RF-02. La auditoría (`IMPORTAR_ALUMNOS`) guarda solo matrículas y contadores.
- Un archivo sin filas de alumnos responde 400 `ARCHIVO_INVALIDO`. `errorHandler` ahora responde 413 cuando un body supera el límite.
