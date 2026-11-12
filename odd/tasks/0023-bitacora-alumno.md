# 0023 — Bitácora del alumno y pendientes del inicio (frontend + backend chico)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 4 (specs §14) |
| Specs | RF-18 (punto 5), RF-20, RF-22, RN-17, RNF-01, RNF-09, specs §10 (Alumno, pantallas 2 y 5) |
| Proyecto | frontend (y un endpoint de lectura en backend) |

## Descripción

El alumno escribe la bitácora de cada semana (RF-20), la envía cuando la semana ya cerró (RN-17) y, si su supervisor la rechaza, ve el comentario y la corrige (RF-22). La bitácora vive en la misma pantalla del historial semanal (`/alumno/historial?semana=`), debajo de los turnos: así el alumno ve lo que hizo y escribe sobre eso en un solo lugar. El inicio gana la sección **Pendientes** (RF-18, punto 5) con las semanas que necesitan su atención. Consume las rutas de la 0020 y agrega un endpoint de lectura para los pendientes.

## Checklist

### Backend: `GET /api/semanas/pendientes` (solo `ALUMNO`)
- [x] Semanas del expediente activo del alumno que necesitan algo de él:
  - `RECHAZADA` → motivo `RECHAZADA` (con `comentario`)
  - `BORRADOR` de una semana **cerrada** sin bitácora válida (RN-17, `bitacoraValida`) → motivo `BITACORA_PENDIENTE` (no entrará al resumen del lunes)
  - `BORRADOR` de la **semana en curso** sin bitácora válida → motivo `BITACORA_SEMANA_ACTUAL`
- [x] Respuesta `{ pendientes: [{ id, semanaInicio, semanaFin, estado, motivo, comentario }] }`, de la más reciente a la más antigua. Sin expediente activo → lista vacía
- [x] Pruebas: cada motivo, semana con bitácora válida no aparece, `ENVIADA`/`VALIDADA` no aparecen, 401, 403 (vinculación)

### Frontend: bitácora en el historial
- [x] `features/bitacora/api.ts`: `useGuardarBitacora(semanaId)` (PUT), `useEnviarSemana(semanaId)` (POST), `usePendientes()`. Al guardar o enviar se invalidan el historial, los pendientes y el avance
- [x] Sección **Bitácora** en `HistorialPage`, debajo de los días:
  - Sin semana (`id` nulo) → "La bitácora se habilita con tu primer registro de la semana"
  - `puedeEditar` → área de texto (máximo 5000), contador "N de 50 caracteres mínimos" (sin contar espacios al inicio y al final) y botón **Guardar**
  - Semana en curso → aviso "Podrás enviarla a partir del lunes. Si la dejas lista (50 caracteres o más), se envía sola el lunes a tu supervisor"
  - `puedeEnviar` → botón **Enviar a mi supervisor**; deshabilitado con el aviso de RN-17 si tiene menos de 50 caracteres. Envía lo guardado: si hay cambios sin guardar, primero guarda y luego envía
  - `RECHAZADA` → aviso destacado "Tu supervisor la rechazó: «comentario». Corrígela y vuelve a enviarla" (RF-22)
  - `ENVIADA` → texto de solo lectura y "Enviada a tu supervisor el lunes 16 de noviembre"
  - `VALIDADA` → texto de solo lectura y "Validada por tu supervisor"
- [x] Mensajes de la API en español para los errores (`SEMANA_NO_EDITABLE`, `SEMANA_EN_CURSO`, `BITACORA_INCOMPLETA`, `EXPEDIENTE_NO_ACTIVO`); al salir con cambios sin guardar no se pierde lo escrito sin avisar (aviso de confirmación del navegador o bloqueo de navegación de React Router)

### Frontend: Pendientes en el inicio (RF-18, punto 5)
- [x] Sección **Pendientes** al final de `InicioAlumnoPage` (después del turno y el botón Registrar), solo con expediente `EN_PROCESO` o `SUSPENDIDO`:
  - `RECHAZADA` → "Corrige la bitácora de la semana del 2 al 8 de noviembre" con el comentario
  - `BITACORA_PENDIENTE` → "Escribe la bitácora de la semana del 2 al 8 de noviembre para enviarla"
  - `BITACORA_SEMANA_ACTUAL` → "Escribe la bitácora de esta semana"
  - Cada uno enlaza a `/alumno/historial?semana=<inicio>`; sin pendientes → "No tienes pendientes"
