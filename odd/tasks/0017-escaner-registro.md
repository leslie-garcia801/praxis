# 0017 — Registrar asistencia: escáner QR y código corto (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 3 (specs §14) |
| Specs | RF-14, RF-15, RN-04, RN-09, RN-15, RNF-03, RNF-09, specs §10 (Alumno, pantalla 3) |
| Proyecto | frontend |

## Descripción

Reemplaza el marcador de `/alumno/registrar` por la pantalla para registrar entrada o salida. Al llegar (el alumno tocó "Registrar" en el inicio) se abre la cámara y se lee el QR de la institución con `@zxing/browser`; siempre se ofrece escribir el código corto de 6 caracteres (RF-15). Llama a `POST /api/asistencias/escaneo` (tarea 0014) y muestra la confirmación con la hora y las horas del día (RF-14). El servidor decide si es entrada o salida y calcula los minutos; el frontend solo muestra el resultado.

## Checklist

### Base
- [x] Instalar `@zxing/browser` (está en la lista del stack de CLAUDE.md)
- [x] `features/escaneo/api.ts`: `useRegistrarEscaneo()` (mutación con `apiFetch`); al terminar con éxito invalida `me` y `avance`
- [x] `parseQr(texto)`: extrae el token de una URL `…/s/{token}` (formato de RF-13 y `urlQr` del backend); cualquier otro texto → "Este código QR no es de Praxis"; con pruebas

### Pantalla `/alumno/registrar`
- [x] Modo cámara (por defecto): vista de la cámara trasera con `@zxing/browser`, detrás de un hook `useQrScanner` para poder simularlo en pruebas; se detiene al leer un código y al salir de la pantalla
- [x] Sin permiso de cámara, sin cámara o error al abrirla → mensaje claro y cambio al modo código
- [x] Modo código: campo de 6 caracteres (se convierte a mayúsculas, validado con Zod) y botón "Registrar"; enlace visible "Escribir el código" / "Usar la cámara" para cambiar de modo
- [x] Cada intento genera un `id` con `crypto.randomUUID()`. "Reintentar" tras un error de red reutiliza el mismo `id`, para que el servidor no duplique el registro (idempotencia de la 0014)
- [x] Mientras se envía: estado "Registrando…" y botón deshabilitado (evita dobles envíos)

### Confirmación (RF-14)
- [x] Entrada: "Entrada registrada a las 10:11"
- [x] Salida: "Salida registrada a las 16:18" y "Hoy llevas 3 h 20 min acreditadas" (`minutosAcreditablesDia`)
- [x] RN-04: si `excedente > 0`, aviso "Solo se acreditan 5 h por día; X h no cuentan"
- [x] RN-09: si es salida y el turno quedó con 0 minutos acreditables, aviso "El turno duró menos de 15 minutos y no se acredita"
- [x] Botón "Volver al inicio"

### Errores
- [x] Se muestra el `message` en español que devuelve la API (`QR_NO_ENCONTRADO`, `QR_DE_OTRA_INSTITUCION`, `EXPEDIENTE_SUSPENDIDO`, `ANTES_DE_FECHA_INICIO`, etc.) con opción de intentar de nuevo
- [x] Error de red: "No hay conexión. Intenta de nuevo." con "Reintentar" (mismo `id`)

### Pruebas (Vitest + RTL + MSW; `@zxing/browser` simulado)
- [x] `parseQr`: URL válida, URL con barra final, texto ajeno, URL sin token
- [x] Modo código: entrada (201), salida (200) con horas del día, excedente RN-04, turno de 0 min RN-09, error de la API, validación del campo
- [x] Modo cámara: lectura simulada → envío con `token`; QR ajeno → mensaje; permiso denegado → modo código
- [x] Reintento tras error de red con el mismo `id`
- [x] Nombres con la regla: `RN-04: avisa el excedente del tope diario`, `RN-09: avisa que un turno de menos de 15 minutos no se acredita`

## Fuera de alcance
- Registro sin conexión y cola en IndexedDB (RF-16): iteración 6.
- Abrir la app desde la cámara del teléfono con la URL `/s/{token}` (segunda parte de RF-14): iteración 6, porque necesita resolver el inicio de sesión intermedio.
- HTTPS en el servidor de desarrollo para probar la cámara desde un celular por la red local: se decide aparte, porque requiere un plugin nuevo.
- Prueba Playwright del flujo de escaneo con código corto: necesita sembrar un expediente `EN_PROCESO` con institución; tarea aparte.

## Notas

### Decisiones técnicas
- La cámara se pide al entrar a `/alumno/registrar`, que solo se abre al tocar "Registrar" (frontend/CLAUDE.md).
- El token del QR nunca se muestra en pantalla.
- Se agregó `@zxing/library@0.23.0` (peer obligatorio de `@zxing/browser@0.2.1`).
- RN-09: el aviso se muestra cuando es salida y `asistencia.minutosAcreditables === 0`.
- `parseQr` acepta tokens base64url de 16 a 200 caracteres.

### Prueba manual
En escritorio, con el backend (`pnpm dev` en `backend/`) y el frontend (`pnpm dev` en `frontend/`) corriendo, inicia sesión como un alumno con expediente `EN_PROCESO`:
1. Toca "Registrar" en el inicio. El navegador pide permiso de cámara (localhost cuenta como contexto seguro). Para probar el QR, muestra a la webcam el PDF del QR de la institución.
2. Sin webcam o con el permiso negado, la pantalla cambia sola al modo código. También puedes tocar "Escribir el código" y escribir el código corto de 6 caracteres de la institución (en minúsculas también sirve).
3. Repite el registro: la primera vez es entrada y la siguiente salida; el inicio se actualiza al volver.
4. Error de red: con el backend detenido, el envío muestra "No hay conexión. Intenta de nuevo."; al levantarlo, "Reintentar" reenvía con el mismo `id`.

