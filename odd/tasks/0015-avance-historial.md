# 0015 — Avance del expediente e historial semanal (backend)

| Campo | Valor |
| --- | --- |
| Estado | Terminada |
| Iteración | 3 (specs §14) |
| Specs | RF-18, RF-19, RN-03b, RN-04, RN-11, RN-15, RN-16, specs §8.4, specs §9 |
| Proyecto | backend |

## Descripción

Expone por la API el cálculo de horas que ya existe en `domain/horas.ts` (tarea 0002): el avance del expediente (horas validadas, registradas sin validar, faltantes, porcentaje, fecha estimada de término y turno abierto) y el historial de asistencias de una semana. Son los datos que necesitan la pantalla de inicio del alumno (RF-18) y el historial (RF-19). No se guarda ningún total: todo se calcula con consultas (specs §8.4).

## Checklist

### Avance: `GET /api/expedientes/:id/avance` (RF-18, RN-11, RN-16)
- [x] Roles `ALUMNO`, `VINCULACION`, `ADMIN`. Reutiliza `cargar()`: el alumno solo ve su expediente; vinculación solo los de su oficina (RN-03b); fuera del plantel → 404
- [x] `metaMinutos = metaHoras × 60`
- [x] `minutosValidados` = suma de `minutosAcreditables` de asistencias en semanas `VALIDADA` + `minutosTransferidos` (§8.4). Se reutiliza `minutosValidados()` de `expedientes.service.ts`
- [x] `minutosRegistrados` = suma de `minutosAcreditables` de asistencias cuya semana no está `VALIDADA` (o sin semana asignada). Incluye `CERRADA`; `INCOMPLETA` aporta 0 (RN-08) (RN-11)
- [x] `minutosFaltantes = max(0, metaMinutos − minutosValidados)`
- [x] `porcentaje` = validados ÷ meta, entero redondeado hacia abajo, con tope 100
- [x] Fecha estimada con `estimarFechaTermino()` (RN-16): `{ tipo: 'COMPLETADO' | 'SIN_DATOS' | 'ESTIMADA', fecha?, promedioMinutosDia? }`. `minutosPorDia` sale de los minutos acreditables por día local (America/Monterrey) del expediente. La estimación usa `max(0, metaMinutos − minutosValidados − minutosRegistrados)` (ver Notas)
- [x] `turnoAbierto`: `{ id, entrada }` del turno `ABIERTA`, o `null` (RF-18, punto 4)

### Historial: `GET /api/asistencias?semana=AAAA-MM-DD&expedienteId=` (RF-19)
- [x] Roles `ALUMNO`, `VINCULACION`, `ADMIN`
- [x] `semana` opcional: cualquier fecha; se normaliza al lunes de esa semana (lunes a domingo, hora de Monterrey, RF-20/RN-15). Sin `semana` → semana actual
- [x] Alumno: `expedienteId` opcional; por defecto su expediente activo (o el más reciente). Si manda uno ajeno → 403
- [x] Vinculación/admin: `expedienteId` obligatorio (400 si falta); se valida la oficina (RN-03b)
- [x] Respuesta: la semana (`inicio`, `fin`, `estadoValidacion` de su `SemanaBitacora` o `null` si aún no existe), los 7 días con sus turnos (`id`, `entrada`, `salida`, `estado`, `minutosAcreditables`, `sinConexion`), `minutosDia` y `minutosAcreditablesDia` por día, y los totales de la semana
- [x] Los turnos se agrupan por el día local de su `entrada`

### Utilidades de tiempo
- [x] `inicioSemana(fecha: FechaISO): FechaISO` (lunes) en `lib/tiempo.ts`, con pruebas (domingo → lunes anterior, lunes → mismo día, cambio de año)

### Pruebas
- [x] Dominio/servicio con nombres de regla: `RN-11: separa horas validadas de registradas`, `RN-16: sin datos suficientes con menos de 5 días`, `RN-16: estima la fecha con el promedio de 28 días`, `RN-04: el historial muestra el excedente pero acredita máximo 300 min`, `RN-03b: vinculación de otra oficina recibe 403`
- [x] Cada ruta: caso feliz, validación inválida (400), sin sesión (401), rol/propiedad incorrectos (403)
- [x] Fechas fijas con `vi.setSystemTime()`

## Fuera de alcance
- Alerta "en riesgo" (RN-06a): depende de la pregunta abierta #1 (duración máxima).
- Pendientes de la pantalla de inicio (bitácora de la semana, correcciones): iteración 4.
- Crear `SemanaBitacora` y asignar `semanaId` a las asistencias: iteración 4. Mientras tanto, `minutosValidados` vale `minutosTransferidos` en datos reales.
- Pantallas del frontend (inicio, escáner, historial): tarea siguiente.

## Notas

### Decisiones técnicas
- El historial se arma con el día local de `entrada`, no con `semanaId`, porque las semanas todavía no se materializan.
- `/api/me` no cambia: ya devuelve `expedienteActivo` y el frontend pide el avance con su `id`.
- El avance se calcula en `expedientes.service.ts` para reutilizar `cargar()` y `minutosValidados()` sin exportarlos.

