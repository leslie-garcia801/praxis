# 0055 — Actualizar flujo de la app y estado del README

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 7 (specs §14) |
| Specs | RF-10, RF-12, RF-16, RF-17, RF-24, RF-26, RF-27, RF-28, RN-14 |
| Proyecto | documentación |

## Descripción

`docs/flujo-app.md` quedó en la tarea 0027 y la tabla "Estado" del `README.md` seguía mostrando iteraciones como pendientes. Se actualizan para describir la app tal como está hoy; los nombres de rutas, menús y botones salen de `frontend/src/router.tsx` y de `frontend/src/features/`.

## Checklist

- [x] `docs/flujo-app.md`: mapa de rutas con Correcciones y Firmas de las oficinas, y la ruta "Página no encontrada"
- [x] Menús de oficina y administrador (Correcciones, Usuarios, Firmas de las oficinas) y selector Tema
- [x] Panel: Alumnos por confirmar, Supervisores por confirmar desplegable, Exportar tabla y Exportar para Edumedia
- [x] Detalle del alumno con Confirmar, suspender, reactivar, cancelar, transferir, validar en nombre del supervisor y restablecer contraseña
- [x] Pantalla de correcciones pendientes de la oficina y Solicitar corrección del alumno (solo semanas BORRADOR o RECHAZADA)
- [x] Registrar asistencia con la cola sin conexión (pendientes, rechazados, Descartar, 72 h)
- [x] Mi avance: Recordatorios, aviso de salida olvidada
- [x] Tareas programadas y sección "Huecos conocidos" reescrita
- [x] `README.md`: tabla "Estado" por iteración, fila de mejoras posteriores y nota de registro sin conexión
- [x] Fila 0055 en `odd/README.md`

## Fuera de alcance

- Cambios de código o de `docs/specs.md`.
- Ejecutar el piloto y probar en celulares reales.

## Notas

- Pendientes que la documentación ya lista: texto definitivo del aviso de privacidad (§13 #7), pruebas en celulares reales y ejecutar el piloto.
