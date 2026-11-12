# 0024 — Página de validación del supervisor (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 4 (specs §14) |
| Specs | RF-21, RF-21a, RF-22, RN-06b, RN-15, RNF-01, RNF-09, specs §10 (Supervisor, pantalla 1) |
| Proyecto | frontend |

## Descripción

Reemplaza el marcador de `/validar/:token` por la página que abre el supervisor desde el correo semanal, en el celular o en la computadora, **sin cuenta** (RF-21). Muestra las semanas de sus alumnos con los turnos y la bitácora, y permite **Validar todo**, **Validar** o **Rechazar** con comentario obligatorio, todas a la vez o una por una (RF-21a). Consume `GET` y `POST /api/validacion/:token` (tarea 0021, ver "Contrato de la API"). Con esta tarea se hace la prueba manual de punta a punta que quedó pendiente en la 0021.

## Checklist

### Base
- [x] `features/validacion/api.ts`: `useEnlaceValidacion(token)` (`GET`) y `useResolverSemanas(token)` (`POST`). Al resolver se vuelve a pedir el enlace para mostrar los estados actuales
- [x] La ruta sigue pública (fuera de los guardias de rol) y no usa la sesión: funciona aunque haya un alumno o vinculación con sesión abierta en ese navegador
- [x] El token nunca se muestra en pantalla ni se manda a otro lado que no sea la API

### Página `/validar/:token`
- [x] Encabezado: "Hola, Laura Mendoza", cuántas semanas hay pendientes y la fecha de vencimiento del enlace ("Este enlace vence el miércoles 25 de noviembre")
- [x] Una tarjeta por semana, agrupadas por alumno: nombre y carrera, institución, "Semana del 2 al 8 de noviembre", total de horas acreditadas
  - Turnos por día: "lunes 2 · 08:00 – 14:00 · 6 h". RN-06b: los turnos con `fueraDeHorario` llevan la etiqueta **"Fuera del horario pactado"** (el turno cuenta igual; solo es para que lo revise)
  - Turno abierto o incompleto: "Sin salida registrada"
  - Bitácora con su texto completo (respetando saltos de línea)
- [x] Semana `ENVIADA`: botones **Validar** y **Rechazar**. Rechazar abre un campo de comentario obligatorio (mínimo 5 caracteres, validado antes de enviar) y el botón **Confirmar rechazo**
- [x] **Validar todo** arriba de la lista: valida en un solo envío todas las semanas `ENVIADA`, con confirmación ("Vas a validar N semanas")
- [x] Semana ya resuelta: sin botones, con "Validada" o "Rechazada" (también si otro la resolvió antes: resultado `YA_RESUELTA` → "Esta semana ya se había resuelto")
- [x] Cuando ya no quedan semanas `ENVIADA`: "Listo, no tienes semanas pendientes. Gracias."
- [x] Errores: `ENLACE_NO_VALIDO` → "Este enlace no es válido."; `ENLACE_VENCIDO` → "Este enlace venció. Usa el del correo más reciente." (pantallas completas, sin botones); otros errores de la API con su mensaje y "Reintentar"; estado de carga
- [x] Diseño para celular (360 px) y legible en escritorio; botones grandes; contraste AA

### Pruebas (Vitest + RTL + MSW)
- [x] Carga y muestra semanas, turnos, bitácora y vencimiento
- [x] `RN-06b: muestra la etiqueta de turno fuera del horario pactado`
- [x] Validar una semana → cuerpo del POST correcto y la semana pasa a "Validada"
- [x] `RF-22: rechazar exige un comentario de al menos 5 caracteres`; rechazo enviado con el comentario
- [x] Validar todo → una sola petición con todas las `ENVIADA`; las ya resueltas no se incluyen
- [x] `YA_RESUELTA`; enlace no válido (404); vencido (410); error con reintento; cargando; sin pendientes
- [x] Funciona sin sesión (no llama a `/api/me`)

## Prueba manual de punta a punta (pendiente de la 0021)
A partir del lunes 16 de noviembre, cuando cierre la semana de Ana:
1. Ana envía su semana desde el historial (o se envía sola si su bitácora tiene 50 caracteres o más).
2. `cd backend && pnpm job:resumen-semanal --forzar` → el correo aparece en la consola con el enlace.
3. Abrir el enlace en otra ventana (o de incógnito) y validar o rechazar.
4. Validada → el avance de Ana muestra esas horas como validadas. Rechazada → Ana ve el comentario en el historial y en sus pendientes.

## Fuera de alcance
- Validación por vinculación en nombre del supervisor (RF-22): iteración 5.
- Correcciones de turnos (RF-17).

## Notas

### Decisiones técnicas
- Los turnos se muestran con la hora de Monterrey (RN-15), aunque el supervisor abra el enlace desde otra zona horaria.

> Prueba manual de punta a punta: pendiente por decisión de la usuaria (2026-11-11); se hará a partir del lunes 16 de noviembre con los pasos de arriba (cubre también la 0021).
