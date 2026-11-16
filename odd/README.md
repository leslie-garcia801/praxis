# ODD — Organic Driven Development

Cada unidad de trabajo vive en `odd/tasks/` como un archivo Markdown con su descripción y un checklist que se va marcando conforme avanza.

## Convenciones

| Tema | Regla |
| --- | --- |
| Nombre | `NNNN-titulo-corto.md`, numerado en orden (`0001-andamiaje.md`) |
| Estado | `Pendiente` · `En progreso` · `Terminada` en la cabecera de la tarea |
| Alcance | Una tarea = un entregable verificable, dentro de una iteración de `docs/specs.md` (sección 14) |
| Trazabilidad | Cita los IDs que aplica (`RF-xx`, `RN-xx`, `RNF-xx`) |
| Terminada | Todo el checklist marcado, y `pnpm test` y `pnpm typecheck` pasan en el proyecto tocado |

## Plantilla

```markdown
# NNNN — Título de la tarea

| Campo | Valor |
| --- | --- |
| Estado | Pendiente |
| Iteración | N (specs §14) |
| Specs | RF-xx, RN-xx |
| Proyecto | backend / frontend / ambos |

## Descripción

Qué se construye y por qué, en uno o dos párrafos.

## Checklist

- [ ] Paso verificable
- [ ] Pruebas que nombran la regla (`it('RN-xx: ...')`)
- [ ] `pnpm test` y `pnpm typecheck` en verde

## Fuera de alcance

- Lo que explícitamente no entra en esta tarea.

## Notas

Decisiones tomadas y pendientes.
```

## Tareas