- [x] Las correcciones de turnos (RF-17) se agregan cuando exista esa función

### Pruebas (Vitest + RTL + MSW)
- [x] Guardar borrador (cuerpo del PUT), contador de caracteres, `RN-17: no permite enviar con menos de 50 caracteres`
- [x] Enviar con cambios sin guardar → PUT y luego POST; enviar sin cambios → solo POST
- [x] `RF-22: muestra el comentario de una semana rechazada y permite corregirla`
- [x] Estados `ENVIADA`, `VALIDADA`, semana en curso, semana sin turnos; errores de la API
- [x] Pendientes en el inicio: cada motivo, enlace a la semana, lista vacía, error

## Fuera de alcance
- Página del supervisor `/validar/:token` (0024).
- Correcciones de turnos (RF-17).
- Recordatorio del domingo (RF-28, iteración 6).

## Notas

### Decisiones técnicas
- La bitácora va en la pantalla del historial y no en una pantalla aparte: la semana ya está en la URL y el alumno ve sus turnos mientras escribe.
- Se agrega `GET /api/semanas/pendientes` porque el inicio necesita las semanas rechazadas de cualquier fecha; con el historial solo se podría revisar una semana a la vez.
- `GET /api/semanas/pendientes` se monta antes de las rutas `/:id`. El expediente activo se elige igual que en `me` (estados `PENDIENTE`, `EN_PROCESO`, `SUSPENDIDO`, el más reciente); `ahora` es inyectable en `listarPendientes`.
- Cambios sin guardar: el router es de datos (`createBrowserRouter`), así que se usa `useBlocker` con un aviso en pantalla ("Seguir editando" / "Salir sin guardar") más un `beforeunload` para cerrar la pestaña. También bloquea el cambio de semana dentro del historial.
- "Semana en curso" en la interfaz se decide igual que el historial (`semana.fin >= hoy` en Monterrey): es solo para mostrar el aviso; el servidor rechaza el envío anticipado (`SEMANA_EN_CURSO`).
- Los errores muestran el mensaje en español que manda la API; si no hay respuesta (red caída) se usa un mensaje genérico. Si el guardado previo al envío falla, no se envía.
- Se agregó `components/ui/textarea.tsx` (estilo shadcn, solo Tailwind) sin dependencias nuevas.

### Contrato de la API

`GET /api/semanas/pendientes`, solo `ALUMNO` (401 sin sesión, 403 otro rol). Semanas `BORRADOR` o `RECHAZADA` del expediente activo del alumno, de la más reciente a la más antigua; sin expediente activo devuelve la lista vacía.

```json
{
  "pendientes": [
    {
      "id": "uuid",
      "semanaInicio": "2026-11-02",
      "semanaFin": "2026-11-08",
      "estado": "BORRADOR" | "RECHAZADA",
      "motivo": "RECHAZADA" | "BITACORA_PENDIENTE" | "BITACORA_SEMANA_ACTUAL",
      "comentario": "texto" | null
    }
  ]
}
```

`RECHAZADA` trae el `comentario` del supervisor. `BITACORA_PENDIENTE`: semana cerrada en `BORRADOR` sin bitácora válida (RN-17). `BITACORA_SEMANA_ACTUAL`: semana en curso en `BORRADOR` sin bitácora válida. Una semana en `BORRADOR` con bitácora válida no aparece (entra sola al resumen del lunes).

### Prueba manual

1. Con backend y frontend corriendo, entra como alumno con un expediente `EN_PROCESO` y turnos en la semana en curso y en la anterior.
2. Inicio: en **Pendientes** aparece "Escribe la bitácora de esta semana" y, si la anterior no tiene bitácora, "Escribe la bitácora de la semana del … para enviarla"; cada enlace abre `/alumno/historial?semana=…`.
3. Historial de la semana en curso: escribe menos de 50 caracteres, el contador cuenta sin espacios de los extremos; **Guardar** y recarga la página: el texto sigue ahí. Intenta cambiar de semana con texto sin guardar: aparece el aviso.
4. Semana cerrada: con menos de 50 caracteres **Enviar a mi supervisor** está deshabilitado; con 50 o más, escribe un cambio y envía sin guardar (guarda y envía). Aparece "Enviada a tu supervisor el …" y el texto queda de solo lectura; el pendiente desaparece del inicio.
5. Rechazo: marca la semana `RECHAZADA` con un comentario en la base; el inicio y el historial muestran el comentario, corrige y vuelve a enviar.
