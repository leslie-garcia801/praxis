# 0009 — Importación de instituciones (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 2 (specs §14) |
| Specs | F-02, RF-07, RF-29, RNF-06 |
| Proyecto | backend |

## Descripción

Vinculación carga el catálogo de unas 300 instituciones desde un Excel o CSV. La API valida el archivo y muestra los errores y los duplicados por fila antes de confirmar. Al confirmar, aplica los cambios en una transacción, y cada institución nueva nace con su token de QR (solo el hash) y su código corto, igual que en el alta manual (0008). Reutiliza la lectura de archivos y el formato de respuesta de la importación de alumnos (0004).

## Checklist

### Lectura y validación
- [x] Columnas de la plantilla: Nombre, RFC, Giro, Calle, Número exterior, Número interior, Colonia, Código postal, Municipio, Estado, Teléfono, Correo, Representante, Horario de atención, Turnos, Acepta servicio, Acepta prácticas, Cupo y Carreras
- [x] Esquema Zod por fila, con las mismas reglas que `POST /api/instituciones` (obligatorios: nombre, calle y municipio)
- [x] Listas en una celda (turnos y carreras) separadas por coma; carrera desconocida es error de fila
- [x] Duplicados dentro del archivo, por RFC o por nombre normalizado (sin mayúsculas, acentos ni espacios repetidos)
- [x] Duplicados contra el catálogo del plantel, por RFC o por nombre normalizado

### Rutas
- [x] `GET /api/importaciones/instituciones/plantilla` (plantilla `.xlsx`)
- [x] `POST /api/importaciones/instituciones/preview` (no escribe)
- [x] `POST /api/importaciones/instituciones/confirmar` (revalida y aplica en una transacción)
- [x] Token de QR y código corto para cada institución nueva, reutilizando `domain/qrInstitucion.ts`
- [x] Registro en `AuditLog` (RF-29)

### Pruebas
- [x] Caso feliz, validación inválida, 401 y 403 por ruta; RF en el nombre de las pruebas
- [x] Duplicados en el archivo y contra el catálogo
- [x] `pnpm test` y `pnpm typecheck` en verde

## Fuera de alcance

- Supervisores en la importación (RF-09): tarea aparte.
- QR imprimible (RF-13): tarea 0010.
- Pantalla de importación en el frontend.

## Notas

- Mismos límites que la 0004: 2 MB, 2000 filas, `.xlsx` o `.csv` detectado por contenido, sin guardar estado entre la vista previa y la confirmación.
- Fila que coincide con una institución del catálogo (mismo RFC o mismo nombre normalizado): se **salta** y no modifica nada; la vista previa la marca con `accion: 'OMITIR'` y dice con cuál coincide (decisión de vinculación, 2026-11-09).
- Fila repetida dentro del mismo archivo (mismo RFC o mismo nombre normalizado): error de fila, igual que la matrícula repetida en la 0004.

### Contrato de la API

Rutas bajo `/api/importaciones/instituciones`, solo `VINCULACION` y `ADMIN` (401 sin sesión, 403 para otros roles). Alcance: el plantel de quien sube el archivo. El cuerpo es el archivo crudo (`.xlsx` o `.csv`, detectado por contenido), igual que en la 0004. Los errores usan el formato estándar `{ error: { code, message, details? } }`.

- `GET /plantilla` devuelve `plantilla-instituciones.xlsx` con una sola fila de encabezados.
- `POST /preview` no escribe nada y responde 200 con el reporte.
- `POST /confirmar` revalida el archivo completo dentro de una transacción (todo o nada) y responde 201.

**Encabezados de la plantilla** (en este orden; se comparan sin mayúsculas, acentos ni espacios repetidos; las columnas extra se descartan): Nombre, RFC, Giro, Calle, Número exterior, Número interior, Colonia, Código postal, Municipio, Estado, Teléfono, Correo, Representante, Horario de atención, Turnos, Acepta servicio, Acepta prácticas, Cupo, Carreras.

**Reglas por celda** (las mismas de `POST /api/instituciones`, 0008):
- Obligatorios: Nombre, Calle y Municipio. Estado vacío = `Nuevo León`. RFC se guarda en mayúsculas; celda vacía = sin valor.
- Turnos y Carreras: listas separadas por coma. Turnos acepta Matutino y Vespertino; carrera o turno desconocido es error de fila (campos `turnos` y `carreras`).
- Acepta servicio / Acepta prácticas: `Sí` o `No` sin importar mayúsculas ni acentos; vacío = `Sí`. Otro valor es error.
- Cupo: entero >= 0 o vacío (sin dato). Correo debe ser válido.
- Cada institución nueva queda activa, `esPlantel: false`, con su propio hash de token de QR y su código corto.

**Vista previa** (`POST /preview`):

```json
{
  "resumen": { "total": 3, "validas": 2, "conErrores": 1, "crear": 1, "omitir": 1 },
  "filas": [
    { "fila": 2, "nombre": "...", "accion": "CREAR", "coincideCon": null, "errores": [] },
    {
      "fila": 3, "nombre": "...", "accion": "OMITIR",
      "coincideCon": { "id": "uuid", "nombre": "Nombre en el catálogo", "por": "RFC" },
      "errores": []
    },
    { "fila": 4, "nombre": "...", "accion": null, "coincideCon": null, "errores": [{ "campo": "calle", "mensaje": "..." }] }
  ]
}
```

- `fila` es el número de fila de la hoja (el encabezado es la fila 1). Las filas totalmente vacías se ignoran.
- `por` es `RFC` o `NOMBRE` (RFC primero; el nombre se compara sin mayúsculas, acentos ni espacios repetidos).
- Una fila `OMITIR` no se modifica ni bloquea la confirmación; cuenta como válida.
- Una fila repetida dentro del archivo (mismo RFC o mismo nombre normalizado que una fila anterior) es error de fila en `rfc` o `nombre`; la primera aparición sigue siendo válida.

**Confirmación** (`POST /confirmar`): `201 { "resumen": { "creados": n, "omitidos": n } }`. Registra en `AuditLog` la acción `IMPORTAR_INSTITUCIONES` (entidad `Importacion`) con `{ creados, omitidos, instituciones: [{ id, nombre }] }`; nunca guarda hash de QR, RFC ni datos de contacto.

**Errores**:
- 400 `ARCHIVO_INVALIDO`: cuerpo vacío, archivo ilegible o sin filas.
- 400 `COLUMNAS_FALTANTES`: `details.columnas` lista los encabezados que faltan.
- 400 `ARCHIVO_DEMASIADO_GRANDE`: más de 2000 filas. Un cuerpo de más de 2 MB responde 413.
- 422 `IMPORTACION_CON_ERRORES` (solo en confirmar): `details` trae el mismo reporte de la vista previa y no se crea nada.
- 409 `IMPORTACION_CONFLICTO`: otro proceso creó el mismo RFC entre la validación y la escritura. Si el código corto o el hash de QR chocan con otro existente, se vuelven a generar (hasta 5 intentos) antes de escribir.

Archivo de prueba manual: `instituciones-prueba-0009.csv` (3 filas nuevas y 1 que coincide por RFC con "Taller Mecánico El Pistón").