- **Faltantes para la fecha estimada (RN-16), decidido el 2026-11-11 por la usuaria:** la estimación usa meta − (validadas + registradas), porque refleja el ritmo real del alumno aunque el supervisor no haya validado. Las "horas faltantes" que se muestran siguen siendo meta − validadas (RN-11: solo las validadas cuentan para finalizar).

### Contrato de la API (para el frontend)

Las respuestas vienen envueltas. Las horas son siempre minutos enteros; las fechas de calendario son `AAAA-MM-DD` (America/Monterrey) y los instantes ISO 8601 en UTC.

`GET /api/expedientes/:id/avance`, roles `ALUMNO` (solo el suyo), `VINCULACION` (solo su oficina, RN-03b) y `ADMIN`.

```json
{
  "avance": {
    "expedienteId": "uuid",
    "metaMinutos": 28800,
    "minutosValidados": 0,
    "minutosRegistrados": 0,
    "minutosFaltantes": 28800,
    "porcentaje": 0,
    "fechaEstimada": { "tipo": "COMPLETADO" } | { "tipo": "SIN_DATOS" } | { "tipo": "ESTIMADA", "fecha": "2027-03-01", "promedioMinutosDia": 43 },
    "turnoAbierto": { "id": "uuid", "entrada": "2026-11-11T14:00:00.000Z" } | null
  }
}
```

`minutosValidados` incluye `minutosTransferidos`; `minutosFaltantes = max(0, meta - validados)`; `porcentaje` es entero hacia abajo con tope 100; `fechaEstimada` usa `meta - validados - registrados` (RN-16). Errores: 400 `VALIDATION_ERROR` (id no uuid), 401 `UNAUTHORIZED`, 403 `FORBIDDEN` (otro alumno u otra oficina), 404 `NOT_FOUND` (fuera del plantel).

`GET /api/asistencias?semana=AAAA-MM-DD&expedienteId=<uuid>`, roles `ALUMNO`, `VINCULACION` y `ADMIN`.

- `semana` opcional: cualquier fecha, se normaliza a su lunes; sin ella, la semana actual (hora de Monterrey).
- `ALUMNO`: `expedienteId` opcional; por defecto su expediente activo (`PENDIENTE`, `EN_PROCESO`, `SUSPENDIDO`, el más reciente) o, si no hay, el más reciente de cualquier estado. Sin ningún expediente: 404 `EXPEDIENTE_NO_ENCONTRADO`. Un `expedienteId` ajeno: 403.
- `VINCULACION` / `ADMIN`: `expedienteId` obligatorio (400 `VALIDATION_ERROR` si falta); vinculación solo ve su oficina (403, RN-03b); fuera del plantel: 404.

```json
{
  "semana": {
    "inicio": "2026-11-09",
    "fin": "2026-11-15",
    "estadoValidacion": "BORRADOR" | "ENVIADA" | "VALIDADA" | "RECHAZADA" | null,
    "dias": [
      {
        "fecha": "2026-11-09",
        "turnos": [
          { "id": "uuid", "entrada": "ISO", "salida": "ISO" | null, "estado": "ABIERTA" | "CERRADA" | "INCOMPLETA", "minutosAcreditables": 120, "sinConexion": false }
        ],
        "minutosDia": 120,
        "minutosAcreditablesDia": 120
      }
    ],
    "totales": { "minutos": 120, "minutosAcreditables": 120 }
  }
}
```

`dias` siempre trae 7 elementos (lunes a domingo), con `turnos: []` en los días sin registros. `minutosDia` incluye el excedente sobre el tope (RN-09 aplicado); `minutosAcreditablesDia` es el valor con tope de 300 (RN-04). `minutosAcreditables` de un turno `ABIERTA` es `null`. `estadoValidacion` es `null` mientras no exista la `SemanaBitacora` (iteración 4). Un turno que cruza la medianoche se lista en el día de su entrada, pero sus minutos se reparten entre ambos días en `minutosDia`.


### Prueba manual con curl (completada 2026-11-11)

Con el expediente de prueba de la 0014 (un turno de 6 min y otro abierto):

- Avance del alumno → 200: `metaMinutos` 28800, validados 0, registrados 0, faltantes 28800, 0 %, `SIN_DATOS`, `turnoAbierto` con el turno abierto.
- Historial sin parámetros → semana 2026-11-09 a 2026-11-15, `estadoValidacion` null, 7 días, 2 turnos el 2026-11-11, totales en 0.
- `semana=2026-11-15` (domingo) → lunes 2026-11-09; `semana=2026-11-04` → 2026-11-02 a 2026-11-08, sin turnos.
- Vinculación: avance → 200; historial sin `expedienteId` → 400; con `expedienteId` → la misma semana.
- Alumno con expediente ajeno (avance e historial) → 403; `semana=hola` → 400; sin sesión → 401.
