# 0054 — Guías del piloto y encuesta final

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 7 (specs §14) |
| Specs | §12 (piloto y métricas de éxito), §13 #7 y #8, RNF-07 |
| Proyecto | documentación |

## Descripción

Documentos para llevar el piloto con Programación: una guía para las responsables del piloto (preparación, calendario, métricas, problemas frecuentes y cierre), una guía rápida por rol (alumno, supervisor y vinculación) y la encuesta final que mide la utilidad percibida (meta ≥ 4.5). Describen solo lo que la app hace hoy; los nombres de pantallas y botones salen del código del frontend.

## Checklist

- [x] `docs/piloto.md`: qué es el piloto, lista previa con responsable, calendario semana a semana, métricas (comando y comparación con el papel), tabla "Qué hacer si…" y cierre
- [x] `docs/guias/alumno.md`: activar, instalar, expediente, registrar, sin señal, bitácora, correcciones, recordatorios, tema
- [x] `docs/guias/supervisor.md`: correo del lunes, enlace de 14 días, validar o rechazar, validar todo
- [x] `docs/guias/vinculacion.md`: panel, expedientes, detalle del alumno, correcciones, importaciones, QR, exportaciones, firmas y métricas
- [x] `docs/encuesta-piloto.md`: tres cuestionarios, cálculo de la métrica y nota de anonimato (RNF-07)
- [x] Sección "Guías" en `README.md`

## Fuera de alcance

- Cambios de código o de `docs/specs.md`.
- Actualizar `docs/flujo-app.md`, que quedó desactualizado en varios puntos.
- Texto definitivo del aviso de privacidad (§13 #7) y confirmación de cada institución sobre el QR (§13 #8): son pendientes de las oficinas, listados en la guía del piloto.

## Notas

- El aviso de privacidad que muestra la app al activar la cuenta es provisional; la guía del piloto lo pide como paso previo.
- Las métricas 1 a 3 salen de `pnpm job:metricas-piloto` (tarea 0053); la 4 y la 5 son manuales.
- Pendiente fuera de la tarea: que una persona de cada rol lea su guía antes del piloto.
