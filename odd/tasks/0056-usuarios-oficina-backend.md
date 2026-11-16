# 0056 — Gestionar usuarios de vinculación (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | Mejora posterior al MVP |
| Specs | §4, RF-03, RF-04, RF-29, RN-03b, RNF-06 |
| Proyecto | backend |

## Descripción

Hasta ahora el administrador solo podía crear usuarios de vinculación (RN-03b). Esta tarea agrega las rutas para administrarlos después: listarlos, editar nombre y oficina, desactivar o reactivar la cuenta y restablecer su contraseña. Todas son exclusivas del rol ADMIN (specs §4, "Gestionar usuarios de vinculación") y operan solo sobre el personal (VINCULACION y ADMIN) del plantel del administrador.

- `GET /api/usuarios`: `{ usuarios: [{ id, nombre, email, rol, oficina, activo, debeCambiar, creadoEn }] }`. Personal del plantel, nunca alumnos; activos primero y luego por nombre. `oficina` es `null` para ADMIN y para vinculación con ambas oficinas. Sin hashes ni datos internos de autenticación.
- `PATCH /api/usuarios/:id`: cuerpo estricto con al menos uno de `nombre` (recortado, 1 a 150 como al crear), `oficina` (`PRACTICAS`, `SERVICIO_SOCIAL` o `null`) y `activo`. Responde `{ usuario }` con la misma forma que el GET.
  - Alumno, usuario de otro plantel o id inexistente: 404 sin revelar que existe.
  - `oficina` sobre un objetivo ADMIN: 400 `OFICINA_NO_APLICA`.
  - Desactivarse a sí mismo: 409 `NO_PUEDES_DESACTIVARTE`. Desactivar al último ADMIN activo del plantel: 409 `ULTIMO_ADMIN` (se bloquean las filas de los admins del plantel para que dos admins que se desactivan entre sí a la vez no dejen el plantel sin administrador).
  - Al desactivar se borran todas las sesiones del usuario en la misma transacción: queda fuera de inmediato. Reactivar está permitido.
  - `AuditLog` `EDITAR_USUARIO` con `antes` y `despues` solo de los campos que cambiaron; si no cambia nada, no se registra ni se tocan las sesiones.
- `POST /api/usuarios/:id/restablecer-contrasena`: genera la contraseña temporal con el mismo generador que el restablecimiento de alumnos (`generarPasswordTemporal`, RF-04), marca `debeCambiar`, borra las sesiones del objetivo, registra `RESTABLECER_CONTRASENA` sin la contraseña y responde `{ passwordTemporal }` una sola vez con `Cache-Control: no-store`. A sí mismo: 409 `USA_CAMBIAR_CONTRASENA` (el admin usa "Cambiar contraseña").

## Checklist

- [x] Pruebas primero (en rojo) y luego implementación
- [x] `GET`, `PATCH` y `POST restablecer-contrasena` con pruebas: caso feliz, 400, 401, 403 (VINCULACION y ALUMNO), 404 (alumno y otro plantel)
- [x] Desactivarse a sí mismo (409), último admin activo (409) y carrera de dos admins que se desactivan entre sí
- [x] Sesiones revocadas al desactivar y al restablecer; la cookie anterior da 401 en `/api/me` y el inicio de sesión falla (403 `CUENTA_INACTIVA`)
- [x] Auditoría con antes y después, sin contraseña
- [x] `pnpm test`, `pnpm typecheck` y `pnpm lint` en verde

## Fuera de alcance

- Cambiar el correo (es la identidad de inicio de sesión).
- Borrar usuarios: se desactivan, para conservar el rastro de auditoría.
- Pantalla del administrador (tarea 0057, frontend).

## Notas

- Cambiar la `oficina` cambia al instante lo que ese usuario ve (RN-03b): la oficina se lee del usuario en cada petición, así que no hace falta cerrar su sesión.
- Restablecer la contraseña de un usuario desactivado se permite: así queda lista cuando se reactive. Mientras siga desactivado, el inicio de sesión sigue dando 403.
- La prueba de "último admin activo" se hace llamando al servicio con un actor que no es admin activo, porque por la API el propio actor siempre cuenta como otro admin activo; el bloqueo real se cubre con la prueba de concurrencia.
- Las pruebas viven en `usuarios.gestion.test.ts`, junto a `usuarios.test.ts` (creación).
