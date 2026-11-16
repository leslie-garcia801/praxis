# 0057 — Pantalla de usuarios de oficina (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | Mejora posterior al MVP |
| Specs | §4, RF-04, RF-29, RN-03b |
| Proyecto | frontend |

## Descripción

Pantalla del administrador para gestionar el personal de oficina con las rutas de la tarea 0056. Ruta `/vinculacion/usuarios` (solo ADMIN); el enlace "Usuarios" del menú apunta ahora aquí, y la pantalla de crear usuario (`/vinculacion/usuarios/nuevo`) enlaza de vuelta a la lista.

- **Lista**: nombre (con "(tú)" en la fila del propio administrador), correo, rol, oficina ("Ambas oficinas" para vinculación sin oficina, "—" para el administrador) y estado ("Activo" / "Desactivado" y "Debe cambiar contraseña"). Tabla en escritorio y tarjetas en celular. Estados de carga, error con reintento, vacío y con datos.
- **Editar**: nombre y, solo para vinculación, la oficina (las dos oficinas o "Ambas oficinas", que se envía como `null`). El esquema Zod del cliente repite los límites del servidor.
- **Desactivar / Reactivar**: confirmación que explica el efecto ("No podrá iniciar sesión y se cerrarán sus sesiones abiertas."). Muestra los errores 409 del servidor (por ejemplo `ULTIMO_ADMIN`). No aparece para el propio administrador.
- **Restablecer contraseña**: confirmación y luego la contraseña temporal una sola vez, con botón de copiar. Cerrar el diálogo la descarta (no queda en el caché de consultas ni en el estado). No aparece para el propio administrador.

## Checklist

- [x] Pruebas primero (en rojo) y luego implementación
- [x] Estados, filas con etiquetas de oficina, "(tú)" e insignias
- [x] Editar (cuerpo del PATCH, oficina solo para vinculación, validación), desactivar, reactivar y error 409
- [x] Acciones ocultas para el propio administrador
- [x] Restablecer: contraseña una sola vez, copiar y descartar al cerrar
- [x] Ruta solo ADMIN y enlace del menú hacia la lista
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` en verde

## Fuera de alcance

- Cambiar el correo (es la identidad de inicio de sesión).
- Borrar usuarios: se desactivan, para conservar el rastro de auditoría.

## Notas

- Tras editar o cambiar el estado, la fila se reemplaza con la respuesta del servidor; la lista no se reordena hasta recargarla.
- La contraseña propia se cambia desde "Cambiar contraseña", no desde esta pantalla.