| # | Tarea | Estado |
| --- | --- | --- |
| 0001 | [Andamiaje del proyecto](tasks/0001-andamiaje.md) | Terminada |
| 0002 | [Dominio: cálculo de horas](tasks/0002-dominio-horas.md) | Terminada |
| 0003 | [Autenticación y usuarios por oficina](tasks/0003-autenticacion.md) | Terminada |
| 0004 | [Importación de alumnos](tasks/0004-importacion-alumnos.md) | Terminada |
| 0005 | [Pantallas de acceso](tasks/0005-pantallas-acceso.md) | Terminada |
| 0006 | [Pantalla de importación de alumnos](tasks/0006-importacion-alumnos-frontend.md) | Terminada |
| 0007 | [Pantalla para crear usuarios de vinculación](tasks/0007-usuarios-vinculacion-frontend.md) | Terminada |
| 0008 | [Catálogo de instituciones](tasks/0008-catalogo-instituciones.md) | Terminada |
| 0009 | [Importación de instituciones](tasks/0009-importacion-instituciones.md) | Terminada |
| 0010 | [QR imprimible por institución](tasks/0010-qr-imprimible.md) | Terminada |
| 0011 | [Pantallas de instituciones](tasks/0011-instituciones-frontend.md) | Terminada |
| 0012 | [Supervisores y completar expediente](tasks/0012-supervisores-completar-expediente.md) | Terminada |
| 0013 | [Acciones de vinculación sobre el expediente](tasks/0013-acciones-expediente.md) | Terminada |
| 0014 | [Registro de asistencia por escaneo](tasks/0014-escaneo-asistencia.md) | Terminada |
| 0015 | [Avance del expediente e historial semanal](tasks/0015-avance-historial.md) | Terminada |
| 0016 | [Pantalla de inicio del alumno](tasks/0016-inicio-alumno.md) | Terminada |
| 0017 | [Registrar asistencia: escáner QR y código corto](tasks/0017-escaner-registro.md) | Terminada |
| 0018 | [Completar expediente](tasks/0018-completar-expediente.md) | Terminada |
| 0019 | [Historial semanal del alumno](tasks/0019-historial-alumno.md) | Terminada |
| 0020 | [Semanas y bitácora](tasks/0020-semanas-bitacora.md) | Terminada |
| 0021 | [Mailer y validación por enlace](tasks/0021-validacion-enlace.md) | Terminada (prueba manual desde el lunes 16, con la 0024) |
| 0022 | [Resumen semanal al supervisor](tasks/0022-resumen-semanal.md) | Terminada |
| 0023 | [Bitácora del alumno y pendientes del inicio](tasks/0023-bitacora-alumno.md) | Terminada |
| 0024 | [Página de validación del supervisor](tasks/0024-validar-supervisor.md) | Terminada (prueba manual desde el lunes 16) |
| 0025 | [Tope diario de 6 h 30 min](tasks/0025-tope-diario.md) | Terminada |
| 0026 | [Panel de vinculación: tabla, alertas y "en riesgo" (backend)](tasks/0026-panel-backend.md) | Terminada |
| 0027 | [Panel de vinculación y layout de la oficina (frontend)](tasks/0027-panel-frontend.md) | Terminada |
| 0028 | [Exportaciones a Excel del panel](tasks/0028-exportaciones-excel.md) | Terminada |
| 0029 | [PDF de horas y actividades](tasks/0029-reporte-pdf.md) | Terminada |
| 0030 | [Detalle del alumno, solo lectura](tasks/0030-detalle-alumno.md) | Terminada |
| 0031 | [Acciones en el detalle del alumno (RF-12, RF-22, edición del supervisor)](tasks/0031-acciones-detalle.md) | Terminada |
| 0032 | [Debounce en la búsqueda de institución](tasks/0032-debounce-busqueda.md) | Terminada |
| 0033 | [HTTPS en el servidor de desarrollo](tasks/0033-https-desarrollo.md) | Terminada |
| 0034 | [Mostrar u ocultar la contraseña](tasks/0034-mostrar-contrasena.md) | Terminada |
| 0035 | [Cámara en negro en desarrollo (StrictMode)](tasks/0035-camara-negra-strictmode.md) | Terminada |
| 0036 | [Restablecer contraseña desde el detalle del alumno (RF-04)](tasks/0036-restablecer-contrasena.md) | Terminada |
| 0037 | [El alumno solicita la corrección de un turno (RF-17, backend)](tasks/0037-solicitar-correccion.md) | Terminada |
| 0038 | [Vinculación aprueba o rechaza correcciones (RF-17, backend)](tasks/0038-resolver-correccion.md) | Terminada |
| 0039 | [Solicitud de corrección en la app del alumno (RF-17, frontend)](tasks/0039-correccion-alumno.md) | Terminada |
| 0040 | [Correcciones pendientes en la app de vinculación (RF-17, frontend)](tasks/0040-correcciones-oficina.md) | Terminada |
| 0041 | [Prueba e2e del registro con código corto (RF-14, RF-15)](tasks/0041-e2e-escaneo.md) | Terminada |
| 0042 | [Cola de registros sin conexión (RF-16, frontend)](tasks/0042-cola-sin-conexion.md) | Terminada |
| 0043 | [Registro sin conexión en la app del alumno (RF-16, RN-14, frontend)](tasks/0043-registro-sin-conexion-app.md) | Terminada |
| 0044 | [Prueba e2e del registro sin conexión (RF-16, RN-14)](tasks/0044-e2e-sin-conexion.md) | Terminada |
| 0045 | [Suscripciones push (RF-28, backend)](tasks/0045-suscripciones-push.md) | Terminada |
| 0046 | [Trabajos de recordatorio (RF-28, backend)](tasks/0046-recordatorios.md) | Terminada |
| 0047 | [Recordatorios push en la app del alumno (RF-28, frontend)](tasks/0047-recordatorios-app.md) | Terminada |
| 0048 | [Despliegue y prueba manual de los recordatorios push (RF-28)](tasks/0048-despliegue-recordatorios.md) | En progreso |
| 0049 | [Jefa de cada oficina en la firma del PDF (RF-27, RF-29, RN-03b, backend)](tasks/0049-responsables-oficina.md) | Terminada |
| 0050 | [Pantalla "Firmas de las oficinas" (RF-27, RF-29, frontend)](tasks/0050-firmas-oficinas.md) | Terminada |
| 0051 | [Modo oscuro (RNF-01, RNF-09, frontend)](tasks/0051-modo-oscuro.md) | Terminada |
| 0052 | [Contraste de los bordes de los campos (RNF-09)](tasks/0052-contraste-bordes.md) | Terminada |
