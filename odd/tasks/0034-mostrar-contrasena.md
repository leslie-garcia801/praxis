# 0034 — Mostrar u ocultar la contraseña

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 5 (pendientes) |
| Specs | RF-03, RF-04, RNF-09 |
| Proyecto | frontend |

## Descripción

En el celular es fácil escribir mal la contraseña (mayúscula automática, autocorrector, espacio al final) sin poder revisarla. Todos los campos de contraseña tienen ahora un botón con ícono de ojo para mostrarla u ocultarla.

## Checklist
- [x] `Field` acepta un control opcional a la derecha del input (`trailing`)
- [x] Componente `PasswordField`: botón `type="button"` con `aria-label` ("Mostrar contraseña" / "Ocultar contraseña"), `aria-pressed` y área táctil de 44 px; desactiva mayúscula automática y autocorrector
- [x] Usado en iniciar sesión (1), cambiar contraseña (3) y activar cuenta (2)
- [x] Pruebas del componente: empieza oculta, alterna, no envía el formulario
- [x] e2e `activar.spec.ts`: el selector de "Contraseña" usa `exact: true` para no chocar con el botón

## Notas
- El botón solo cambia el `type` del input; el valor no se pierde al alternar.
