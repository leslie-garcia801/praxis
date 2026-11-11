# 0018 — Completar expediente (frontend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 3 (specs §14) |
| Specs | RF-09, RF-10, RN-15, RNF-01, RNF-09, specs §10 (Alumno, pantalla 7) |
| Proyecto | frontend |

## Descripción

Reemplaza el marcador de `/alumno/expediente` por el formulario con el que el alumno completa su expediente mientras está `PENDIENTE` (RF-10): institución, supervisor (o darlo de alta si no aparece, RF-09), departamento, fecha de inicio y, según el tipo, los datos de prácticas (fecha de término y horario pactado) o de servicio social (programa y subprograma). Consume los endpoints de la tarea 0012. Las reglas de negocio (institución activa que acepta el tipo, supervisor de la institución, periodo, horario, RN-01) las valida el backend; el formulario solo valida formato y muestra los errores de la API.

## Checklist

### Base
- [x] `features/expediente/api.ts`: `useExpediente(id)` (`GET /api/expedientes/:id`), `useGuardarExpediente(id)` (`PATCH`), `useSupervisores(institucionId)` (`GET /api/instituciones/:id/supervisores`), `useCrearSupervisor(institucionId)` (`POST`). Al guardar se invalidan `me`, el expediente y el avance
- [x] Reutilizar `useInstituciones` de `features/instituciones/api.ts` con `tipo` del expediente y búsqueda `q` (el alumno solo recibe instituciones activas)
- [x] `schemas.ts` (Zod, mensajes en español): fecha `AAAA-MM-DD`, hora `HH:mm`, al menos un día pactado en prácticas, fecha de término posterior a la de inicio, hora de entrada anterior a la de salida (validación de formulario; el backend vuelve a validar)

### Pantalla `/alumno/expediente`
- [x] `PENDIENTE` → formulario precargado con lo ya guardado; otros estados → resumen de solo lectura del expediente con el aviso "Tu expediente ya fue confirmado; para cambios acude a vinculación" (o "suspendido")
- [x] Sin expediente activo → "No tienes un expediente activo. Acude a vinculación."
- [x] **Institución:** buscador de texto que filtra la lista y selección con botones de opción (nombre y municipio). Al cambiar de institución se limpia el supervisor elegido
- [x] **Supervisor:** lista de la institución elegida; opción "Mi supervisor no aparece" que abre un mini formulario (nombre, apellido paterno, correo obligatorios; título, apellido materno, puesto, departamento, teléfono, extensión opcionales). Al crearlo queda seleccionado, con el aviso "Vinculación revisará los datos de tu supervisor" (RF-10)
- [x] **Departamento** (opcional) y **fecha de inicio**
- [x] **Prácticas:** fecha de término, días pactados (casillas lunes a domingo, 1–7) y horas de entrada y salida
- [x] **Servicio social:** programa y subprograma (opcionales)
- [x] Guardar envía solo los campos del tipo (el PATCH es estricto: los de otro tipo dan 400 `CAMPOS_NO_APLICABLES`)
- [x] Tras guardar: si `faltantes` está vacío → "Listo. Vinculación revisará tu expediente para confirmarlo"; si no → lista de lo que falta con nombres en español
- [x] Errores de la API: se muestra su `message` en español (`INSTITUCION_NO_ACEPTA_TIPO`, `SUPERVISOR_DE_OTRA_INSTITUCION`, `PERIODO_INVALIDO`, `EXPEDIENTE_NO_EDITABLE`…)
- [x] Estados de carga y error con "Reintentar" para el expediente, las instituciones y los supervisores
- [x] Botón "Volver al inicio"

### Pruebas (Vitest + RTL + MSW)
- [x] Servicio social: elegir institución, elegir supervisor existente, fecha de inicio, guardar → cuerpo del PATCH correcto y mensaje de listo
- [x] Prácticas: días y horario en el cuerpo; validación de hora de entrada < salida y de fecha de término > inicio
- [x] Alta de supervisor: POST con los datos, queda seleccionado y aparece el aviso de revisión
- [x] Cambiar de institución limpia el supervisor
- [x] Respuesta con `faltantes` no vacío y error de la API (`SUPERVISOR_DE_OTRA_INSTITUCION`)
- [x] Precarga de un expediente con datos; solo lectura en `EN_PROCESO`; sin expediente activo; cargando y error

## Fuera de alcance
- Catálogo de instituciones con filtros y ficha para el alumno (specs §10, pantalla 6).
- Historial (0019).
- Avisos de RN-06 (duración) en el formulario: depende de la pregunta abierta #1 de specs §13.

## Notas

### Decisiones técnicas
- Los campos de fecha y hora usan `<input type="date">` y `<input type="time">` nativos: en el celular abren el selector del sistema y entregan `AAAA-MM-DD` y `HH:mm`, el formato que espera la API.
- Se usan controles nativos (botones de opción y casillas) con estilos de Tailwind; no se agregan componentes de shadcn nuevos salvo que hagan falta.

### Prueba manual
1. Con backend y frontend en marcha, entra como alumno con expediente `PENDIENTE` y abre `/alumno/expediente` (o "Completar expediente" desde el inicio).
2. Busca y elige una institución; elige un supervisor de la lista o "Mi supervisor no aparece" y captura nombre, apellido paterno y correo: queda seleccionado con el aviso de revisión.
3. Captura fecha de inicio (y en prácticas: término, días y horas) y guarda: aparece "Listo..." o la lista de lo que falta.
4. Cambia de institución: el supervisor se limpia. Provoca un error de la API (supervisor de otra institución) y verifica que se muestra su mensaje.
5. Con un expediente `EN_PROCESO` o `SUSPENDIDO` la pantalla es de solo lectura con su aviso.

### Decisiones de implementación
- El formulario guarda parcial: solo se exige un día pactado en prácticas; lo demás se completa y la API devuelve `faltantes`.
- Los textos opcionales vacíos se envían como `null`; `supervisorId` siempre se envía (`null` si no hay) para que cambiar de institución no deje un supervisor ajeno.
- El supervisor recién creado (pendiente) no aparece en el listado del alumno, así que se conserva localmente y queda seleccionado.
- El buscador de instituciones consulta la API en cada cambio de texto, sin retardo.
