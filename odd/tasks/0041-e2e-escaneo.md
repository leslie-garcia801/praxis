# 0041 — Prueba e2e del registro de asistencia con código corto

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (specs §14) |
| Specs | RF-14, RF-15 |
| Proyecto | frontend |

## Descripción

Prueba de Playwright, en los proyectos móviles (iPhone 13 y Pixel 7), del flujo en que el alumno registra su entrada escribiendo el código corto de la institución (RF-15) desde la pantalla "Registrar asistencia" (RF-14) y la ve en su historial. En el navegador de prueba no hay cámara ni se concede permiso: el test usa la alternativa del código corto.

Los datos se crean solo con la API pública (sin rutas de prueba): `seedAlumnoListoParaEscanear()` crea una institución con nombre único, un supervisor, importa un alumno de servicio social, activa su cuenta, completa su expediente (institución, supervisor y `fechaInicio` 2020-01-01) y lo confirma como vinculación, para que quede EN_PROCESO. Al ser servicio social no hay horario ni días pactados, así que el escaneo no depende del día ni de la hora; la fecha de inicio es pasada, así que no importa la diferencia entre UTC y Monterrey (RN-15).

## Checklist

- [x] Helper `seedAlumnoListoParaEscanear()` en `e2e/helpers/seedAlumno.ts` (reutiliza la importación; `seedAlumno` sigue igual)
- [x] `e2e/escaneo.spec.ts`: `RF-15: el alumno registra su entrada con el código corto y la ve en su historial`
- [x] `e2e/escaneo.spec.ts`: `RF-15: un código corto inexistente muestra el mensaje de error`
- [x] Las pruebas se omiten con mensaje si falta la configuración o el backend
- [x] `pnpm test` y `pnpm typecheck` en verde
- [x] `pnpm exec playwright test escaneo` corrido con el backend, la base y Vite levantados: 4 pasan (iPhone 13 y Pixel 7)

## Fuera de alcance

- Escaneo real con la cámara.
- Salida del turno y el tope diario (cubiertos por las pruebas del backend).

## Notas

- Variables: las mismas de la 0005 (`E2E_STAFF_EMAIL`, `E2E_STAFF_PASSWORD`); el usuario debe poder crear instituciones y confirmar expedientes de servicio social.
- El código `000000` nunca existe: el alfabeto de los códigos generados no tiene 0 ni 1.
