# 0048 — Despliegue y prueba manual de los recordatorios push

| Campo | Valor |
| --- | --- |
| Estado | En progreso (falta configurar Railway y probar en celulares reales) |
| Iteración | 6 |
| Specs | RF-28, RNF-02 |
| Proyecto | ambos (documentación y operación) |

## Descripción

Deja listo lo que el código de las tareas 0045–0047 necesita fuera del repositorio: las claves VAPID, los dos servicios cron de Railway y la prueba en un iPhone y un Android reales, que las pruebas automáticas no pueden cubrir. La guía de despliegue está en `docs/despliegue.md`, sección 7.

## Checklist

- [x] Sección 7 de `docs/despliegue.md`: claves VAPID, dos servicios cron, cómo probarlos sin esperar, síntomas en "Si algo falla" y renglones en la lista de verificación
- [ ] Prueba local en la PC (pasos abajo)
- [ ] Generar las claves VAPID y cargarlas en la API y en los dos servicios cron de Railway
- [ ] Crear los servicios cron "Recordatorio de salida" (`*/15 * * * *`) y "Recordatorio de bitácora" (`0 0 * * 1`)
- [ ] Prueba en un Android real
- [ ] Prueba en un iPhone real con iOS 16.4 o posterior

## Prueba local en la PC (Chrome)

El push necesita el service worker del build y las claves VAPID en el backend.

1. Genera claves: en `backend/`, `pnpm exec web-push generate-vapid-keys`.
2. Pon las tres variables en `backend/.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:...`) y reinicia el backend.
3. En `frontend/`: `pnpm build` y `pnpm preview --port 5173 --strictPort` (con Vite detenido).
4. Entra como alumno con expediente EN_PROCESO. En el inicio aparece la tarjeta "Recordatorios": toca "Activar recordatorios" y acepta el permiso. Debe decir "Recordatorios activados".
5. Registra una entrada. Para no esperar 6 horas, en la base de desarrollo cambia la hora de entrada de ese turno a 6 h antes (el mismo día en Monterrey) y deja `recordatorio_enviado_en` vacío.
6. En `backend/`: `pnpm job:recordatorio-salida`. Debe llegar la notificación "¿Olvidaste registrar tu salida?". Al tocarla se abre Registrar.
7. Vuelve a correr el job: no debe llegar otra notificación para ese turno.
8. Recarga el inicio: aparece el aviso "¿Olvidaste registrar tu salida?" dentro de la app.
9. `pnpm job:recordatorio-bitacora --forzar` con la bitácora de la semana vacía: llega "Escribe tu bitácora de la semana" y al tocarla abre el historial de esa semana.
10. Cierra sesión y vuelve a correr un job: ya no llegan notificaciones a ese navegador (la suscripción se borró al cerrar sesión).

## Prueba en celulares reales (producción)

- **Android (Chrome):** abre la app, toca "Activar recordatorios" y acepta. Dispara `railway ssh -- node dist/scripts/recordatorioBitacora.js --forzar` con un alumno que tenga asistencia esta semana y la bitácora vacía. La notificación debe llegar con la app cerrada.
- **iPhone (iOS 16.4+):** en Safari, sin instalar, la tarjeta muestra cómo agregar la app a la pantalla de inicio. Instálala, ábrela desde el ícono, entra y activa los recordatorios. Repite el disparo del job: la notificación debe llegar con la app cerrada y abrir la app al tocarla.
- En los dos: cerrar sesión deja de recibir notificaciones en ese celular.

## Fuera de alcance

- Notificaciones para vinculación o supervisores.
- Configurar Railway desde el código: en este proyecto Railway no aplica los archivos de configuración (ver sección 6 de `docs/despliegue.md`).

## Notas

- Las claves VAPID no deben cambiar una vez en producción: al regenerarlas, todas las suscripciones dejan de servir.
- Los servicios cron no heredan variables de la API: hay que copiarles también las tres VAPID.
- Sin claves VAPID la API arranca igual y el push queda apagado (decisión de la tarea 0045).
