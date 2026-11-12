# 0029 — PDF de horas y actividades (backend + frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (specs §14) |
| Specs | RF-27, RN-03b, RN-15, specs §9 |
| Proyecto | backend y frontend |

## Descripción

Reporte en PDF (tamaño carta) por expediente y rango de fechas opcional, que complementa los formatos de Edumedia. Solo incluye **turnos de semanas validadas** y las bitácoras de esas semanas. Las horas acumuladas se calculan por consulta (specs 8.4), nunca se guardan.

## Checklist

### Backend
- [x] `GET /api/expedientes/:id/reporte.pdf?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` (`ALUMNO`, `VINCULACION`, `ADMIN`). Permisos con `cargar` del módulo de expedientes: alumno solo el suyo, vinculación solo su oficina (RN-03b) → 403; otro plantel o inexistente → 404
- [x] Fechas opcionales validadas con Zod (400); `desde` > `hasta` → 400 `RANGO_INVALIDO` con mensaje en español. El día de un turno es la fecha local (Monterrey) de su entrada (RN-15)
- [x] `domain/reportePdf.ts`: constructor puro de la definición de pdfmake (encabezado, datos del alumno, institución y supervisor, tabla de turnos, bitácoras, totales y firmas: supervisor y línea "Oficina de Vinculación" sin nombre)
- [x] `lib/pdf.ts`: configuración compartida de pdfmake (fuentes estándar, sin acceso remoto); `qrPdf.ts` la reutiliza
- [x] Respuesta `application/pdf`, `Content-Disposition: attachment; filename="reporte-<matrícula>-AAAA-MM-DD.pdf"`, `Cache-Control: no-store`
- [x] Pruebas: caso feliz, 400, 401, 403 (otro alumno, `RN-03b`), 404; constructor (`RN-15`, solo VALIDADA, rango, rango vacío, firmas)

### Frontend
- [x] `useDescargarReporte` (`downloadFile`) y componente `DescargarReporte` con "Desde" / "Hasta", validación `desde <= hasta`, "Descargando…" y error de la API
- [x] Pantalla de avance del alumno: reporte de su expediente
- [x] Tabla del panel: botón "Reporte" por fila que despliega el componente en una fila inline (no hay componente de diálogo en `components/ui`, solo `alert-dialog`)
- [x] Pruebas con MSW

## Decisiones
- Una bitácora entra al reporte si alguno de los siete días de su semana cae en el rango.
- Solo se listan turnos `CERRADA` de semanas `VALIDADA`; el total del periodo suma sus minutos acreditables.
