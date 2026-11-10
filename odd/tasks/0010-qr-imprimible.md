# 0010 — QR imprimible por institución (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 2 (specs §14) |
| Specs | RF-13, RF-15, RF-29, RNF-06 |
| Proyecto | backend |

## Descripción

Vinculación genera el QR de una institución y lo descarga en un PDF tamaño carta, listo para imprimir y pegar en la entrada. El QR contiene la URL `{FRONTEND_ORIGIN}/s/{token}` y debajo va el código corto de 6 caracteres, para registrarse sin cámara. Como solo se guarda el hash del token (RNF-06), no se puede volver a imprimir el mismo QR: cada llamada genera un token nuevo, y el QR anterior deja de servir. Así también se resuelve el caso del QR filtrado.

## Checklist

### Preparación
- [x] Instalar `qrcode` y `pdfmake`, como indica el stack en `CLAUDE.md`

### Ruta
- [x] `POST /api/instituciones/:id/qr` (vinculación y admin, mismo plantel)
- [x] Generar un token y un código corto nuevos, guardar el hash del token y reemplazar los anteriores en la misma operación (con reintento si hay colisión)
- [x] Responder `application/pdf` como descarga (`qr-<institución>.pdf`)
- [x] PDF tamaño carta: nombre de la institución, QR grande, código corto legible y una instrucción breve para el alumno
- [x] Registro en `AuditLog` (`REGENERAR_QR`, sin token ni hash) (RF-29)

### Pruebas
- [x] El hash guardado cambia y corresponde al token codificado en el QR
- [x] La respuesta es un PDF válido; el token en claro nunca se guarda ni aparece en la auditoría
- [x] 401, 403 (alumno), 404 (otro plantel o inexistente) y 400 (id inválido)
- [x] `pnpm test` y `pnpm typecheck` en verde

## Fuera de alcance

- Pantalla del frontend para imprimir el QR.
- La ruta `/s/{token}` del frontend y el registro por escaneo (RF-14): iteración 3.
- Imprimir el QR de varias instituciones a la vez.

## Notas

- La URL base sale de `FRONTEND_ORIGIN`, que ya existe en la configuración.
- Regenerar cambia el token **y** el código corto: si se filtró la hoja impresa, se filtraron los dos (decisión de vinculación, 2026-11-09). El código anterior deja de servir.
- Contrato `POST /api/instituciones/:id/qr` (sin cuerpo; `VINCULACION` y `ADMIN`, mismo plantel):
  - Responde 200 con el PDF como descarga: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="qr-<nombre>.pdf"` (el nombre pasa a minúsculas, sin acentos, con guiones y sin caracteres no ASCII; si queda vacío, `qr-institucion.pdf`) y `Cache-Control: no-store`.
  - Errores: 401 `UNAUTHORIZED` sin sesión; 403 `FORBIDDEN` para alumno; 404 `NOT_FOUND` si la institución no existe o es de otro plantel; 400 `VALIDATION_ERROR` si `:id` no es uuid; 500 si hay colisión en los 5 intentos (no cambia nada).
  - Cada llamada genera un token **y** un código corto nuevos y reemplaza ambos en una sola transacción junto con la auditoría. El QR y el código anteriores dejan de servir. Solo se guarda el hash SHA-256 del token; el token en claro solo vive en la URL del QR dentro del PDF.
  - El QR codifica `${FRONTEND_ORIGIN}/s/<token>` (sin doble diagonal). La hoja es tamaño carta, blanco y negro, con fuente estándar Helvetica: nombre de la institución, QR grande, "Escanea con la app Praxis o escribe este código" y el código corto en grande.
  - Auditoría: `REGENERAR_QR`, entidad `Institucion`, `entidadId` de la institución, sin `antes` ni `despues` (no hay token, hash ni código).
  - Con el mismo mecanismo de 0008, la regeneración reintenta hasta 5 veces si el código o el hash chocan con otro existente.
- Implementación: `regenerarQrInstitucion` (servicio) devuelve `{ pdf, url, archivo }`; la URL se devuelve solo para poder probar que el hash guardado corresponde al token del QR, sin decodificar la imagen. Dependencias: `qrcode` 1.5.4 y `pdfmake` 0.3.14 (con `@types`).
