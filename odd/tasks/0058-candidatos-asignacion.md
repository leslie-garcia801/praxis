# 0058 — Candidatos al siguiente programa y auditoría del cambio de supervisor (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | Mejora posterior al MVP |
| Specs | RF-01, RF-12, RF-29, RN-03, RN-03a, RN-03b, RNF-07 |
| Proyecto | backend |

## Descripción

El siguiente programa lo asigna la oficina que lo administra (por ejemplo, Prácticas asigna prácticas a quien terminó servicio social), pero por RN-03b esa oficina no ve los expedientes de la otra y no puede saber quién es elegible. `POST /api/expedientes/asignar` ya existe y aplica las reglas; esta tarea agrega la lista de candidatos.

- `GET /api/expedientes/candidatos` (VINCULACION y ADMIN): `{ candidatos: [{ alumnoId, nombre, matricula, carrera, semestre, grupo, turno, programaTerminado, terminadoEn, tipoAsignable }] }`, ordenado por apellido paterno, apellido materno y nombre. Solo alumnos del plantel del usuario para los que `decidirAsignacion` (la misma función que usa `asignar`) devuelve un tipo dentro del `alcanceOficina` del usuario. Sin datos de contacto ni CURP (RNF-07). La ruta se registra antes de `/:id`.
- Eficiencia: una consulta trae a los alumnos de 6.º semestre o superior con al menos un expediente `FINALIZADO` y ninguno activo, con sus expedientes; la regla se aplica en memoria. Una segunda consulta (`groupBy`) obtiene la última asistencia de cada expediente terminado.
- `terminadoEn` (día calendario `AAAA-MM-DD`, zona America/Monterrey): nada guarda cuándo un expediente pasó a `FINALIZADO` (no hay columna de fecha ni entrada de auditoría para ese cambio). Se usa la última asistencia (`salida`, o `entrada` si no hay salida) del expediente terminado; si no tiene asistencias, su `fechaTermino`; si tampoco, `null`.
- Auditoría del cambio de supervisor (RF-29): `editarExpediente` ya registraba `EDITAR_EXPEDIENTE` con `antes` y `despues` solo de los campos que cambiaron, dentro de la misma transacción. No se cambió código; se agregaron pruebas del cambio de supervisor por la oficina en un expediente EN_PROCESO, del supervisor inactivo, del supervisor de otra institución y de FINALIZADO/CANCELADO no editables.

## Checklist

- [x] Pruebas primero (en rojo) y luego implementación
- [x] `GET /candidatos`: caso feliz por oficina y para ADMIN, exclusiones (primer programa sin terminar, expediente activo, ambos terminados, 5.º semestre, otro plantel), 401, 403, orden de rutas
- [x] Auditoría del cambio de supervisor y validaciones del nuevo supervisor
- [x] `pnpm test`, `pnpm typecheck` y `pnpm lint` en verde

## Fuera de alcance

- Pantalla de candidatos (tarea 0059, frontend).
- Asignar el primer programa (importación, RF-01).
- Filtros opcionales de la lista.

## Notas

- Pendiente: agregar `GET /api/expedientes/candidatos` a la tabla de rutas de `docs/specs.md` (§9); esta tarea no modifica las specs.
- Las pruebas de candidatos viven en `expedientes.candidatos.test.ts`; las del supervisor, en `expedientes.test.ts`.
