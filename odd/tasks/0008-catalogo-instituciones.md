# 0008 — Catálogo de instituciones (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 2 (specs §14) |
| Specs | F-03, RF-05, RF-06, RF-08, RF-13, RF-15, RF-29, RNF-06 |
| Proyecto | backend |

## Descripción

Vinculación da de alta y edita las instituciones del catálogo compartido del plantel, y puede marcarlas como inactivas o sin cupo. Alumnos y vinculación consultan el catálogo con filtros. Cada institución nace con un token de QR aleatorio (se guarda solo su hash) y un código corto de 6 caracteres para registrarse sin cámara, porque el esquema los exige y son únicos.

## Checklist

### Dominio
- [x] Generar el token de QR con `crypto.randomBytes` y guardar su hash SHA-256 (RNF-06)
- [x] Generar el código corto de 6 caracteres con un alfabeto sin caracteres ambiguos (RF-15)
- [x] Reintentar si hay colisión en `codigoCorto` o en `qrTokenHash`

### Rutas
- [x] `GET /api/instituciones` con filtros `q` (nombre o giro), `municipio`, `colonia`, `carrera`, `turno`, `tipo` y `conCupo` (RF-06)
- [x] `GET /api/instituciones/:id` (RF-05)
- [x] `POST /api/instituciones` (alta con token y código corto) (RF-08)
- [x] `PATCH /api/instituciones/:id` (edición, `activa` y `cupo`) (RF-08)
- [x] Limitar todo al plantel del usuario; el alumno solo ve instituciones activas
- [x] La respuesta nunca incluye `qrTokenHash`
- [x] Registro en `AuditLog` del alta y de cada edición, con valor anterior y nuevo (RF-29)

### Pruebas
- [x] Caso feliz, validación inválida, 401 y 403 por ruta; RF y RN en el nombre de las pruebas
- [x] RFC repetido en el mismo plantel responde 409
- [x] `pnpm test` y `pnpm typecheck` en verde

## Fuera de alcance

- Supervisores (RF-09): tarea aparte, junto con el expediente (RF-10).
- Importación de instituciones (RF-07): tarea 0009.
- Regenerar el QR y el PDF imprimible (RF-13): tarea 0010.
- Pantallas del frontend.

## Notas

- Roles (specs §4): ver el catálogo, alumno, vinculación y admin; crear y editar, vinculación y admin. El catálogo es compartido entre las dos oficinas (RN-03b).
- Como solo se guarda el hash, el token del alta no se devuelve ni se puede recuperar. El primer QR imprimible se obtiene al regenerarlo en la 0010.
- `conCupo=true` devuelve solo instituciones con `cupo > 0`; las de `cupo` `null` (sin dato) quedan fuera (decisión de vinculación, 2026-11-09).
- `qrTokenHash` nunca sale en una respuesta. `codigoCorto` solo lo ven vinculación y admin (el alumno no, porque con el código se podría registrar sin estar en la institución). El token del alta no se devuelve.
- Contrato (`/api/instituciones`; todo limitado al plantel de quien consulta; una institución de otro plantel responde 404):
  - Lectura: `ALUMNO`, `VINCULACION`, `ADMIN`. El alumno solo ve instituciones `activa = true`: en la lista no aparecen y en el detalle responde 404 `NOT_FOUND`. Escritura: `VINCULACION` y `ADMIN`. Sin sesión 401 `UNAUTHORIZED`; rol sin permiso 403 `FORBIDDEN`.
  - `GET /api/instituciones` devuelve `{ instituciones: [...] }` ordenada por nombre, sin paginar. Filtros (todos opcionales, valor inválido responde 400 `VALIDATION_ERROR`): `q` (contiene, en nombre o giro), `municipio` y `colonia` (igualdad), los tres sin distinguir mayúsculas ni acentos; `carrera` (id de carrera, uuid); `turno` (`MATUTINO`|`VESPERTINO`, instituciones que lo incluyen); `tipo` (`SERVICIO` o `SERVICIO_SOCIAL` filtra `aceptaServicio`; `PRACTICAS` filtra `aceptaPracticas`); `conCupo=true` (solo `cupo > 0`, el `cupo` nulo queda fuera; `false` no filtra).
  - `GET /api/instituciones/:id` devuelve `{ institucion }`. `:id` que no es uuid: 400.
  - `POST /api/instituciones` responde 201 `{ institucion }`. Obligatorios: `nombre`, `calle`, `municipio`. Opcionales: `rfc` (se guarda en mayúsculas), `giro`, `numExterior`, `numInterior`, `colonia`, `codigoPostal`, `telefono`, `correo`, `representante`, `horarioAtencion`, `cupo` (entero >= 0 o null), `estado` (por defecto `Nuevo León`), `esPlantel` (false), `turnos` (`[]`), `aceptaServicio` y `aceptaPracticas` (true), `activa` (true), `carreraIds` (uuids, `[]`). Un texto vacío se guarda como null.
  - `PATCH /api/instituciones/:id` responde 200 `{ institucion }`. Mismos campos, todos opcionales y al menos uno; los opcionales se limpian con `null`; `carreraIds` reemplaza el conjunto completo. No toca el QR ni el código corto.
  - Forma de `institucion`: `{ id, nombre, rfc, giro, calle, numExterior, numInterior, colonia, codigoPostal, municipio, estado, esPlantel, telefono, correo, representante, horarioAtencion, turnos, aceptaServicio, aceptaPracticas, cupo, activa, carreras: [{ id, nombre }], actualizadoEn, codigoCorto (solo vinculación y admin) }`.
  - Errores: 409 `RFC_DUPLICADO` (mismo RFC en el mismo plantel, en alta y en edición); 400 `CARRERAS_INVALIDAS` (alguna carrera no existe); 400 `VALIDATION_ERROR` (con `details`).
- Auditoría (`AuditLog`, entidad `Institucion`): `CREAR_INSTITUCION` guarda los valores nuevos (con `carreraIds` y `plantelId`, sin hash) y `EDITAR_INSTITUCION` guarda solo los campos que cambiaron, con `antes` y `despues`. Una edición sin cambios reales no escribe auditoría.
- Colisión de `codigoCorto` o `qrTokenHash`: hasta 5 intentos con credenciales nuevas; después responde 500.
- No hay endpoint de carreras todavía; el frontend necesitará uno (o que la lista de instituciones lo derive) para filtrar por `carrera` y elegir `carreraIds`.
