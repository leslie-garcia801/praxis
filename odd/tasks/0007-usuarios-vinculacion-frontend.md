# 0007 — Pantalla para crear usuarios de vinculación (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 1 (specs §14: "usuarios por oficina") |
| Specs | Matriz de permisos ("Gestionar usuarios de vinculación", solo Administrador), RN-03b, RF-04 |
| Proyecto | frontend |

## Descripción

Pantalla para que el administrador cree usuarios de vinculación con su oficina (Prácticas, Servicio Social o ambas) y vea una sola vez la contraseña temporal. Consume `POST /api/usuarios` (tarea 0003).

## Checklist

- [x] Ruta `/vinculacion/usuarios/nuevo` bajo `RequireRole(['ADMIN'])`
- [x] Enlace "Crear usuario de vinculación" en el panel, visible solo para ADMIN
- [x] Formulario (React Hook Form + Zod): nombre, correo, oficina (Prácticas / Servicio Social / Ambas oficinas, sin valor por defecto)
- [x] Resultado: contraseña temporal mostrada una sola vez con "Copiar", aviso de cambio obligatorio (RF-04) y "Crear otro usuario"; no se guarda en caché ni en almacenamiento del navegador
- [x] Errores: 409 `CORREO_EN_USO` en el campo correo; el resto en alerta con el `message` de la API
- [x] Pruebas Vitest + RTL + MSW: caso feliz, validación, 409, vinculación sin acceso, `RN-03b` ("Ambas" envía `oficina: null`)
- [x] `pnpm test`, `pnpm typecheck` y `pnpm lint` en verde

## Fuera de alcance

- Listar, editar y desactivar usuarios (no hay rutas en el backend).
- Restablecer contraseñas de alumnos (RF-04, detalle del alumno, iteración 5).

## Notas

- Hueco en las specs: la matriz de permisos dice "Gestionar usuarios de vinculación" (solo Administrador) y §14 incluye "usuarios por oficina" en la iteración 1, pero §10 no lista una pantalla de usuarios. Decisión del usuario (2026-11-08): hacer una pantalla mínima de alta en la iteración 1; la gestión completa queda pendiente de definir.
- Probada a mano el 2026-11-09 contra el backend local: alta con contraseña temporal, correo repetido y acceso por rol.
- Se agregó un enlace "Volver al panel" que no estaba en el plan.
